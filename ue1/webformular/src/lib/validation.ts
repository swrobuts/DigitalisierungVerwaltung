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
