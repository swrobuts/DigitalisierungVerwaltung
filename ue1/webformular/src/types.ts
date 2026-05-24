export type JaNein = "ja" | "nein";

export type Sprache = "de" | "it" | "tr" | "es";

export const ALLE_SPRACHEN: Sprache[] = ["de", "it", "tr", "es"];

// ----- v2: Belegezentrierter Stepper-Flow ----------------------------------

export type Wochentag = "mo" | "di" | "mi" | "do" | "fr" | "sa" | "so";
export type Belegtyp = "betriebskosten" | "personalkosten" | "miete";

export interface BelegpositionEntry {
  id: string;
  belegtyp: Belegtyp;
  bezeichnung: string;
  betrag_euro: number;
  file: File | null;
  file_hash: string | null;
}

export interface OeffnungszeitEntry {
  wochentag: Wochentag;
  oeffnungszeit: string;
  angebot: string;
}

/**
 * UE1-v3 — Voll-Sync mit PDF-Antrag „AHP Nr. 2".
 *
 * Hinweis zu raeume_vorhanden / raeume_unentgeltlich:
 * UI-Konvention für „noch nicht gewählt" ist der leere String "".
 * Der State-Typ erlaubt "" temporär; die DB-Submit-Payload (siehe submit.ts)
 * und isStepComplete() verlangen einen der beiden konkreten Werte ja|nein.
 */
export interface FormState {
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  haushaltsjahr: number;
  name: string;
  traeger: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  ansprechpartner: string;
  /** PDF H8. Pflicht. */
  telefon: string;
  email: string;
  /** PDF H9. Pflicht — Bankname. */
  bankverbindung: string;
  iban: string;
  /** PDF H9. Pflicht. */
  bic: string;
  oeffnungszeiten: OeffnungszeitEntry[];
  // Bemessungsgrundlage gem. AHP 2.3 Förderbereich III, Pkt. 2
  // (Begegnungszentren). Alle drei Felder beziehen sich auf das Vorjahr —
  // die Richtlinie sagt für den Stadt-Anteil explizit „Vorjahr"; für
  // die Gewichtungsgrößen ist es praktisch gleich, weil der Antrag im
  // ersten Quartal des Förderjahres gestellt wird (AHP 3.3: bis 1. April).
  // null bedeutet noch nicht eingegeben; 0 ist ein gültiger Wert.
  anzahl_teilnehmer_vorjahr: number | null;
  /** Anteil Stadtbewohner:innen an Gesamt-Teilnehmer:innen des Vorjahres,
   *  Wertebereich 0…1 (UI zeigt 0…100 %). Bestimmt direkt den
   *  prozentualen Auszahlungsanteil. */
  stadtbewohner_anteil_vorjahr: number | null;
  anzahl_veranstaltungen_vorjahr: number | null;
  /** PDF H13. Pflicht. "" = noch nicht gewählt; final "ja" | "nein". */
  raeume_vorhanden: "ja" | "nein" | "";
  /** PDF H14. Pflicht. "" = noch nicht gewählt; final "ja" | "nein". */
  raeume_unentgeltlich: "ja" | "nein" | "";
  /** PDF H11. Pflicht. Wird beim Submit als belegposition mit belegtyp='betriebskosten' angelegt. */
  betriebskosten_vorjahr_euro: number | null;
  /** PDF H12. Pflicht. Wird als belegposition belegtyp='personalkosten' angelegt. */
  personalkosten_vorjahr_euro: number | null;
  /** PDF H15. Monatswert. Beim Submit × 12 = Jahressumme als belegposition belegtyp='miete'.
   *  Pflicht wenn raeume_vorhanden='nein' UND raeume_unentgeltlich='nein'. */
  monatliche_miete_euro: number | null;
  /** PDF H16. Editierbares Datum, default heute. */
  antragsdatum: string;
  /** PDF H15-Hinweis: Kopie Mietvertrag. Optional (AHP 3.8: Belege nur auf Anfrage). */
  mietvertrag_file: File | null;
  belegpositionen: BelegpositionEntry[];
  programm_flyer: File | null;
  bestaetigt: boolean;
  language: Sprache;
}
