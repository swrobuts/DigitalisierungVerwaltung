export type JaNein = "ja" | "nein";

export type Sprache = "de" | "it" | "tr" | "es";

export const ALLE_SPRACHEN: Sprache[] = ["de", "it", "tr", "es"];

export interface APL2Antrag {
  haushaltsjahr: number;
  name: string;
  strasse:    string;
  hausnummer: string;
  plz:        string;
  ort:        string;
  traeger: string;
  bankverbindung: string;
  iban: string;
  bic: string;
  ansprechpartner: string;
  telefon: string;
  email: string;
  betriebskostenVorjahrEuro: number;
  personalkostenVorjahrEuro: number;
  raeumeVorhanden: JaNein;
  raeumeUnentgeltlich: JaNein;
  monatlicheMieteEuro: number;
  antragsdatum: string;          // ISO YYYY-MM-DD
  anlagen: Anlage[];
}

export type AnlagenTyp =
  | "mietvertrag"
  | "programm-altentagesstaette"
  | "anlage-1-kostennachweis"
  | "personalkostenbelege";

export interface Anlage {
  typ: AnlagenTyp;
  dateiname: string;
  groesseBytes: number;
  mimeType: string;
  file?: File;
}

export type ValidationErrors = Partial<Record<keyof APL2Antrag | AnlagenTyp, string>>;

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

export interface FormState {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  haushaltsjahr: number;
  name: string;
  traeger: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  ansprechpartner: string;
  telefon: string;
  email: string;
  bankverbindung: string;
  iban: string;
  bic: string;
  oeffnungszeiten: OeffnungszeitEntry[];
  raeume_vorhanden: "ja" | "nein" | null;
  raeume_unentgeltlich: "ja" | "nein" | null;
  belegpositionen: BelegpositionEntry[];
  programm_flyer: File | null;
  bestaetigt: boolean;
  language: Sprache;
}
