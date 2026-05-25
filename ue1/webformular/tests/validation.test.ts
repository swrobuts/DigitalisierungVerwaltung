import { describe, it, expect } from "vitest";
import { isEmail, isPLZ, isIBAN, nonEmpty } from "../src/lib/validation";

describe("validation helpers", () => {
  it("isEmail akzeptiert valide Adressen", () => {
    expect(isEmail("a@b.de")).toBe(true);
    expect(isEmail("vorname.nachname@verein.org")).toBe(true);
  });
  it("isEmail lehnt invalide Adressen ab", () => {
    expect(isEmail("kein-email")).toBe(false);
    expect(isEmail("a@b")).toBe(false);
    expect(isEmail("@b.de")).toBe(false);
  });
  it("isPLZ akzeptiert nur 5-stellige Zahlenketten", () => {
    expect(isPLZ("97070")).toBe(true);
    expect(isPLZ("9707")).toBe(false);
    expect(isPLZ("abcde")).toBe(false);
  });
  it("isIBAN — Mod-97-Prüfung", () => {
    // bekannte gültige DE-IBAN aus Bundesbank-Doku
    expect(isIBAN("DE89370400440532013000")).toBe(true);
    expect(isIBAN("DE89 3704 0044 0532 0130 00")).toBe(true);
    // Prüfziffer kaputt
    expect(isIBAN("DE89370400440532013001")).toBe(false);
    // Form völlig falsch
    expect(isIBAN("xx")).toBe(false);
  });
  it("nonEmpty", () => {
    expect(nonEmpty("")).toBe(false);
    expect(nonEmpty(" ")).toBe(false);
    expect(nonEmpty("a")).toBe(true);
    expect(nonEmpty(0)).toBe(true);
    expect(nonEmpty(NaN)).toBe(false);
    expect(nonEmpty([])).toBe(false);
    expect(nonEmpty([1])).toBe(true);
  });
});
