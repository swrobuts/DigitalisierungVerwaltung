import { describe, expect, it } from "vitest";
import { validateCrossField } from "../src/cross-field";
import { initialState } from "../src/state";
import type { FormState } from "../src/types";

function makeState(overrides: Partial<FormState> = {}): FormState {
  return { ...initialState(), ...overrides };
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
