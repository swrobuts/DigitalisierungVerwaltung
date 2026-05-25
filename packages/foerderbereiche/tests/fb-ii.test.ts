import { describe, expect, it } from "vitest";
import { FB_II } from "../src/fb-ii.config";

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
});
