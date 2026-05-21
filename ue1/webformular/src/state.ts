import type { FormState, Sprache, Wochentag } from "./types";
import { isValidIBAN, isValidEmail, isValidPLZ } from "./validation";

/**
 * Initial-State für den belegezentrierten Stepper-Flow (v2).
 * - Haushaltsjahr defaults auf das aktuelle Kalenderjahr.
 * - 7 Wochentage werden als leere OeffnungszeitEntries vorbelegt,
 *   damit das UI direkt darüber iterieren kann.
 * - Sprache wird aus navigator.language abgeleitet (Fallback "de").
 */
export function initialState(): FormState {
  const wochentage: Wochentag[] = ["mo", "di", "mi", "do", "fr", "sa", "so"];
  return {
    step: 1,
    haushaltsjahr: new Date().getFullYear(),
    name: "",
    traeger: "",
    strasse: "",
    hausnummer: "",
    plz: "",
    ort: "",
    ansprechpartner: "",
    telefon: "",
    email: "",
    bankverbindung: "",
    iban: "",
    bic: "",
    oeffnungszeiten: wochentage.map((t) => ({
      wochentag: t,
      oeffnungszeit: "",
      angebot: "",
    })),
    raeume_vorhanden: null,
    raeume_unentgeltlich: null,
    belegpositionen: [],
    programm_flyer: null,
    bestaetigt: false,
    language: detectLanguage(),
  };
}

function detectLanguage(): Sprache {
  if (typeof navigator === "undefined") return "de";
  const code = (navigator.language ?? "de").slice(0, 2).toLowerCase();
  if (code === "it" || code === "tr" || code === "es") return code as Sprache;
  return "de";
}

/**
 * Step-Completion-Prüfung. Entscheidet, ob „Weiter" aktivierbar ist.
 * Reine Funktion über FormState — kein Side-Effect, keine UI.
 */
export function isStepComplete(step: number, s: FormState): boolean {
  switch (step) {
    case 1:
      return (
        s.name.trim().length >= 1 &&
        s.traeger.trim().length >= 1 &&
        s.strasse.trim().length > 0 &&
        s.hausnummer.trim().length > 0 &&
        isValidPLZ(s.plz) &&
        s.ort.trim().length > 0 &&
        s.haushaltsjahr >= 2020 &&
        s.haushaltsjahr <= 2030
      );
    case 2: {
      if (
        s.ansprechpartner.trim().length < 1 ||
        s.telefon.trim().length < 1 ||
        !isValidEmail(s.email) ||
        s.bankverbindung.trim().length < 1 ||
        !isValidIBAN(s.iban)
      ) return false;
      const ibanCountry = s.iban.replace(/\s+/g, "").slice(0, 2).toUpperCase();
      if (ibanCountry !== "DE" && s.bic.trim().length < 8) return false;
      return true;
    }
    case 3:
      // Wochenplan ist OPTIONAL — kein Pflicht-Block laut AHP-PDF.
      // Im Long-Form-Layout zählt Step 3 deshalb nicht zur Pflicht-Quote.
      return true;
    case 4: {
      if (s.raeume_vorhanden === null || s.raeume_unentgeltlich === null) return false;
      if (s.raeume_unentgeltlich === "ja") return true;
      const mietePos = s.belegpositionen.filter((b) => b.belegtyp === "miete");
      if (mietePos.length === 0) return false;
      return mietePos.every(
        (p) => p.bezeichnung.trim().length > 0 && p.betrag_euro > 0 && p.file !== null,
      );
    }
    case 5:
      return s.programm_flyer !== null;
    case 6:
      return s.bestaetigt === true;
    default:
      return false;
  }
}

/**
 * Form-Completion-Prüfung. True nur, wenn alle 6 Sections grün sind.
 * Step 3 (Wochenplan) ist optional und liefert immer true (siehe oben).
 */
export function isFormComplete(s: FormState): boolean {
  return (
    isStepComplete(1, s) &&
    isStepComplete(2, s) &&
    isStepComplete(3, s) &&
    isStepComplete(4, s) &&
    isStepComplete(5, s) &&
    isStepComplete(6, s)
  );
}
