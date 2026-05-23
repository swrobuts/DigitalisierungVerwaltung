import { describe, it, expect } from "vitest";
import { initialState, isStepComplete, isFormComplete } from "../src/state";
import type { FormState } from "../src/types";

function makeState(overrides: Partial<FormState> = {}): FormState {
  return { ...initialState(), ...overrides };
}

describe("isStepComplete", () => {
  it("Step 1 leer ist nicht complete", () => {
    expect(isStepComplete(1, initialState())).toBe(false);
  });
  it("Step 1 mit allen Pflichtfeldern ist complete", () => {
    const s = makeState({
      name: "Test", traeger: "X", strasse: "Hauptstr", hausnummer: "1",
      plz: "97070", ort: "Würzburg", haushaltsjahr: 2026,
    });
    expect(isStepComplete(1, s)).toBe(true);
  });
  it("Step 1 mit ungültiger PLZ ist nicht complete", () => {
    const s = makeState({
      name: "Test", traeger: "X", strasse: "Hauptstr", hausnummer: "1",
      plz: "abc", ort: "Würzburg", haushaltsjahr: 2026,
    });
    expect(isStepComplete(1, s)).toBe(false);
  });
  it("Step 2 mit DE-IBAN ohne BIC ist complete", () => {
    const s = makeState({
      ansprechpartner: "M. Schmidt", email: "m@x.de",
      iban: "DE89370400440532013000", bic: "",
    });
    expect(isStepComplete(2, s)).toBe(true);
  });
  it("Step 2 mit AT-IBAN ohne BIC ist NICHT complete", () => {
    const s = makeState({
      ansprechpartner: "M", email: "m@x.de",
      iban: "AT611904300234573201", bic: "",
    });
    expect(isStepComplete(2, s)).toBe(false);
  });
  // Telefon und Bankname sind seit Abspeckung 2026-05 optional
  it("Step 2 ohne Telefon und ohne Bankname ist complete (beide optional)", () => {
    const s = makeState({
      ansprechpartner: "M", telefon: "", email: "m@x.de",
      bankverbindung: "", iban: "DE89370400440532013000", bic: "",
    });
    expect(isStepComplete(2, s)).toBe(true);
  });
  it("Step 3 (Wochenplan) ist immer complete — optional laut AHP-PDF", () => {
    // Leerer State: ok (optional)
    expect(isStepComplete(3, initialState())).toBe(true);
    // Mit ausgefülltem Tag: ebenfalls ok
    const s = makeState({
      oeffnungszeiten: [
        { wochentag: "mo", oeffnungszeit: "10:00-16:00", angebot: "Kaffee" },
        { wochentag: "di", oeffnungszeit: "", angebot: "" },
        { wochentag: "mi", oeffnungszeit: "", angebot: "" },
        { wochentag: "do", oeffnungszeit: "", angebot: "" },
        { wochentag: "fr", oeffnungszeit: "", angebot: "" },
        { wochentag: "sa", oeffnungszeit: "", angebot: "" },
        { wochentag: "so", oeffnungszeit: "", angebot: "" },
      ],
    });
    expect(isStepComplete(3, s)).toBe(true);
  });
  // Step 4 ist seit dem Refactor 2026-05 die Bemessungsgrundlage Vorjahr
  // (AHP 2.3 FB III Pkt. 2). Alle drei Felder Pflicht.
  it("Step 4 (Bemessung) ohne Werte ist nicht complete", () => {
    expect(isStepComplete(4, initialState())).toBe(false);
  });
  it("Step 4 (Bemessung) mit nur Stadt-Anteil ist nicht complete", () => {
    const s = makeState({ stadtbewohner_anteil_vorjahr: 0.7 });
    expect(isStepComplete(4, s)).toBe(false);
  });
  it("Step 4 (Bemessung) mit allen drei Werten ist complete", () => {
    const s = makeState({
      anzahl_teilnehmer_vorjahr: 35,
      stadtbewohner_anteil_vorjahr: 0.7,
      anzahl_veranstaltungen_vorjahr: 48,
    });
    expect(isStepComplete(4, s)).toBe(true);
  });
  it("Step 4 (Bemessung) lehnt Stadt-Anteil > 1 ab", () => {
    const s = makeState({
      anzahl_teilnehmer_vorjahr: 35,
      stadtbewohner_anteil_vorjahr: 1.5,
      anzahl_veranstaltungen_vorjahr: 48,
    });
    expect(isStepComplete(4, s)).toBe(false);
  });
  it("Step 4 (Bemessung) akzeptiert 0 als gültigen Wert (Erstantrag ohne Vorjahres-Daten)", () => {
    const s = makeState({
      anzahl_teilnehmer_vorjahr: 0,
      stadtbewohner_anteil_vorjahr: 0,
      anzahl_veranstaltungen_vorjahr: 0,
    });
    expect(isStepComplete(4, s)).toBe(true);
  });
  // Mit der Abspeckung 2026-05 ist der frühere Step 5 (Räume + Belege)
  // komplett entfallen (AHP 3.8: „Belege sind nur auf Anfrage einzureichen").
  // Step 5 ist nun der Programm-Nachweis (vormals 6), Step 6 die Bestätigung
  // (vormals 7).
  it("Step 5 ohne Programm-Flyer und ohne Wochenplan ist nicht complete", () => {
    expect(isStepComplete(5, initialState())).toBe(false);
  });
  it("Step 5 mit Programm-Flyer ist complete", () => {
    const s = makeState({ programm_flyer: new File([], "p.pdf") });
    expect(isStepComplete(5, s)).toBe(true);
  });
  it("Step 5 mit ausgefülltem Wochenplan (1 Eintrag) reicht auch", () => {
    const s = makeState({
      oeffnungszeiten: [
        { wochentag: "mo", oeffnungszeit: "10:00-16:00", angebot: "Kaffee" },
        { wochentag: "di", oeffnungszeit: "", angebot: "" },
        { wochentag: "mi", oeffnungszeit: "", angebot: "" },
        { wochentag: "do", oeffnungszeit: "", angebot: "" },
        { wochentag: "fr", oeffnungszeit: "", angebot: "" },
        { wochentag: "sa", oeffnungszeit: "", angebot: "" },
        { wochentag: "so", oeffnungszeit: "", angebot: "" },
      ],
    });
    expect(isStepComplete(5, s)).toBe(true);
  });
  it("Step 6 braucht Bestätigung", () => {
    expect(isStepComplete(6, initialState())).toBe(false);
    const s = makeState({ bestaetigt: true });
    expect(isStepComplete(6, s)).toBe(true);
  });
});

describe("isFormComplete", () => {
  it("leerer State ist nicht complete (Step 1, 2, 4, 5, 6 fehlen)", () => {
    expect(isFormComplete(initialState())).toBe(false);
  });
  it("nur Bestätigung reicht nicht — Pflicht-Sections müssen alle grün sein", () => {
    const s = makeState({ bestaetigt: true });
    expect(isFormComplete(s)).toBe(false);
  });
});
