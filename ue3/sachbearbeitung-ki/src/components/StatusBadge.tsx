import { Badge } from "./ui/badge";
import { STATUS_LABELS, type Status } from "../lib/workflow";

const COLORS: Record<Status, string> = {
  eingegangen: "bg-blue-100 text-blue-800 border border-blue-300",
  in_pruefung: "bg-amber-100 text-amber-800 border border-amber-300",
  rueckfrage: "bg-orange-100 text-orange-800 border border-orange-300",
  bewilligt: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  abgelehnt: "bg-rose-100 text-rose-800 border border-rose-300",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge variant="outline" className={COLORS[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
