import type { FormState, Sprache, Wochentag } from "./types";
import { isValidIBAN, isValidEmail, isValidPLZ } from "./validation";

/**
 * Initial-State für den belegezentrierten Stepper-Flow (v3 — Voll-Sync mit PDF).
 * - Haushaltsjahr defaults auf das per Stichtag (1. April) abgeleitete Jahr,
 *   bleibt aber im UI editierbar.
 * - 7 Wochentage werden als leere OeffnungszeitEntries vorbelegt.
 * - Sprache wird aus navigator.language abgeleitet (Fallback "de").
 */
/**
 * Haushaltsjahr für einen neuen Antrag automatisch ableiten.
 * AHP 3.3: Anträge müssen bis zum 1. April des Antragsjahres vorliegen.
 * Daraus: vor 1. April aktuelles Jahr; danach gilt der Antrag für das
 * Folgejahr (für das aktuelle Jahr wäre er ohnehin verfristet).
 */
export function autoHaushaltsjahr(now: Date = new Date()): number {
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
    // "" = „noch nicht gewählt"-Marker fürs Select-UI; Step-4-Validation
    // verlangt explizit "ja" oder "nein".
    raeume_vorhanden: "",
    raeume_unentgeltlich: "",
    betriebskosten_vorjahr_euro: null,
    personalkosten_vorjahr_euro: null,
    monatliche_miete_euro: null,
    antragsdatum: new Date().toISOString().slice(0, 10),
    mietvertrag_file: null,
    belegpositionen: [],
    programm_flyer: null,
    bestaetigt: false,
    language: detectLanguage(),
    einreichung_id: null,
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
 *
 * Schritt-Reihenfolge (v4, 6 Schritte, PDF-Voll-Sync):
 *   1 Einrichtung · 2 Kontakt & Bank · 3 Wochenplan · 4 Räume & Kosten ·
 *   5 Programm · 6 Senden
 *
 * Hinweis: Die früheren Bemessungsfelder (Step 5 alt) sind aus dem
 * Webformular entfernt — das amtliche PDF fragt sie nicht ab. Pflege
 * erfolgt ausschließlich in der Sachbearbeitung (UE3).
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
      // PDF-Voll-Sync: Telefon, Bankverbindung, BIC sind alle Pflicht
      // (PDF H8, H9). Email + IBAN ohnehin.
      if (
        s.ansprechpartner.trim().length < 1 ||
        !isValidEmail(s.email) ||
        !isValidIBAN(s.iban) ||
        s.telefon.trim().length < 3 ||
        s.bankverbindung.trim().length < 1 ||
        s.bic.trim().length < 8
      ) return false;
      return true;
    }
    case 3: {
      // Wochenplan ist Pflicht (PDF-Voll-Sync). Mindestens 1 Wochentag
      // mit gefüllter Öffnungszeit UND gefülltem Angebot.
      return s.oeffnungszeiten.some(
        (o) => o.oeffnungszeit.trim().length > 0 && o.angebot.trim().length > 0,
      );
    }
    case 4: {
      // PDF H11/H12/H13/H14/H15 — Räume & Kosten Vorjahr.
      if (s.betriebskosten_vorjahr_euro === null || s.betriebskosten_vorjahr_euro < 0) return false;
      if (s.personalkosten_vorjahr_euro === null || s.personalkosten_vorjahr_euro < 0) return false;
      if (s.raeume_vorhanden !== "ja" && s.raeume_vorhanden !== "nein") return false;
      if (s.raeume_unentgeltlich !== "ja" && s.raeume_unentgeltlich !== "nein") return false;
      // Cross-Field: kein eigener und kein unentgeltlicher Raum → Miete > 0 Pflicht.
      if (s.raeume_vorhanden === "nein" && s.raeume_unentgeltlich === "nein") {
        if (s.monatliche_miete_euro === null || s.monatliche_miete_euro <= 0) return false;
      }
      return true;
    }
    case 5: {
      // Programm-Nachweis: Wochenplan ODER Programm-Flyer reicht.
      const hatWochenplan = s.oeffnungszeiten.some(
        (o) => o.oeffnungszeit.trim().length > 0 || o.angebot.trim().length > 0,
      );
      return s.programm_flyer !== null || hatWochenplan;
    }
    case 6:
      // Bestätigung.
      return s.bestaetigt === true;
    default:
      return false;
  }
}

/**
 * Form-Completion-Prüfung. Iteriert über alle 6 Steps.
 */
export function isFormComplete(s: FormState): boolean {
  for (let step = 1; step <= 6; step++) {
    if (!isStepComplete(step, s)) return false;
  }
  return true;
}
