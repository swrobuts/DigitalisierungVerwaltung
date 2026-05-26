/**
 * Rendert eine SectionSchema → eine Liste von FieldRows.
 *
 * Behandelt die 3 Spezialfälle, die nicht ein simpler Label+Wert sind:
 *   - `longtext`: mehrzeilig (whitespace-pre-wrap)
 *   - `list` (jsonb-Array): aufgeklappte UL mit `itemSchema`
 *   - `computed`: berechneter Wert (Helper aus render.ts)
 */
import type { FieldSchema, SectionSchema } from "../types";
import {
  formatBool,
  formatDate,
  formatEuro,
  formatNumber,
  formatPercent,
  formatText,
} from "../format";
import { FieldRow } from "./FieldRow";

interface Props<T> {
  section: SectionSchema<T>;
  data: T;
}

export function SectionViewer<T>({
  section,
  data,
}: Props<T>) {
  if (section.conditional && !section.conditional(data)) return null;
  return (
    <div className="space-y-0">
      {section.fields.map((f) => (
        <FieldRow key={f.key} label={f.label} pflicht={f.pflicht}>
          {renderValue(f, data)}
        </FieldRow>
      ))}
    </div>
  );
}

function renderValue<T>(f: FieldSchema<T>, data: T) {
  if (f.type === "computed") {
    const v = f.compute ? f.compute(data) : undefined;
    return (
      <strong>{typeof v === "number" ? formatEuro(v) : formatText(String(v ?? ""))}</strong>
    );
  }
  const raw = (data as Record<string, unknown>)[f.key];
  switch (f.type) {
    case "text":
      return formatText(raw as string | null | undefined);
    case "longtext":
      return (
        <p className="whitespace-pre-wrap text-sm">
          {formatText(raw as string | null | undefined)}
        </p>
      );
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
      return f.enumLabels?.[code] ?? code;
    }
    case "list":
      return <ListValue items={raw} itemSchema={f.itemSchema} />;
  }
}

function ListValue({
  items,
  itemSchema,
}: {
  items: unknown;
  itemSchema?: ReadonlyArray<FieldSchema<Record<string, unknown>>>;
}) {
  const arr = Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
  if (arr.length === 0) return <>—</>;
  if (!itemSchema || itemSchema.length === 0) {
    return <>{arr.length} Einträge</>;
  }
  return (
    <ul className="list-disc pl-5 space-y-0.5">
      {arr.map((item, i) => (
        <li key={i}>
          {itemSchema
            .map((subF) => {
              const v = item[subF.key];
              if (subF.type === "euro") return formatEuro(v as number | null);
              if (subF.type === "number") return formatNumber(v as number | null);
              if (subF.type === "date") return formatDate(v as string | null);
              if (subF.type === "percent") return formatPercent(v as number | null);
              if (subF.type === "bool") return formatBool(v as boolean | null);
              return formatText(v as string | null);
            })
            .join(" — ")}
        </li>
      ))}
    </ul>
  );
}
