export type JaNein = "ja" | "nein";

export type Sprache = "de" | "it" | "tr" | "es";

export const ALLE_SPRACHEN: Sprache[] = ["de", "it", "tr", "es"];

export interface APL2Antrag {
  haushaltsjahr: number;
  name: string;
  anschrift: string;
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
}

export type ValidationErrors = Partial<Record<keyof APL2Antrag | AnlagenTyp, string>>;
