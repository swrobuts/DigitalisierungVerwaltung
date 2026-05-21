import { describe, expect, it } from "vitest";
import { isValidIBAN, isValidEmail, isValidPLZ, isValidPastOrTodayISO, isPositiveEuro } from "../src/validation";

describe("isValidIBAN", () => {
  it("akzeptiert eine gültige DE-IBAN", () => {
    expect(isValidIBAN("DE89 3704 0044 0532 0130 00")).toBe(true);
  });
  it("akzeptiert ohne Leerzeichen", () => {
    expect(isValidIBAN("DE89370400440532013000")).toBe(true);
  });
  it("lehnt falsche Prüfziffer ab", () => {
    expect(isValidIBAN("DE89 3704 0044 0532 0130 01")).toBe(false);
  });
  it("lehnt Unsinn ab", () => {
    expect(isValidIBAN("HALLO")).toBe(false);
  });
  it("lehnt Leerstring ab", () => {
    expect(isValidIBAN("")).toBe(false);
  });
  it("akzeptiert IBAN in Kleinbuchstaben", () => {
    expect(isValidIBAN("de89 3704 0044 0532 0130 00")).toBe(true);
  });
});

describe("isValidEmail", () => {
  it("akzeptiert valide E-Mail", () => {
    expect(isValidEmail("kontakt@wuerzburg.de")).toBe(true);
  });
  it("lehnt fehlendes @ ab", () => {
    expect(isValidEmail("kontakt-wuerzburg.de")).toBe(false);
  });
  it("lehnt Leerstring ab", () => {
    expect(isValidEmail("")).toBe(false);
  });
});

describe("isValidPastOrTodayISO", () => {
  it("akzeptiert heute", () => {
    const heute = new Date().toISOString().slice(0, 10);
    expect(isValidPastOrTodayISO(heute)).toBe(true);
  });
  it("akzeptiert gestern", () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const gestern = d.toLocaleDateString("sv");  // sv-Locale = YYYY-MM-DD lokal
    expect(isValidPastOrTodayISO(gestern)).toBe(true);
  });
  it("lehnt morgen ab", () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const morgen = d.toLocaleDateString("sv");
    expect(isValidPastOrTodayISO(morgen)).toBe(false);
  });
  it("lehnt Nicht-ISO ab", () => {
    expect(isValidPastOrTodayISO("17.05.2026")).toBe(false);
  });
  it("lehnt nicht-existierende Kalenderdaten ab (29. Februar 2023)", () => {
    expect(isValidPastOrTodayISO("2023-02-29")).toBe(false);
  });
  it("lehnt nicht-existierende Kalenderdaten ab (30. Februar 2026)", () => {
    expect(isValidPastOrTodayISO("2026-02-30")).toBe(false);
  });
  it("lehnt nicht-existierende Kalenderdaten ab (31. April 2026)", () => {
    expect(isValidPastOrTodayISO("2026-04-31")).toBe(false);
  });
});

describe("isValidIBAN (weitere Länder)", () => {
  it("akzeptiert valide AT-IBAN", () => {
    expect(isValidIBAN("AT611904300234573201")).toBe(true);
  });
  it("lehnt zu kurze IBAN ab", () => {
    expect(isValidIBAN("DE89")).toBe(false);
  });
});

describe("isValidEmail (weitere Fälle)", () => {
  it("akzeptiert Adressen mit Dot/Plus/Subdomain", () => {
    expect(isValidEmail("a.b+c@example.co.uk")).toBe(true);
  });
  it("lehnt Adressen ohne TLD ab", () => {
    expect(isValidEmail("foo@bar")).toBe(false);
  });
});

describe("isValidPLZ", () => {
  it("akzeptiert 5-stellige Zahlen", () => {
    expect(isValidPLZ("97070")).toBe(true);
  });
  it("lehnt kürzere ab", () => {
    expect(isValidPLZ("9707")).toBe(false);
  });
  it("lehnt Buchstaben ab", () => {
    expect(isValidPLZ("97A70")).toBe(false);
  });
});

describe("isPositiveEuro", () => {
  it("akzeptiert positive Beträge", () => {
    expect(isPositiveEuro(1)).toBe(true);
    expect(isPositiveEuro(123.45)).toBe(true);
  });
  it("lehnt 0 und Negative ab", () => {
    expect(isPositiveEuro(0)).toBe(false);
    expect(isPositiveEuro(-1)).toBe(false);
  });
  it("lehnt NaN/Infinity ab", () => {
    expect(isPositiveEuro(NaN)).toBe(false);
    expect(isPositiveEuro(Infinity)).toBe(false);
  });
});
