import { STATUS_LABELS, type Status } from "../lib/workflow";

/** Farb-Schema pro Status. Eigene Implementation statt Badge-Variante,
 * weil die outline-Variante bg-white/text-slate-700 ergänzt und damit
 * die semantischen Farben überschreiben würde. */
const COLORS: Record<Status, string> = {
  eingegangen: "bg-blue-50 text-blue-800 border-blue-300",
  in_pruefung: "bg-amber-50 text-amber-800 border-amber-300",
  rueckfrage:  "bg-orange-50 text-orange-800 border-orange-300",
  bewilligt:   "bg-emerald-50 text-emerald-800 border-emerald-300",
  abgelehnt:   "bg-rose-50 text-rose-800 border-rose-300",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium " +
        COLORS[status]
      }
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
