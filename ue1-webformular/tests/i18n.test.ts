import { describe, expect, it } from "vitest";
import { translations } from "../src/translations";
import { ALLE_SPRACHEN } from "../src/types";

describe("translations", () => {
  it("hat einen Block für jede Sprache", () => {
    for (const sprache of ALLE_SPRACHEN) {
      expect(translations[sprache], `Sprache ${sprache} fehlt`).toBeDefined();
    }
  });

  it("hat in allen Sprachen die gleichen Keys", () => {
    const referenz = Object.keys(translations.de).sort();
    for (const sprache of ALLE_SPRACHEN) {
      const keys = Object.keys(translations[sprache]).sort();
      expect(keys, `Keys in ${sprache} weichen ab`).toEqual(referenz);
    }
  });

  it("hat keine leeren Übersetzungen", () => {
    for (const sprache of ALLE_SPRACHEN) {
      for (const [key, wert] of Object.entries(translations[sprache])) {
        expect(wert.trim(), `Leerer Wert für ${sprache}.${key}`).not.toBe("");
      }
    }
  });
});

import { t, setSprache, getSprache } from "../src/i18n";

describe("i18n-Modul", () => {
  it("liefert Übersetzung für gesetzte Sprache", () => {
    setSprache("it");
    expect(t("form.button.absenden")).toBe("Invia domanda");
    setSprache("de");
    expect(t("form.button.absenden")).toBe("Antrag absenden");
  });

  it("fällt auf Key-String zurück, wenn Key in keiner Sprache existiert", () => {
    setSprache("it");
    expect(t("nicht.existierender.key")).toBe("nicht.existierender.key");
  });

  it("merkt sich aktuelle Sprache", () => {
    setSprache("tr");
    expect(getSprache()).toBe("tr");
    setSprache("de");
  });
});
