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
      ansprechpartner: "M. Schmidt", telefon: "0931 1", email: "m@x.de",
      bankverbindung: "Sparkasse", iban: "DE89370400440532013000", bic: "",
    });
    expect(isStepComplete(2, s)).toBe(true);
  });
  it("Step 2 mit AT-IBAN ohne BIC ist NICHT complete", () => {
    const s = makeState({
      ansprechpartner: "M", telefon: "1", email: "m@x.de",
      bankverbindung: "Erste", iban: "AT611904300234573201", bic: "",
    });
    expect(isStepComplete(2, s)).toBe(false);
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
  it("Step 4 mit Räume unentgeltlich=ja braucht keine Mietposition", () => {
    const s = makeState({ raeume_vorhanden: "nein", raeume_unentgeltlich: "ja" });
    expect(isStepComplete(4, s)).toBe(true);
  });
  it("Step 4 mit Räume nicht unentgeltlich braucht Mietposition mit Beleg", () => {
    const s1 = makeState({ raeume_vorhanden: "ja", raeume_unentgeltlich: "nein" });
    expect(isStepComplete(4, s1)).toBe(false);
    const s2 = makeState({
      raeume_vorhanden: "ja", raeume_unentgeltlich: "nein",
      belegpositionen: [{ id: "1", belegtyp: "miete", bezeichnung: "Miete",
        betrag_euro: 1200, file: null, file_hash: null }],
    });
    expect(isStepComplete(4, s2)).toBe(false);
    const s3 = makeState({
      raeume_vorhanden: "ja", raeume_unentgeltlich: "nein",
      belegpositionen: [{ id: "1", belegtyp: "miete", bezeichnung: "Miete",
        betrag_euro: 1200, file: new File([], "m.pdf"), file_hash: "h" }],
    });
    expect(isStepComplete(4, s3)).toBe(true);
  });
  it("Step 5 ohne Programm-Flyer ist nicht complete", () => {
    expect(isStepComplete(5, initialState())).toBe(false);
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
