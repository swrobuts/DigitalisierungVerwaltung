/**
 * Pure-Funktion: Wert + FieldSchema → Klartext-String für die Anzeige.
 *
 * Kein React, kein DOM — so reine Logik bleibt testbar und wird auch
 * vom UE4-Agent für Validierungs-Strings wiederverwendbar.
 */
import {
  formatBool,
  formatDate,
  formatEuro,
  formatNumber,
  formatPercent,
  formatText,
} from "./format";
import type { FieldSchema } from "./types";

export function renderFieldValue<T>(
  schema: FieldSchema<T>,
  data: T,
): string {
  if (schema.type === "computed") {
    const v = schema.compute ? schema.compute(data) : undefined;
    // Computed-Felder werden typisch als Number/Euro behandelt — wir nehmen
    // den ersten sinnvollen Fall an. Für komplexere computed-Werte kann der
    // Aufrufer ein eigenes Field-Schema mit type="text" + compute nutzen.
    return typeof v === "number" ? formatEuro(v) : formatText(String(v ?? ""));
  }
  const raw = (data as Record<string, unknown>)[schema.key];
  switch (schema.type) {
    case "text":
    case "longtext":
      return formatText(raw as string | null | undefined);
    case "number":
      return formatNumber(raw as number | null | undefined);
    case "euro":
      return formatEuro(raw as number | null | undefined);
    case "percent":
      return formatPercent(raw as number | null | undefined);
    case "date":
      return formatDate(raw as string | null | undefined);
    case "bool":
      return formatBool(raw as boolean | null | undefined);
    case "enum": {
      const code = raw as string | null | undefined;
      if (code == null || code === "") return "—";
      return schema.enumLabels?.[code] ?? code;
    }
    case "list": {
      const arr = Array.isArray(raw) ? raw : [];
      if (arr.length === 0) return "—";
      return `${arr.length} ${arr.length === 1 ? "Eintrag" : "Einträge"}`;
    }
  }
}
