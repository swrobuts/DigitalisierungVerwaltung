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

  // Step 5 — Bemessung Vorjahr. OPTIONAL: PDF fragt diese Werte nicht
  // ab; nur bei FB-III.2 (Begegnungszentren) und FB-III.3 (Bildungs-
  // träger) faktisch erforderlich. Klassifizierung durch Sozialreferat.
  it("Step 5 (Bemessung) leer ist jetzt complete (optional)", () => {
    expect(isStepComplete(5, initialState())).toBe(true);
  });
  it("Step 5 (Bemessung) mit allen drei Werten ist complete", () => {
    const s = makeState({
      anzahl_teilnehmer_vorjahr: 35,
      stadtbewohner_anteil_vorjahr: 0.7,
      anzahl_veranstaltungen_vorjahr: 48,
    });
    expect(isStepComplete(5, s)).toBe(true);
  });
  it("Step 5 (Bemessung) lehnt Stadt-Anteil > 1 ab, wenn befüllt", () => {
    const s = makeState({
      anzahl_teilnehmer_vorjahr: 35,
      stadtbewohner_anteil_vorjahr: 1.5,
      anzahl_veranstaltungen_vorjahr: 48,
    });
    expect(isStepComplete(5, s)).toBe(false);
  });
  it("Step 5 akzeptiert 0 als gültigen Wert (Erstantrag ohne Vorjahres-Daten)", () => {
    const s = makeState({
      anzahl_teilnehmer_vorjahr: 0,
      stadtbewohner_anteil_vorjahr: 0,
      anzahl_veranstaltungen_vorjahr: 0,
    });
    expect(isStepComplete(5, s)).toBe(true);
  });
  it("Step 5 mit Teil-Befüllung (nur Stadt-Anteil, Rest null) ist complete", () => {
    const s = makeState({
      anzahl_teilnehmer_vorjahr: null,
      stadtbewohner_anteil_vorjahr: 0.7,
      anzahl_veranstaltungen_vorjahr: null,
    });
    expect(isStepComplete(5, s)).toBe(true);
  });
  it("Step 5 mit negativem Teilnehmer-Wert ist nicht complete", () => {
    const s = makeState({
      anzahl_teilnehmer_vorjahr: -1,
      stadtbewohner_anteil_vorjahr: null,
      anzahl_veranstaltungen_vorjahr: null,
    });
    expect(isStepComplete(5, s)).toBe(false);
  });

  // Step 6 — Programm.
  it("Step 6 ohne Programm-Flyer und ohne Wochenplan ist nicht complete", () => {
    expect(isStepComplete(6, initialState())).toBe(false);
  });
  it("Step 6 mit Programm-Flyer ist complete", () => {
    const s = makeState({ programm_flyer: new File([], "p.pdf") });
    expect(isStepComplete(6, s)).toBe(true);
  });
  it("Step 6 mit ausgefülltem Wochenplan reicht auch", () => {
    const s = makeState({ oeffnungszeiten: FULL_WOCHENPLAN });
    expect(isStepComplete(6, s)).toBe(true);
  });

  // Step 7 — Bestätigung.
  it("Step 7 braucht Bestätigung", () => {
    expect(isStepComplete(7, initialState())).toBe(false);
    const s = makeState({ bestaetigt: true });
    expect(isStepComplete(7, s)).toBe(true);
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
  it("State ohne Bemessungs-Werte ist trotzdem complete (Step 5 optional)", () => {
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
      // Bemessung: alles leer
      anzahl_teilnehmer_vorjahr: null,
      stadtbewohner_anteil_vorjahr: null,
      anzahl_veranstaltungen_vorjahr: null,
      bestaetigt: true,
    });
    expect(isFormComplete(s)).toBe(true);
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
      anzahl_teilnehmer_vorjahr: 35,
      stadtbewohner_anteil_vorjahr: 0.7,
      anzahl_veranstaltungen_vorjahr: 48,
      bestaetigt: true,
    });
    expect(isFormComplete(s)).toBe(true);
  });
});
