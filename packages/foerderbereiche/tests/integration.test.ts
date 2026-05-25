import { describe, expect, it } from "vitest";
import { ALL_FOERDERBEREICHE, konfigFor } from "../src";

describe("FB-Konfig-Integration", () => {
  it("ALL_FOERDERBEREICHE hat genau 4 Einträge", () => {
    expect(Object.keys(ALL_FOERDERBEREICHE).sort()).toEqual(["I", "II", "III", "IV"]);
  });
  it("Alle 4 haben unterschiedliche Labels", () => {
    const labels = Object.values(ALL_FOERDERBEREICHE).map(f => f.label_kurz);
    expect(new Set(labels).size).toBe(4);
  });
  it("Alle 4 haben quelle_pdf gesetzt", () => {
    for (const fb of Object.values(ALL_FOERDERBEREICHE)) {
      expect(fb.quelle_pdf).toMatch(/^materialien\//);
    }
  });
  it("konfigFor(id) liefert die richtige Konfig", () => {
    expect(konfigFor("I").label_kurz).toBe("Aufbau");
    expect(konfigFor("III").label_kurz).toBe("Bewährte Strukturen");
  });
  it("ALL_FOERDERBEREICHE ist frozen (Object.freeze)", () => {
    expect(Object.isFrozen(ALL_FOERDERBEREICHE)).toBe(true);
  });
  it("Mutationsversuch an ALL_FOERDERBEREICHE wirft (strict mode)", () => {
    expect(() => {
      (ALL_FOERDERBEREICHE as Record<string, unknown>).I = null;
    }).toThrow();
  });
});
