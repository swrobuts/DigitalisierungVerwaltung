import type { FormState } from "./types";

/**
 * Cross-Field-Validierung, die mehrere Felder gleichzeitig konsultiert.
 * Hauptfälle:
 *  - „kein eigener Raum" + „keine unentgeltlichen Räume" → Miete > 0 Pflicht
 *    (PDF H13/H14/H15 in Kombination).
 */
export type CrossFieldErrors = Partial<Record<keyof FormState, string>>;

export function validateCrossField(s: FormState): CrossFieldErrors {
  const errors: CrossFieldErrors = {};

  if (
    s.raeume_vorhanden === "nein" &&
    s.raeume_unentgeltlich === "nein" &&
    (s.monatliche_miete_euro === null || s.monatliche_miete_euro <= 0)
  ) {
    errors.monatliche_miete_euro =
      "Ohne eigene oder unentgeltliche Räume muss eine monatliche Miete angegeben werden.";
  }

  return errors;
}
