import { describe, expect, it } from "vitest";
import { FB_IV } from "../src/fb-iv.config";

describe("FB IV — Schwerpunkt", () => {
  it("hat ID IV und Label Schwerpunkt", () => {
    expect(FB_IV.id).toBe("IV");
    expect(FB_IV.label_kurz).toBe("Schwerpunkt");
  });
  it("Pflichtfelder enthalten Vorhaben + Kurzbeschreibung", () => {
    expect(FB_IV.pflichtfelder).toContain("vorhaben_titel");
    expect(FB_IV.pflichtfelder).toContain("kurzbeschreibung");
    expect(FB_IV.pflichtfelder).toContain("geplante_massnahmen");
  });
  it("Sonstige-Anlage ist optional", () => {
    const sonstige = FB_IV.anlagen.find(a => a.typ === "sonstige");
    expect(sonstige).toBeDefined();
    expect(sonstige?.pflicht).toBe(false);
  });
  it("quelle_pdf verweist auf Förderrichtlinie", () => {
    expect(FB_IV.quelle_pdf).toContain("ahp-foerderrichtlinie");
  });
});
