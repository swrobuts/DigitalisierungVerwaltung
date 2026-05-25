export type FoerderbereichId = "I" | "II" | "III" | "IV";

export interface AnlagenSlot {
  typ: "projektskizze" | "helferliste" | "foerderbestaetigung_bund"
     | "programm_flyer" | "stundenzettel" | "sonstige";
  pflicht: boolean;
  mime: string[];        // z.B. ["application/pdf"]
  max_mb: number;
  beschreibung: string;
}

/**
 * Diskriminierte Union für Validierungsregeln.
 *
 * Bewusst KEIN String mit JS-Ausdruck — sonst müssten Konsumenten
 * `new Function(...)` / `eval` verwenden, was eine Code-Injection-Falle wäre.
 *
 * Konsumenten evaluieren über `evaluateRule()` aus diesem Package.
 */
export type ValidationRule =
  | { feld: string; kind: "min";        value: number;   fehlermeldung: string }
  | { feld: string; kind: "max";        value: number;   fehlermeldung: string }
  | { feld: string; kind: "min_length"; value: number;   fehlermeldung: string }
  | { feld: string; kind: "max_length"; value: number;   fehlermeldung: string }
  | { feld: string; kind: "enum";       values: readonly string[]; fehlermeldung: string }
  | { feld: string; kind: "regex";      pattern: string; fehlermeldung: string };

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
