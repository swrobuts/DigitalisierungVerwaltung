import { describe, it, expect } from "vitest";
import { parseEuro } from "../src/format";

describe("parseEuro", () => {
  it("parsed deutsches Format mit Tausenderpunkt + Komma", () => {
    expect(parseEuro("1.234,56")).toBe(1234.56);
  });
  it("parsed ohne Tausenderpunkt", () => {
    expect(parseEuro("1234,56")).toBe(1234.56);
  });
  it("parsed Ganzzahl", () => {
    expect(parseEuro("1234")).toBe(1234);
  });
  it("parsed mit € Suffix", () => {
    expect(parseEuro("1.234,56 €")).toBe(1234.56);
  });
  it("returnt NaN bei nicht-parsebarer Eingabe", () => {
    expect(parseEuro("abc")).toBeNaN();
  });
  it("returnt 0 bei leerem String", () => {
    expect(parseEuro("")).toBe(0);
  });
});
