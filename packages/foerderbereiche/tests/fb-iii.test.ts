import { describe, expect, it } from "vitest";
import { FB_III, FB_III_VARIANTEN } from "../src/fb-iii.config";

describe("FB III — Bewährte Strukturen", () => {
  it("hat ID III", () => {
    expect(FB_III.id).toBe("III");
  });
  it("FB_III_VARIANTEN hat genau die Keys A,B,C,D", () => {
    expect(Object.keys(FB_III_VARIANTEN).sort()).toEqual(["A", "B", "C", "D"]);
  });
  it("Variante A: Höchstgrenze 10000", () => {
    expect(FB_III_VARIANTEN.A.foerderhoechstgrenze_euro).toBe(10000);
  });
  it("Variante B: Höchstgrenze 10000 + Pflicht-Stadtanteil", () => {
    expect(FB_III_VARIANTEN.B.foerderhoechstgrenze_euro).toBe(10000);
    expect(FB_III_VARIANTEN.B.pflichtfelder).toContain("b_stadtbewohner_anteil");
  });
  it("Variante C: Höchstgrenze 2000 + treffen_schwelle Pflicht", () => {
    expect(FB_III_VARIANTEN.C.foerderhoechstgrenze_euro).toBe(2000);
    expect(FB_III_VARIANTEN.C.pflichtfelder).toContain("c_treffen_schwelle");
  });
  it("Variante D: Höchstgrenze 7500", () => {
    expect(FB_III_VARIANTEN.D.foerderhoechstgrenze_euro).toBe(7500);
  });
  it("quelle_pdf matched /antrag-ahp-3/", () => {
    expect(FB_III.quelle_pdf).toMatch(/antrag-ahp-3/);
  });
});
