import type { FormState, Sprache, Wochentag } from "./types";
import { isValidIBAN, isValidEmail, isValidPLZ } from "./validation";

/**
 * Initial-State für den belegezentrierten Stepper-Flow (v2).
 * - Haushaltsjahr defaults auf das aktuelle Kalenderjahr.
 * - 7 Wochentage werden als leere OeffnungszeitEntries vorbelegt,
 *   damit das UI direkt darüber iterieren kann.
 * - Sprache wird aus navigator.language abgeleitet (Fallback "de").
 */
/**
 * Haushaltsjahr für einen neuen Antrag automatisch ableiten.
 * AHP 3.3: Anträge müssen bis zum 1. April des Antragsjahres vorliegen.
 * Daraus: vor 1. April aktuelles Jahr; danach gilt der Antrag für das
 * Folgejahr (für das aktuelle Jahr wäre er ohnehin verfristet).
 */
function autoHaushaltsjahr(now: Date = new Date()): number {
  const monat = now.getMonth(); // 0 = Januar
  const aprilStichtag = 3;       // 0-indexed: 3 = April
  return monat < aprilStichtag ? now.getFullYear() : now.getFullYear() + 1;
}

export function initialState(): FormState {
  const wochentage: Wochentag[] = ["mo", "di", "mi", "do", "fr", "sa", "so"];
  return {
    step: 1,
    haushaltsjahr: autoHaushaltsjahr(),
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
    anzahl_teilnehmer_vorjahr: null,
    stadtbewohner_anteil_vorjahr: null,
    anzahl_veranstaltungen_vorjahr: null,
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
      // Pflicht: Ansprechpartner (für Korrespondenz), Email (Korrespondenz-
      // Kanal), IBAN (Auszahlungskanal). Telefon und Bankname sind seit
      // Abspeckung 2026-05 optional — Email reicht für Korrespondenz, der
      // Bankname ist aus der IBAN ableitbar.
      if (
        s.ansprechpartner.trim().length < 1 ||
        !isValidEmail(s.email) ||
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
      // Bemessungsgrundlage Vorjahr gem. AHP 2.3 Förderbereich III, Pkt. 2.
      // Alle drei Felder Pflicht: Stadt-Anteil weil die Auszahlung
      // anteilig danach erfolgt; Teilnehmer + Veranstaltungen weil die
      // Richtlinie sie als „Gewichtung der möglichen Zuwendung aus dem
      // Budget" verlangt — ohne diese Werte kann der Sozialausschuss
      // keine vergleichende Bewertung vornehmen.
      if (s.anzahl_teilnehmer_vorjahr === null || s.anzahl_teilnehmer_vorjahr < 0) return false;
      if (s.stadtbewohner_anteil_vorjahr === null
          || s.stadtbewohner_anteil_vorjahr < 0
          || s.stadtbewohner_anteil_vorjahr > 1) return false;
      if (s.anzahl_veranstaltungen_vorjahr === null || s.anzahl_veranstaltungen_vorjahr < 0) return false;
      return true;
    }
    case 5: {
      // Programm-Nachweis (vormals Step 6): Anlage 1 (Wochenplan) ODER
      // Programm-Flyer reicht — beide decken dieselbe Pflicht
      // („Programm der Tagesstätte angeben") ab.
      const hatWochenplan = s.oeffnungszeiten.some(
        (o) => o.oeffnungszeit.trim().length > 0 || o.angebot.trim().length > 0,
      );
      return s.programm_flyer !== null || hatWochenplan;
    }
    case 6:
      // Bestätigung (vormals Step 7).
      return s.bestaetigt === true;
    default:
      return false;
  }
}

/**
 * Form-Completion-Prüfung. True nur, wenn alle Pflicht-Sections grün sind.
 *
 * Seit Abspeckung 2026-05 sind das nur noch 5 Pflicht-Steps:
 *   1 Träger · 2 Kontakt+Bank · 4 Bemessung · 5 Programm · 6 Bestätigung.
 * Step 3 (Wochenplan) ist optional und liefert immer true.
 *
 * Der frühere Step 5 'Räume + Belege' ist entfallen (AHP 3.8 sagt
 * wörtlich: „Belege sind nur auf Anfrage einzureichen"). Bisherige
 * Steps 6 und 7 sind dadurch auf 5 und 6 verschoben.
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
