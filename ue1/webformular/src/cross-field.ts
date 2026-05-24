import type { FormState } from "./types";

/**
 * Cross-Field-Validierung, die mehrere Felder gleichzeitig konsultiert.
 * Hauptfälle:
 *  - „kein eigener Raum" + „keine unentgeltlichen Räume" → Miete > 0 Pflicht
 *    (PDF H13/H14/H15 in Kombination).
 *  - Antragsdatum vs. Haushaltsjahr → 1.-April-Frist (AHP 3.3) als
 *    weicher Hinweis (kein Blocker, da AHP-Wortlaut „grundsätzlich").
 *
 * Fehler-Map enthält für jedes betroffene Feld höchstens einen Text.
 * Zusätzlich werden Hinweise (nicht-blockierend) im selben Objekt
 * geführt — Konsumenten unterscheiden anhand der Schwere nicht, der
 * Submit-Flow nutzt nur isStepComplete()/isFormComplete() als Blocker.
 */
export type CrossFieldErrors = Partial<Record<keyof FormState, string>>;

/**
 * Verifiziert, ob das Antragsdatum mit dem angegebenen Haushaltsjahr
 * zur 1.-April-Frist passt (AHP 3.3: „Die Anträge müssen grundsätzlich
 * bis zum 1. April des Antragsjahres vorliegen.").
 *
 * Rückgabe: Hinweis-Text (deutsch) oder null. „Grundsätzlich" → kein
 * harter Blocker, daher nur Hinweis.
 *
 * Fall A: antragsdatum.year === haushaltsjahr UND antragsdatum > 1. April
 *   → Antrag ist für das laufende Jahr verfristet.
 * Fall B: antragsdatum.year > haushaltsjahr
 *   → Antrag wird für ein vergangenes Haushaltsjahr gestellt; nur
 *     plausibel, wenn der reguläre Stichtag (1. April der Jahresfolge)
 *     noch nicht überschritten ist. Im Zweifel ebenfalls Hinweis.
 * Fall C: antragsdatum.year < haushaltsjahr
 *   → Antrag im Vorlauf, unkritisch.
 * Fall D: antragsdatum.year === haushaltsjahr UND antragsdatum ≤ 1.4
 *   → fristgerecht.
 */
export function antragsfristHinweis(
  antragsdatum: string,
  haushaltsjahr: number,
): string | null {
  // antragsdatum-Format: ISO YYYY-MM-DD (siehe state.ts initialState).
  if (!antragsdatum || antragsdatum.length < 10) return null;
  const parts = antragsdatum.slice(0, 10).split("-");
  if (parts.length !== 3) return null;
  const [ys, ms, ds] = parts;
  if (ys === undefined || ms === undefined || ds === undefined) return null;
  const y = parseInt(ys, 10);
  const m = parseInt(ms, 10);
  const d = parseInt(ds, 10);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;

  // Stichtag der AHP: 1. April des Haushaltsjahres.
  const istNach1April = (mm: number, dd: number) =>
    mm > 4 || (mm === 4 && dd > 1);

  if (y === haushaltsjahr && istNach1April(m, d)) {
    return (
      `Hinweis: Der 1.-April-Stichtag (AHP 3.3) für das Haushaltsjahr ` +
      `${haushaltsjahr} ist bereits überschritten. Anträge nach dem ` +
      `1. April gelten grundsätzlich als verfristet — eine Bearbeitung ` +
      `liegt im Ermessen des Sozialreferats.`
    );
  }
  if (y > haushaltsjahr) {
    return (
      `Hinweis: Antragsdatum ${antragsdatum} liegt nach dem Haushaltsjahr ` +
      `${haushaltsjahr}. Ein Antrag für ein bereits abgelaufenes Jahr ist ` +
      `möglich, muss aber spätestens bis zum 1. April des Folgejahres ` +
      `eingereicht werden (AHP 3.3).`
    );
  }
  return null;
}

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

  const fristHinweis = antragsfristHinweis(s.antragsdatum, s.haushaltsjahr);
  if (fristHinweis !== null) {
    errors.antragsdatum = fristHinweis;
  }

  return errors;
}
