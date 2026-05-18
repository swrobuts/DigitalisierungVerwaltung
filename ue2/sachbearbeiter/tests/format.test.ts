import { describe, it, expect } from "vitest";
import { formatEuro, formatDateTime, formatAdresse } from "../src/lib/format";

describe("formatEuro", () => {
  it("formatiert positive Beträge", () => {
    expect(formatEuro(1234.56)).toBe("1.234,56 €");
  });
  it("formatiert Null", () => {
    expect(formatEuro(0)).toBe("0,00 €");
  });
});

describe("formatDateTime", () => {
  it("formatiert ISO-Datetime in deutsches Format", () => {
    expect(formatDateTime("2026-05-18T14:32:00Z")).toMatch(/18\.05\.2026/);
  });
});

describe("formatAdresse", () => {
  it("setzt 4 atomare Adressfelder zusammen", () => {
    expect(formatAdresse("Karmelitenstraße", "43", "97070", "Würzburg")).toBe(
      "Karmelitenstraße 43, 97070 Würzburg",
    );
  });
});
