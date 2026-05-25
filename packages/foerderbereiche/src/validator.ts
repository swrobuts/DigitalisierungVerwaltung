import type { ValidationRule } from "./types";

/**
 * Evaluiert eine ValidationRule gegen einen Wert.
 *
 * Liefert `true` wenn die Regel erfüllt ist (Wert gültig),
 * sonst `false` (→ `rule.fehlermeldung` an den User anzeigen).
 *
 * Sicher gegen Code-Injection — keine eval/Function-Konstruktion
 * außer dem RegExp aus `rule.pattern` (RegExp führt keinen Code aus).
 */
export function evaluateRule(rule: ValidationRule, value: unknown): boolean {
  switch (rule.kind) {
    case "min":
      return typeof value === "number" && value >= rule.value;
    case "max":
      return typeof value === "number" && value <= rule.value;
    case "min_length":
      return typeof value === "string" && value.length >= rule.value;
    case "max_length":
      return typeof value === "string" && value.length <= rule.value;
    case "enum":
      return typeof value === "string" && rule.values.includes(value);
    case "regex":
      return typeof value === "string" && new RegExp(rule.pattern).test(value);
  }
}
