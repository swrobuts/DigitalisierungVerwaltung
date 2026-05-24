/**
 * Prefill-Loader für den OCR-Übergang UE0 → UE1.
 *
 * Wenn der Bürger über `?prefill=<einreichung_id>` ankommt, holt diese
 * Funktion den extrahiert_jsonb-Blob aus apl2.antrag_einreichung und
 * mappt ihn auf einen partiellen FormState. Der Aufrufer (main.ts)
 * merged das Ergebnis in den Initial-State.
 *
 * Bewusste Trennung: kein INSERT in apl2.antraege beim OCR. Erst der
 * UE1-Submit erzeugt den Antrag (Architektur A, Robert-Entscheidung
 * 2026-05-24 — keine Geister-Anträge bei Form-Abbruch).
 */

import type { FormState, OeffnungszeitEntry, Wochentag } from "./types";

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "https://supabase.butscher.cloud";
const ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_ANON_KEY as string | undefined) ??
  "";

const WOCHENTAGE: Wochentag[] = ["mo", "di", "mi", "do", "fr", "sa", "so"];

interface EinreichungRow {
  id: string;
  status: string;
  extrahiert_jsonb: Record<string, unknown> | null;
}

interface OeffnungszeitOcrEntry {
  wochentag?: string;
  oeffnungszeit?: string;
  angebot?: string;
}

/**
 * Lädt die einreichung und mappt extrahiert_jsonb auf einen partiellen
 * FormState. Gibt null zurück, wenn der Fetch fehlschlägt oder die
 * Einreichung nicht existiert — UE1 fällt dann auf leeres Formular zurück.
 */
export async function loadPrefillData(einreichungId: string): Promise<Partial<FormState> | null> {
  if (!ANON_KEY) {
    console.warn("loadPrefillData: kein ANON_KEY zur Build-Zeit gesetzt — Prefill deaktiviert.");
    return null;
  }
  const url =
    `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/antrag_einreichung` +
    `?id=eq.${encodeURIComponent(einreichungId)}` +
    `&select=id,status,extrahiert_jsonb`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Accept-Profile": "apl2",
      },
    });
  } catch (e) {
    console.warn("loadPrefillData: Netzwerkfehler", e);
    return null;
  }
  if (!res.ok) {
    console.warn(`loadPrefillData: HTTP ${res.status}`);
    return null;
  }
  let rows: EinreichungRow[];
  try {
    rows = (await res.json()) as EinreichungRow[];
  } catch (e) {
    console.warn("loadPrefillData: JSON-Parse fehlgeschlagen", e);
    return null;
  }
  const row = rows[0];
  if (!row || !row.extrahiert_jsonb) {
    console.warn("loadPrefillData: kein extrahiert_jsonb für ID", einreichungId);
    return null;
  }
  return mapExtractedToFormState(row.extrahiert_jsonb);
}

/**
 * Reines Mapping (ohne Network). Exportiert für Tests.
 * Übernimmt nur Felder, die im JSON tatsächlich gesetzt sind — null/undefined
 * werden NICHT übernommen, damit die Defaults aus initialState() greifen.
 */
export function mapExtractedToFormState(extracted: Record<string, unknown>): Partial<FormState> {
  const out: Partial<FormState> = {};

  // String-Felder — übernehmen wenn nicht-leerer String
  const strFields: Array<keyof FormState> = [
    "name",
    "traeger",
    "strasse",
    "hausnummer",
    "plz",
    "ort",
    "ansprechpartner",
    "telefon",
    "email",
    "bankverbindung",
    "iban",
    "bic",
    "antragsdatum",
  ];
  for (const f of strFields) {
    const v = extracted[f as string];
    if (typeof v === "string" && v.trim().length > 0) {
      (out as Record<string, unknown>)[f] = v.trim();
    }
  }

  // Zahl-Felder
  const numFields: Array<keyof FormState> = [
    "haushaltsjahr",
    "betriebskosten_vorjahr_euro",
    "personalkosten_vorjahr_euro",
    "monatliche_miete_euro",
  ];
  for (const f of numFields) {
    const v = extracted[f as string];
    if (typeof v === "number" && Number.isFinite(v)) {
      (out as Record<string, unknown>)[f] = v;
    }
  }

  // ja|nein-Optionsfelder
  for (const f of ["raeume_vorhanden", "raeume_unentgeltlich"] as const) {
    const v = extracted[f];
    if (v === "ja" || v === "nein") {
      out[f] = v;
    }
  }

  // Öffnungszeiten — falls vorhanden, überschreibt die 7 leeren Default-Slots
  const ozRaw = extracted.oeffnungszeiten;
  if (Array.isArray(ozRaw) && ozRaw.length > 0) {
    out.oeffnungszeiten = mergeOeffnungszeiten(ozRaw as OeffnungszeitOcrEntry[]);
  }

  return out;
}

/**
 * Baut die 7-Slot-Wochentagsliste aus den OCR-Einträgen. OCR liefert
 * eine sparse Liste (nur befüllte Tage); wir produzieren stabile 7 Slots
 * in Mo–So-Reihenfolge, damit die UI-Render-Logik nichts ändern muss.
 */
function mergeOeffnungszeiten(ocrEntries: OeffnungszeitOcrEntry[]): OeffnungszeitEntry[] {
  const map = new Map<Wochentag, OeffnungszeitEntry>();
  for (const t of WOCHENTAGE) {
    map.set(t, { wochentag: t, oeffnungszeit: "", angebot: "" });
  }
  for (const entry of ocrEntries) {
    const tag = entry.wochentag;
    if (typeof tag === "string" && (WOCHENTAGE as string[]).includes(tag)) {
      map.set(tag as Wochentag, {
        wochentag: tag as Wochentag,
        oeffnungszeit: typeof entry.oeffnungszeit === "string" ? entry.oeffnungszeit : "",
        angebot: typeof entry.angebot === "string" ? entry.angebot : "",
      });
    }
  }
  return WOCHENTAGE.map((t) => map.get(t)!);
}
