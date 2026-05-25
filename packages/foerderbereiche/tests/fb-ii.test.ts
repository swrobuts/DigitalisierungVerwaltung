import { describe, expect, it } from "vitest";
import { FB_II } from "../src/fb-ii.config";
import { evaluateRule } from "../src/validator";

describe("FB II — Engagement", () => {
  it("hat ID II und Label Engagement", () => {
    expect(FB_II.id).toBe("II");
    expect(FB_II.label_kurz).toBe("Engagement");
  });
  it("Pflichtfelder enthalten Helfer-Kennzahlen", () => {
    expect(FB_II.pflichtfelder).toContain("ehrenamt_titel");
    expect(FB_II.pflichtfelder).toContain("anzahl_helfer_vorjahr");
    expect(FB_II.pflichtfelder).toContain("gesamt_helferstunden_vorjahr");
  });
  it("Helferliste-Slot ist optional", () => {
    const helferliste = FB_II.anlagen.find(a => a.typ === "helferliste");
    expect(helferliste).toBeDefined();
    expect(helferliste?.pflicht).toBe(false);
  });
  it("quelle_pdf verweist auf antrag-ahp-2", () => {
    expect(FB_II.quelle_pdf).toContain("antrag-ahp-2");
  });
  it("min-Regel anzahl_helfer_vorjahr akzeptiert ≥0, lehnt <0 ab", () => {
    const rule = FB_II.validation_rules.find(r => r.feld === "anzahl_helfer_vorjahr");
    expect(rule).toBeDefined();
    expect(evaluateRule(rule!, 5)).toBe(true);
    expect(evaluateRule(rule!, -1)).toBe(false);
  });
});
