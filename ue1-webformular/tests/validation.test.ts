import { describe, expect, it } from "vitest";
import { isValidIBAN, isValidEmail, isValidPastOrTodayISO, isPositiveEuro } from "../src/validation";

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
    const gestern = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    expect(isValidPastOrTodayISO(gestern)).toBe(true);
  });
  it("lehnt morgen ab", () => {
    const morgen = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect(isValidPastOrTodayISO(morgen)).toBe(false);
  });
  it("lehnt Nicht-ISO ab", () => {
    expect(isValidPastOrTodayISO("17.05.2026")).toBe(false);
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
