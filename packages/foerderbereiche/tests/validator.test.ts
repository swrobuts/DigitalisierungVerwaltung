import { describe, expect, it } from "vitest";
import { evaluateRule } from "../src/validator";
import type { ValidationRule } from "../src/types";

describe("evaluateRule — alle 6 kind-Branches", () => {
  describe("min", () => {
    const rule: ValidationRule = {
      feld: "x", kind: "min", value: 0,
      fehlermeldung: "darf nicht negativ sein",
    };
    it("akzeptiert Wert ≥ min", () => {
      expect(evaluateRule(rule, 0)).toBe(true);
      expect(evaluateRule(rule, 100)).toBe(true);
    });
    it("lehnt Wert < min ab", () => {
      expect(evaluateRule(rule, -1)).toBe(false);
    });
  });

  describe("max", () => {
    const rule: ValidationRule = {
      feld: "x", kind: "max", value: 10,
      fehlermeldung: "max 10",
    };
    it("akzeptiert Wert ≤ max", () => {
      expect(evaluateRule(rule, 10)).toBe(true);
      expect(evaluateRule(rule, 5)).toBe(true);
    });
    it("lehnt Wert > max ab", () => {
      expect(evaluateRule(rule, 11)).toBe(false);
    });
  });

  describe("min_length", () => {
    const rule: ValidationRule = {
      feld: "x", kind: "min_length", value: 3,
      fehlermeldung: "mind. 3 Zeichen",
    };
    it("akzeptiert String ≥ min_length", () => {
      expect(evaluateRule(rule, "abc")).toBe(true);
      expect(evaluateRule(rule, "abcdef")).toBe(true);
    });
    it("lehnt String < min_length ab", () => {
      expect(evaluateRule(rule, "ab")).toBe(false);
    });
  });

  describe("max_length", () => {
    const rule: ValidationRule = {
      feld: "x", kind: "max_length", value: 1000,
      fehlermeldung: "max 1000 Zeichen",
    };
    it("akzeptiert String ≤ max_length", () => {
      expect(evaluateRule(rule, "kurz")).toBe(true);
      expect(evaluateRule(rule, "a".repeat(1000))).toBe(true);
    });
    it("lehnt String > max_length ab", () => {
      expect(evaluateRule(rule, "a".repeat(1001))).toBe(false);
    });
  });

  describe("enum", () => {
    const rule: ValidationRule = {
      feld: "x", kind: "enum", values: ["A", "B", "C", "D"],
      fehlermeldung: "muss A/B/C/D sein",
    };
    it("akzeptiert Wert in enum", () => {
      expect(evaluateRule(rule, "A")).toBe(true);
      expect(evaluateRule(rule, "D")).toBe(true);
    });
    it("lehnt Wert außerhalb enum ab", () => {
      expect(evaluateRule(rule, "X")).toBe(false);
    });
  });

  describe("regex", () => {
    const rule: ValidationRule = {
      feld: "x", kind: "regex", pattern: "^[0-9]+$",
      fehlermeldung: "nur Ziffern",
    };
    it("akzeptiert passenden String", () => {
      expect(evaluateRule(rule, "12345")).toBe(true);
    });
    it("lehnt nicht passenden String ab", () => {
      expect(evaluateRule(rule, "12a45")).toBe(false);
    });
  });
});
