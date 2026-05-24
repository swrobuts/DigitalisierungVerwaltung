import { describe, expect, it } from "vitest";
import { antragsfristHinweis, validateCrossField } from "../src/cross-field";
import { initialState } from "../src/state";
import type { FormState } from "../src/types";

function makeState(overrides: Partial<FormState> = {}): FormState {
  // Default: Antragsdatum auf 1. Februar des Haushaltsjahres setzen,
  // damit der Frist-Hinweis nicht aus Versehen die Räume-Tests stört.
  const base = initialState();
  return {
    ...base,
    antragsdatum: `${base.haushaltsjahr}-02-01`,
    ...overrides,
  };
}

describe("validateCrossField", () => {
  it("liefert keinen Fehler, wenn eigene Räume vorhanden sind", () => {
    const s = makeState({ raeume_vorhanden: "ja", raeume_unentgeltlich: "nein", monatliche_miete_euro: 0 });
    expect(validateCrossField(s)).toEqual({});
  });

  it("liefert keinen Fehler, wenn unentgeltliche Räume bereitgestellt sind", () => {
    const s = makeState({ raeume_vorhanden: "nein", raeume_unentgeltlich: "ja", monatliche_miete_euro: 0 });
    expect(validateCrossField(s)).toEqual({});
  });

  it("fordert Miete > 0, wenn weder eigene noch unentgeltliche Räume", () => {
    const s = makeState({ raeume_vorhanden: "nein", raeume_unentgeltlich: "nein", monatliche_miete_euro: 0 });
    const errors = validateCrossField(s);
    expect(errors.monatliche_miete_euro).toBeDefined();
  });

  it("akzeptiert null-Miete als Fehlerfall, wenn keine Räume", () => {
    const s = makeState({ raeume_vorhanden: "nein", raeume_unentgeltlich: "nein", monatliche_miete_euro: null });
    const errors = validateCrossField(s);
    expect(errors.monatliche_miete_euro).toBeDefined();
  });

  it("akzeptiert positive Miete bei fehlenden Räumen", () => {
    const s = makeState({ raeume_vorhanden: "nein", raeume_unentgeltlich: "nein", monatliche_miete_euro: 500 });
    expect(validateCrossField(s)).toEqual({});
  });
});

describe("antragsfristHinweis (AHP 3.3 — 1.-April-Frist)", () => {
  it("liefert keinen Hinweis bei Antragsdatum vor 1. April im Haushaltsjahr", () => {
    expect(antragsfristHinweis("2026-03-31", 2026)).toBeNull();
  });
  it("liefert keinen Hinweis am Stichtag (1. April)", () => {
    expect(antragsfristHinweis("2026-04-01", 2026)).toBeNull();
  });
  it("liefert Hinweis ab 2. April des Haushaltsjahres", () => {
    const h = antragsfristHinweis("2026-04-02", 2026);
    expect(h).not.toBeNull();
    expect(h).toContain("1.-April-Stichtag");
  });
  it("liefert Hinweis im Mai des Haushaltsjahres", () => {
    const h = antragsfristHinweis("2026-05-15", 2026);
    expect(h).not.toBeNull();
    expect(h).toContain("2026");
  });
  it("liefert keinen Hinweis, wenn Antragsdatum im Vorjahr des Haushaltsjahres", () => {
    // Antrag im Vorlauf für nächstes Haushaltsjahr — fristkonform.
    expect(antragsfristHinweis("2025-11-10", 2026)).toBeNull();
  });
  it("liefert Hinweis, wenn Antragsdatum.year > haushaltsjahr (rückwirkender Antrag)", () => {
    const h = antragsfristHinweis("2027-02-15", 2026);
    expect(h).not.toBeNull();
    expect(h).toContain("abgelaufenes");
  });
  it("akzeptiert leeren/kaputten Input ohne Crash", () => {
    expect(antragsfristHinweis("", 2026)).toBeNull();
    expect(antragsfristHinweis("garbage", 2026)).toBeNull();
    expect(antragsfristHinweis("2026-XX-YY", 2026)).toBeNull();
  });
});

describe("validateCrossField — Antragsfrist", () => {
  it("setzt antragsdatum-Hinweis bei verfristetem Datum", () => {
    const s = makeState({ antragsdatum: "2026-05-20", haushaltsjahr: 2026 });
    const errors = validateCrossField(s);
    expect(errors.antragsdatum).toBeDefined();
    expect(errors.antragsdatum).toContain("1.-April");
  });
  it("setzt keinen antragsdatum-Hinweis bei fristgerechtem Datum", () => {
    const s = makeState({ antragsdatum: "2026-03-15", haushaltsjahr: 2026 });
    const errors = validateCrossField(s);
    expect(errors.antragsdatum).toBeUndefined();
  });
});
