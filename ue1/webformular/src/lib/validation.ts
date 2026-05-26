// Pragmatische Validations-Helper für UE1.
// IBAN: Mod-97-Check (Format + Prüfziffer).

export function isEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
}

export function isPLZ(v: string): boolean {
  return /^[0-9]{5}$/.test(v.trim());
}

export function isPositiveNumber(v: number | null | undefined): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * IBAN-Validierung nach ISO 13616 mit Mod-97-Prüfziffer.
 * Whitespace wird entfernt, Großbuchstaben erzwungen.
 */
export function isIBAN(raw: string): boolean {
  const v = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  // Rotation: ersten 4 Zeichen nach hinten
  const rearranged = v.slice(4) + v.slice(0, 4);
  // Buchstaben → Zahlen (A=10, B=11, …, Z=35)
  let num = "";
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) num += ch;
    else if (code >= 65 && code <= 90) num += String(code - 55);
    else return false;
  }
  // Mod-97 stückweise (große Zahlen)
  let remainder = 0;
  for (const digit of num) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** Liefert ein Map<feldname, fehlerString>, leer wenn alles OK. */
export type FieldErrors = Record<string, string | undefined>;

export function nonEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Live-Validation eines einzelnen Feldes — gibt ein Tristate zurück:
 *   - "leer"  : noch nichts eingegeben oder noch nicht „berührt"
 *   - "ok"    : Pflichterfüllt + Format gültig → grüner Rand + ✓
 *   - "fehler": Pflicht/Format verletzt       → roter Rand + ×
 *
 * Wird in Phase1Antragsteller etc. pro Eingabefeld aufgerufen, sodass die
 * Rückmeldung sofort beim Tippen erscheint (kein Wartezustand bis „Weiter").
 */
export type FieldState = "leer" | "ok" | "fehler";

export type FieldKind =
  | "pflicht"
  | "email"
  | "plz"
  | "iban"
  | "telefon"
  | "optional";

/**
 * Aggregierter Section-Status für CollapsibleSection-Badges.
 * Zählt Pflichtfelder, ok-Felder, Fehler — und liefert ein passendes
 * Status-Objekt: „3/3 ✓" / „in Bearbeitung 1/3" / „1 Fehler".
 *
 * Optional `hatHardError`: Wenn der Parent nach Submit explizite Fehler
 * im errors-Record gesetzt hat, kann das den Status auf „error" zwingen.
 */
export type FieldSpec = { value: string; kind: FieldKind };
export type SectionAggKind = "ok" | "todo" | "error";
export type SectionAggInfo = { ok: number; total: number; fehler: number };
export type SectionLabelFn = (kind: SectionAggKind, info: SectionAggInfo) => string;

export function aggregateSection(
  felder: FieldSpec[],
  hatHardError = false,
  labelFn?: SectionLabelFn,
): { kind: SectionAggKind; label: string } {
  const pflicht = felder.filter((f) => f.kind !== "optional");
  let ok = 0;
  let fehler = 0;
  for (const f of pflicht) {
    const s = fieldState(f.value, f.kind);
    if (s === "ok") ok++;
    else if (s === "fehler") fehler++;
  }
  const total = pflicht.length;
  const info: SectionAggInfo = { ok, total, fehler };
  if (fehler > 0 || hatHardError) {
    const kind: SectionAggKind = "error";
    return {
      kind,
      label: labelFn?.(kind, info) ?? (fehler > 0 ? `${fehler} Fehler` : "Bitte prüfen"),
    };
  }
  if (ok === total) {
    const kind: SectionAggKind = "ok";
    return { kind, label: labelFn?.(kind, info) ?? `${ok}/${total}` };
  }
  const kind: SectionAggKind = "todo";
  return { kind, label: labelFn?.(kind, info) ?? `${ok}/${total}` };
}

export function fieldState(value: string, kind: FieldKind): FieldState {
  const v = value?.trim() ?? "";
  if (kind === "optional") return v ? "ok" : "leer";
  if (!v) return "leer";
  switch (kind) {
    case "pflicht":
      return "ok";
    case "email":
      return isEmail(v) ? "ok" : "fehler";
    case "plz":
      return isPLZ(v) ? "ok" : "fehler";
    case "iban":
      return isIBAN(v) ? "ok" : "fehler";
    case "telefon":
      // Pragmatisch: mind. 6 Ziffern (mit Spaces/+/-/() toleriert)
      return /[0-9].*[0-9].*[0-9].*[0-9].*[0-9].*[0-9]/.test(v) ? "ok" : "fehler";
  }
}
