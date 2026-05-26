/**
 * Render-Komponente für FB-II Helfer-Tabelle (1:n).
 *
 * Spalten kommen aus FB_II_HELFER_COLUMNS — identisches Schema wie der
 * UE1-Editor verwendet (perspektivisch). Heute: nur read-only Sicht.
 */
import type { FbIiHelfer } from "@dv/data-layer";
import { FB_II_HELFER_COLUMNS } from "../schemas/fb-ii.schema";
import { renderFieldValue } from "../render";

interface Props {
  helfer: FbIiHelfer[];
}

export function HelferTable({ helfer }: Props) {
  if (!helfer.length) {
    return <p className="text-xs text-slate-500">Keine Helfer:innen erfasst.</p>;
  }
  return (
    <div>
      <h4 className="text-xs uppercase tracking-wide text-slate-500 mb-2">
        Helfer-Liste ({helfer.length})
      </h4>
      <table className="w-full text-xs border border-slate-200 rounded">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {FB_II_HELFER_COLUMNS.map((c) => (
              <th
                key={c.key}
                className={`px-2 py-1 ${
                  c.type === "number" ? "text-right" : "text-left"
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {helfer.map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              {FB_II_HELFER_COLUMNS.map((c) => (
                <td
                  key={c.key}
                  className={`px-2 py-1 ${
                    c.type === "number"
                      ? "text-right tabular-nums"
                      : "text-slate-700"
                  }`}
                >
                  {renderFieldValue(c, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
