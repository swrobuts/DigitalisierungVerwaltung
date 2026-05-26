/**
 * Unit-Tests für renderFieldValue() — pure Funktion ohne React-DOM.
 */
import { describe, expect, it } from "vitest";
import { renderFieldValue } from "../src/render";
import type { FieldSchema } from "../src/types";

describe("renderFieldValue", () => {
  it("text: zeigt Wert oder Dash", () => {
    const f: FieldSchema = { key: "x", label: "x", type: "text" };
    expect(renderFieldValue(f, { x: "hallo" })).toBe("hallo");
    expect(renderFieldValue(f, { x: null })).toBe("—");
    expect(renderFieldValue(f, { x: "" })).toBe("—");
  });

  it("number: lokalisiert", () => {
    const f: FieldSchema = { key: "x", label: "x", type: "number" };
    expect(renderFieldValue(f, { x: 1234 })).toBe("1.234");
    expect(renderFieldValue(f, { x: null })).toBe("—");
  });

  it("euro: € + Komma", () => {
    const f: FieldSchema = { key: "x", label: "x", type: "euro" };
    expect(renderFieldValue(f, { x: 1500 })).toMatch(/1\.500,00.*€/);
    expect(renderFieldValue(f, { x: null })).toBe("—");
  });

  it("percent: 0..1 → XX %", () => {
    const f: FieldSchema = { key: "x", label: "x", type: "percent" };
    expect(renderFieldValue(f, { x: 0.65 })).toBe("65 %");
    expect(renderFieldValue(f, { x: null })).toBe("—");
  });

  it("date: ISO → DE", () => {
    const f: FieldSchema = { key: "x", label: "x", type: "date" };
    expect(renderFieldValue(f, { x: "2026-03-15" })).toBe("15.03.2026");
    expect(renderFieldValue(f, { x: null })).toBe("—");
  });

  it("bool: ja/nein/—", () => {
    const f: FieldSchema = { key: "x", label: "x", type: "bool" };
    expect(renderFieldValue(f, { x: true })).toBe("ja");
    expect(renderFieldValue(f, { x: false })).toBe("nein");
    expect(renderFieldValue(f, { x: null })).toBe("—");
  });

  it("enum: Klartext-Label aus enumLabels", () => {
    const f: FieldSchema = {
      key: "schwelle",
      label: "Treffen-Schwelle",
      type: "enum",
      enumLabels: { GT_10: "Über 10", GT_20: "Über 20" },
    };
    expect(renderFieldValue(f, { schwelle: "GT_20" })).toBe("Über 20");
    expect(renderFieldValue(f, { schwelle: "UNKNOWN" })).toBe("UNKNOWN");
    expect(renderFieldValue(f, { schwelle: null })).toBe("—");
  });

  it("computed: nutzt compute-Funktion", () => {
    const f: FieldSchema<{ a: number; b: number }> = {
      key: "sum",
      label: "Summe",
      type: "computed",
      compute: (d) => d.a + d.b,
    };
    expect(renderFieldValue(f, { a: 100, b: 50 })).toMatch(/150,00.*€/);
  });

  it("list: Kurz-Zähler", () => {
    const f: FieldSchema = { key: "items", label: "Items", type: "list" };
    expect(renderFieldValue(f, { items: [{ x: 1 }, { x: 2 }] })).toBe("2 Einträge");
    expect(renderFieldValue(f, { items: [{ x: 1 }] })).toBe("1 Eintrag");
    expect(renderFieldValue(f, { items: [] })).toBe("—");
  });
});
