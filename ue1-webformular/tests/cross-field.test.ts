import { describe, expect, it } from "vitest";
import { validateCrossField } from "../src/cross-field";
import type { APL2Antrag } from "../src/types";

const minimalValid: APL2Antrag = {
  haushaltsjahr: 2026,
  name: "Test-Altentagesstätte",
  anschrift: "Musterstraße 1, 97070 Würzburg",
  traeger: "Diakonie e.V.",
  bankverbindung: "Sparkasse Mainfranken",
  iban: "DE89 3704 0044 0532 0130 00",
  bic: "",
  ansprechpartner: "Erika Mustermann",
  telefon: "0931 1234567",
  email: "kontakt@test.de",
  betriebskostenVorjahrEuro: 10000,
  personalkostenVorjahrEuro: 50000,
  raeumeVorhanden: "ja",
  raeumeUnentgeltlich: "nein",
  monatlicheMieteEuro: 0,
  antragsdatum: new Date().toISOString().slice(0, 10),
  anlagen: [
    { typ: "programm-altentagesstaette", dateiname: "p.pdf", groesseBytes: 1000, mimeType: "application/pdf" },
    { typ: "anlage-1-kostennachweis", dateiname: "a.pdf", groesseBytes: 1000, mimeType: "application/pdf" },
    { typ: "personalkostenbelege", dateiname: "b.pdf", groesseBytes: 1000, mimeType: "application/pdf" },
  ],
};

describe("validateCrossField", () => {
  it("akzeptiert minimal validen Antrag (Räume vorhanden, keine Miete)", () => {
    expect(validateCrossField(minimalValid)).toEqual({});
  });

  it("fordert Miete > 0, wenn weder eigene noch unentgeltliche Räume", () => {
    const antrag = { ...minimalValid, raeumeVorhanden: "nein" as const, raeumeUnentgeltlich: "nein" as const, monatlicheMieteEuro: 0 };
    const errors = validateCrossField(antrag);
    expect(errors.monatlicheMieteEuro).toBeDefined();
  });

  it("fordert Mietvertrags-Anlage, wenn Miete > 0", () => {
    const antrag = { ...minimalValid, monatlicheMieteEuro: 500 };
    const errors = validateCrossField(antrag);
    expect(errors.mietvertrag).toBeDefined();
  });

  it("akzeptiert Miete + Mietvertrags-Anlage", () => {
    const antrag = {
      ...minimalValid,
      monatlicheMieteEuro: 500,
      anlagen: [
        ...minimalValid.anlagen,
        { typ: "mietvertrag" as const, dateiname: "m.pdf", groesseBytes: 1000, mimeType: "application/pdf" },
      ],
    };
    expect(validateCrossField(antrag)).toEqual({});
  });

  it("fordert Pflicht-Anlagen", () => {
    const antrag = { ...minimalValid, anlagen: [] };
    const errors = validateCrossField(antrag);
    expect(errors["programm-altentagesstaette"]).toBeDefined();
    expect(errors["anlage-1-kostennachweis"]).toBeDefined();
    expect(errors["personalkostenbelege"]).toBeDefined();
  });
});
