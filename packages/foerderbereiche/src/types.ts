export type FoerderbereichId = "I" | "II" | "III" | "IV";

export interface AnlagenSlot {
  typ: "projektskizze" | "helferliste" | "foerderbestaetigung_bund"
     | "programm_flyer" | "stundenzettel" | "sonstige";
  pflicht: boolean;
  mime: string[];        // z.B. ["application/pdf"]
  max_mb: number;
  beschreibung: string;
}

export interface ValidationRule {
  feld: string;
  regel: string;         // JS-Ausdruck, evaluiert über das State-Objekt
  fehlermeldung: string;
}

export interface FoerderbereichKonfig {
  id: FoerderbereichId;
  label_kurz: string;            // z.B. "Aufbau"
  label_lang: string;            // z.B. "Aufbau niedrigschwelliger Angebote"
  icon: string;                  // Emoji oder Symbol
  beschreibung: string;          // 1-2 Sätze für UE0/UE1-Karte
  pflichtfelder: readonly string[];
  optional_felder: readonly string[];
  anlagen: readonly AnlagenSlot[];
  validation_rules: readonly ValidationRule[];
  quelle_pdf: string;            // Pfad relativ zu Repo-Root
}
