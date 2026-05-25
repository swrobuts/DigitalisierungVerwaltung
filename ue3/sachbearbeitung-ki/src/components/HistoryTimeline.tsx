import { formatDateTime } from "../lib/format";
import { STATUS_LABELS, type Status } from "../lib/workflow";
import type { AntragHistory } from "@dv/data-layer";

function label(s: string | null): string {
  if (!s) return "Eingang";
  return STATUS_LABELS[s as Status] ?? s;
}

export function HistoryTimeline({ history }: { history: AntragHistory[] }) {
  if (history.length === 0)
    return <p className="text-slate-500 text-sm">Keine History-Einträge.</p>;
  return (
    <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
      {history.map((h) => (
        <li key={h.id} className="relative">
          <span className="absolute -left-[1.4rem] top-1.5 h-3 w-3 rounded-full bg-slate-400" />
          <p className="text-sm">
            <span className="font-semibold">
              {label(h.von_status)} → {label(h.nach_status)}
            </span>
          </p>
          <p className="text-xs text-slate-500">
            {formatDateTime(h.geaendert_am)} · {h.geaendert_von ?? "—"}
          </p>
          {h.kommentar && (
            <p className="text-sm text-slate-700 mt-1 italic">„{h.kommentar}"</p>
          )}
        </li>
      ))}
    </ol>
  );
}
