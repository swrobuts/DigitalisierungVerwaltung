import { describe, expect, it } from "vitest";
import { FB_I } from "../src/fb-i.config";
import { evaluateRule } from "../src/validator";

describe("FB I — Aufbau", () => {
  it("hat ID I und Label Aufbau", () => {
    expect(FB_I.id).toBe("I");
    expect(FB_I.label_kurz).toBe("Aufbau");
  });
  it("Pflichtfelder enthalten projekt_titel + kosten", () => {
    expect(FB_I.pflichtfelder).toContain("projekt_titel");
    expect(FB_I.pflichtfelder).toContain("personalkosten_euro");
    expect(FB_I.pflichtfelder).toContain("sachkosten_euro");
  });
  it("Projektskizze ist Pflicht-Anlage", () => {
    const skizze = FB_I.anlagen.find(a => a.typ === "projektskizze");
    expect(skizze?.pflicht).toBe(true);
  });
  it("quelle_pdf verweist auf vorhandenes PDF", () => {
    expect(FB_I.quelle_pdf).toContain("antrag-ahp-1");
  });
  it("min-Regel personalkosten_euro akzeptiert ≥0, lehnt <0 ab", () => {
    const rule = FB_I.validation_rules.find(r => r.feld === "personalkosten_euro");
    expect(rule).toBeDefined();
    expect(evaluateRule(rule!, 100)).toBe(true);
    expect(evaluateRule(rule!, -1)).toBe(false);
  });
});
