import { describe, it, expect } from "vitest";
import { initialState, isStepComplete, isFormComplete } from "../src/state";
import type { FormState } from "../src/types";

function makeState(overrides: Partial<FormState> = {}): FormState {
  return { ...initialState(), ...overrides };
}

const FULL_WOCHENPLAN = [
  { wochentag: "mo" as const, oeffnungszeit: "10:00-16:00", angebot: "Kaffee" },
  { wochentag: "di" as const, oeffnungszeit: "", angebot: "" },
  { wochentag: "mi" as const, oeffnungszeit: "", angebot: "" },
  { wochentag: "do" as const, oeffnungszeit: "", angebot: "" },
  { wochentag: "fr" as const, oeffnungszeit: "", angebot: "" },
  { wochentag: "sa" as const, oeffnungszeit: "", angebot: "" },
  { wochentag: "so" as const, oeffnungszeit: "", angebot: "" },
];

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
  it("Step 1 mit Haushaltsjahr außer Range (2019) ist nicht complete", () => {
    const s = makeState({
      name: "Test", traeger: "X", strasse: "Hauptstr", hausnummer: "1",
      plz: "97070", ort: "Würzburg", haushaltsjahr: 2019,
    });
    expect(isStepComplete(1, s)).toBe(false);
  });

  // Step 2 — PDF-Voll-Sync: Telefon, Bankverbindung, BIC alle Pflicht.
  it("Step 2 mit DE-IBAN und allen Pflichtfeldern ist complete", () => {
    const s = makeState({
      ansprechpartner: "M. Schmidt",
      telefon: "0931 1234567",
      email: "m@x.de",
      bankverbindung: "Sparkasse Mainfranken",
      iban: "DE89370400440532013000",
      bic: "BYLADEM1SWU",
    });
    expect(isStepComplete(2, s)).toBe(true);
  });
  it("Step 2 ohne BIC ist nicht complete (BIC ist immer Pflicht)", () => {
    const s = makeState({
      ansprechpartner: "M. Schmidt",
      telefon: "0931 1234567",
      email: "m@x.de",
      bankverbindung: "Sparkasse",
      iban: "DE89370400440532013000",
      bic: "",
    });
    expect(isStepComplete(2, s)).toBe(false);
  });
  it("Step 2 ohne Telefon ist nicht complete", () => {
    const s = makeState({
      ansprechpartner: "M. Schmidt", telefon: "",
      email: "m@x.de", bankverbindung: "Sparkasse",
      iban: "DE89370400440532013000", bic: "BYLADEM1SWU",
    });
    expect(isStepComplete(2, s)).toBe(false);
  });
  it("Step 2 ohne Bankverbindung ist nicht complete", () => {
    const s = makeState({
      ansprechpartner: "M. Schmidt", telefon: "0931",
      email: "m@x.de", bankverbindung: "",
      iban: "DE89370400440532013000", bic: "BYLADEM1SWU",
    });
    expect(isStepComplete(2, s)).toBe(false);
  });

  // Step 3 — PDF-Voll-Sync: Wochenplan ist jetzt Pflicht.
  it("Step 3 leer ist NICHT complete (Wochenplan ist Pflicht)", () => {
    expect(isStepComplete(3, initialState())).toBe(false);
  });
  it("Step 3 mit nur Zeit ohne Angebot ist NICHT complete", () => {
    const s = makeState({
      oeffnungszeiten: [
        { wochentag: "mo", oeffnungszeit: "10:00-16:00", angebot: "" },
        ...FULL_WOCHENPLAN.slice(1),
      ],
    });
    expect(isStepComplete(3, s)).toBe(false);
  });
  it("Step 3 mit mind. 1 Tag (Zeit + Angebot) ist complete", () => {
    const s = makeState({ oeffnungszeiten: FULL_WOCHENPLAN });
    expect(isStepComplete(3, s)).toBe(true);
  });

  // Step 4 — Räume & Kosten Vorjahr (PDF H11/H12/H13/H14/H15).
  it("Step 4 leer ist nicht complete", () => {
    expect(isStepComplete(4, initialState())).toBe(false);
  });
  it("Step 4 mit allen Pflichtfeldern (Räume vorhanden, keine Miete nötig) ist complete", () => {
    const s = makeState({
      betriebskosten_vorjahr_euro: 10000,
      personalkosten_vorjahr_euro: 50000,
      raeume_vorhanden: "ja",
      raeume_unentgeltlich: "nein",
      monatliche_miete_euro: null,
    });
    expect(isStepComplete(4, s)).toBe(true);
  });
  it("Step 4 fordert Miete > 0, wenn raeume_vorhanden='nein' UND raeume_unentgeltlich='nein'", () => {
    const s = makeState({
      betriebskosten_vorjahr_euro: 10000,
      personalkosten_vorjahr_euro: 50000,
      raeume_vorhanden: "nein",
      raeume_unentgeltlich: "nein",
      monatliche_miete_euro: 0,
    });
    expect(isStepComplete(4, s)).toBe(false);
  });
  it("Step 4 mit Miete > 0 und beiden Räume='nein' ist complete", () => {
    const s = makeState({
      betriebskosten_vorjahr_euro: 10000,
      personalkosten_vorjahr_euro: 50000,
      raeume_vorhanden: "nein",
      raeume_unentgeltlich: "nein",
      monatliche_miete_euro: 800,
    });
    expect(isStepComplete(4, s)).toBe(true);
  });
  it("Step 4 lehnt Räume='' (noch nicht gewählt) ab", () => {
    const s = makeState({
      betriebskosten_vorjahr_euro: 0,
      personalkosten_vorjahr_euro: 0,
      raeume_vorhanden: "",
      raeume_unentgeltlich: "nein",
    });
    expect(isStepComplete(4, s)).toBe(false);
  });

  // Step 5 — Programm-Nachweis (vormals Step 6).
  // Hinweis: Die früheren Bemessungsfelder sind aus dem Webformular
  // entfernt — das amtliche PDF fragt sie nicht ab; UE3 pflegt sie nach.
  it("Step 5 ohne Programm-Flyer und ohne Wochenplan ist nicht complete", () => {
    expect(isStepComplete(5, initialState())).toBe(false);
  });
  it("Step 5 mit Programm-Flyer ist complete", () => {
    const s = makeState({ programm_flyer: new File([], "p.pdf") });
    expect(isStepComplete(5, s)).toBe(true);
  });
  it("Step 5 mit ausgefülltem Wochenplan reicht auch", () => {
    const s = makeState({ oeffnungszeiten: FULL_WOCHENPLAN });
    expect(isStepComplete(5, s)).toBe(true);
  });

  // Step 6 — Bestätigung (vormals Step 7).
  it("Step 6 braucht Bestätigung", () => {
    expect(isStepComplete(6, initialState())).toBe(false);
    const s = makeState({ bestaetigt: true });
    expect(isStepComplete(6, s)).toBe(true);
  });

  it("Step 7 existiert nicht mehr — isStepComplete(7) ist false (default)", () => {
    const s = makeState({ bestaetigt: true });
    expect(isStepComplete(7, s)).toBe(false);
  });
});

describe("isFormComplete", () => {
  it("leerer State ist nicht complete", () => {
    expect(isFormComplete(initialState())).toBe(false);
  });
  it("nur Bestätigung reicht nicht — alle Pflicht-Sections müssen grün sein", () => {
    const s = makeState({ bestaetigt: true });
    expect(isFormComplete(s)).toBe(false);
  });
  it("voll ausgefüllter State ist complete", () => {
    const s = makeState({
      name: "Test", traeger: "X", strasse: "Hauptstr", hausnummer: "1",
      plz: "97070", ort: "Würzburg", haushaltsjahr: 2026,
      ansprechpartner: "M", telefon: "0931", email: "m@x.de",
      bankverbindung: "Sparkasse",
      iban: "DE89370400440532013000", bic: "BYLADEM1SWU",
      oeffnungszeiten: FULL_WOCHENPLAN,
      betriebskosten_vorjahr_euro: 10000,
      personalkosten_vorjahr_euro: 50000,
      raeume_vorhanden: "ja",
      raeume_unentgeltlich: "nein",
      bestaetigt: true,
    });
    expect(isFormComplete(s)).toBe(true);
  });
});
