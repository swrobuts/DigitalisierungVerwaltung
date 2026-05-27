/**
 * VerlaufCard — Audit-Trail des Antrags als klappbare Card mit Sortier-
 * und Gruppier-Controls, passend in die rechte aside-Spalte von AntragDetail.
 *
 * Datenquelle: AntragHistory aus useAntrag-Bundle.
 */
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { formatDateTime } from "../lib/format";
import { STATUS_LABELS, type Status } from "../lib/workflow";
import type { AntragHistory } from "@dv/data-layer";

const SORTIER_LABELS = {
  datum_desc: "Neueste zuerst",
  datum_asc: "Älteste zuerst",
} as const;
type Sortieren = keyof typeof SORTIER_LABELS;

const GRUPPEN_LABELS = {
  keine: "Keine",
  tag: "Pro Tag",
  bearbeiter: "Pro Bearbeiter",
} as const;
type Gruppieren = keyof typeof GRUPPEN_LABELS;

interface Gruppe {
  titel: string | null;
  eintraege: AntragHistory[];
}

function labelStatus(s: string | null): string {
  if (!s) return "Eingang";
  return STATUS_LABELS[s as Status] ?? s;
}

export function VerlaufCard({ history }: { history: AntragHistory[] }) {
  const [open, setOpen] = useState(true);
  const [gruppieren, setGruppieren] = useState<Gruppieren>("keine");
  const [sortieren, setSortieren] = useState<Sortieren>("datum_desc");

  const gruppen = useMemo<Gruppe[]>(() => {
    const sortiert = [...history].sort((a, b) => {
      const cmp = a.geaendert_am.localeCompare(b.geaendert_am);
      return sortieren === "datum_desc" ? -cmp : cmp;
    });
    if (gruppieren === "keine") return [{ titel: null, eintraege: sortiert }];
    const map = new Map<string, AntragHistory[]>();
    for (const h of sortiert) {
      const key =
        gruppieren === "tag"
          ? h.geaendert_am.slice(0, 10) // YYYY-MM-DD
          : h.geaendert_von ?? "—";
      const list = map.get(key) ?? [];
      list.push(h);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, eintraege]) => ({
      titel:
        gruppieren === "tag"
          ? new Date(key).toLocaleDateString("de-DE", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })
          : key,
      eintraege,
    }));
  }, [history, gruppieren, sortieren]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 group"
            aria-expanded={open}
          >
            <ChevronDown
              className={
                "h-4 w-4 text-slate-500 transition-transform shrink-0 " +
                (open ? "" : "-rotate-90")
              }
            />
            <CardTitle>
              Verlauf
              <span className="ml-1.5 text-sm font-normal text-slate-500 tabular-nums">
                ({history.length})
              </span>
            </CardTitle>
          </button>
          {open && history.length > 1 && (
            <div className="flex items-center gap-1 text-xs">
              <Dropdown
                label="Gruppe"
                value={gruppieren}
                options={GRUPPEN_LABELS}
                onChange={(v) => setGruppieren(v as Gruppieren)}
              />
              <Dropdown
                label="Sortieren"
                value={sortieren}
                options={SORTIER_LABELS}
                onChange={(v) => setSortieren(v as Sortieren)}
              />
            </div>
          )}
        </div>
      </CardHeader>
      {open && (
        <CardContent>
          {history.length === 0 ? (
            <p className="text-slate-500 text-sm">Keine History-Einträge.</p>
          ) : (
            <div className="space-y-4">
              {gruppen.map((g, gi) => (
                <div key={gi}>
                  {g.titel && (
                    <div className="text-[11px] font-medium text-slate-500 mb-2 uppercase tracking-wide">
                      {g.titel}
                    </div>
                  )}
                  <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
                    {g.eintraege.map((h) => (
                      <li key={h.id} className="relative">
                        <span className="absolute -left-[1.4rem] top-1.5 h-3 w-3 rounded-full bg-slate-400" />
                        <p className="text-sm">
                          <span className="font-semibold">
                            {labelStatus(h.von_status)} →{" "}
                            {labelStatus(h.nach_status)}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(h.geaendert_am)} ·{" "}
                          {h.geaendert_von ?? "—"}
                        </p>
                        {h.kommentar && (
                          <p className="text-sm text-slate-700 mt-1 italic">
                            „{h.kommentar}"
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function Dropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1 text-slate-600">
      <span className="text-[10px] uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-wue-rot bg-white"
      >
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}
