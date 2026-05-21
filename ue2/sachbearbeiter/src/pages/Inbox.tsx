import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAntraege, type AntragRow } from "../hooks/useAntraege";
import { useUserRole } from "../hooks/useUserRole";
import { supabase } from "../lib/supabase";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatEuro } from "../lib/format";
import { STATUS_ORDER, STATUS_LABELS, type Status } from "../lib/workflow";

function totalEuro(a: AntragRow): number {
  return (
    Number(a.betriebskosten_vorjahr_euro ?? 0) +
    Number(a.personalkosten_vorjahr_euro ?? 0) +
    Number(a.miete_jahr_euro ?? 0)
  );
}
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

type SortKey = "antragsnummer" | "name" | "traeger" | "submitted_at" | "submitted_language" | "status" | "gesamt";
type SortDir = "asc" | "desc";
type GroupKey = "none" | "status" | "traeger" | "submitted_language";

const COLUMNS: Array<{ key: SortKey; label: string; align?: "right" }> = [
  { key: "antragsnummer", label: "Antragsnummer" },
  { key: "name", label: "Name" },
  { key: "traeger", label: "Träger" },
  { key: "submitted_at", label: "Eingegangen" },
  { key: "submitted_language", label: "Sprache" },
  { key: "status", label: "Status" },
  { key: "gesamt", label: "Gesamt", align: "right" },
];

const GROUP_OPTIONS: Array<{ key: GroupKey; label: string }> = [
  { key: "none", label: "Keine Gruppierung" },
  { key: "status", label: "Status" },
  { key: "traeger", label: "Träger" },
  { key: "submitted_language", label: "Sprache" },
];

function compareVals(a: AntragRow, b: AntragRow, key: SortKey, dir: SortDir): number {
  // Gesamt: numerisch (Beträge addieren)
  if (key === "gesamt") {
    const ta = totalEuro(a);
    const tb = totalEuro(b);
    return dir === "asc" ? ta - tb : tb - ta;
  }
  // Status: semantische Reihenfolge
  if (key === "status") {
    const ai = STATUS_ORDER.indexOf(a.status);
    const bi = STATUS_ORDER.indexOf(b.status);
    return dir === "asc" ? ai - bi : bi - ai;
  }
  const av = a[key as keyof AntragRow];
  const bv = b[key as keyof AntragRow];
  const sa = String(av ?? "").toLowerCase();
  const sb = String(bv ?? "").toLowerCase();
  if (sa < sb) return dir === "asc" ? -1 : 1;
  if (sa > sb) return dir === "asc" ? 1 : -1;
  return 0;
}

function groupLabel(key: GroupKey, val: string): string {
  if (key === "status") return STATUS_LABELS[val as Status] ?? val;
  if (key === "submitted_language") return val.toUpperCase();
  return val || "—";
}

export function Inbox() {
  const { antraege, loading, error } = useAntraege();
  const { rolle } = useUserRole();
  const [filter, setFilter] = useState<Set<Status>>(new Set());
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("submitted_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [groupBy, setGroupBy] = useState<GroupKey>("none");

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return antraege.filter((a) => {
      if (filter.size > 0 && !filter.has(a.status)) return false;
      if (
        s &&
        !`${a.antragsnummer} ${a.name} ${a.traeger}`.toLowerCase().includes(s)
      )
        return false;
      return true;
    });
  }, [antraege, filter, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    // Wenn gruppiert: primär nach Group-Key, sekundär nach Sort-Key
    arr.sort((a, b) => {
      if (groupBy !== "none") {
        const ga = String(a[groupBy as keyof AntragRow] ?? "");
        const gb = String(b[groupBy as keyof AntragRow] ?? "");
        if (groupBy === "status") {
          const ai = STATUS_ORDER.indexOf(ga as Status);
          const bi = STATUS_ORDER.indexOf(gb as Status);
          if (ai !== bi) return ai - bi;
        } else {
          if (ga < gb) return -1;
          if (ga > gb) return 1;
        }
      }
      return compareVals(a, b, sortKey, sortDir);
    });
    return arr;
  }, [filtered, sortKey, sortDir, groupBy]);

  function toggleStatus(s: Status) {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // Gruppierungs-Marker einfügen (mit Summen-Aggregation pro Gruppe)
  const rendered: Array<
    | { kind: "group"; label: string; count: number; summe: number }
    | { kind: "row"; antrag: AntragRow }
  > = [];
  if (groupBy === "none") {
    sorted.forEach((a) => rendered.push({ kind: "row", antrag: a }));
  } else {
    let currentGroup = "";
    const groupCounts = new Map<string, number>();
    const groupSums = new Map<string, number>();
    sorted.forEach((a) => {
      const g = String(a[groupBy as keyof AntragRow] ?? "");
      groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1);
      groupSums.set(g, (groupSums.get(g) ?? 0) + totalEuro(a));
    });
    sorted.forEach((a) => {
      const g = String(a[groupBy as keyof AntragRow] ?? "");
      if (g !== currentGroup) {
        rendered.push({
          kind: "group",
          label: groupLabel(groupBy, g),
          count: groupCounts.get(g) ?? 0,
          summe: groupSums.get(g) ?? 0,
        });
        currentGroup = g;
      }
      rendered.push({ kind: "row", antrag: a });
    });
  }

  // Footer-Summe (über alle gefilterten Anträge, unabhängig von Gruppierung)
  const gesamtSumme = filtered.reduce((s, a) => s + totalEuro(a), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Sachbearbeitung — APL 2</h1>
            <p className="text-sm text-slate-500">
              Stadt Würzburg · Beratungsstelle für Senioren
            </p>
          </div>
          <div className="text-sm text-slate-500">
            Rolle: <span className="font-medium">{rolle ?? "—"}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-3"
              onClick={() => supabase.auth.signOut()}
            >
              Abmelden
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-white border border-slate-200 rounded p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Suche (Name, Träger, Antragsnummer) …"
              className="max-w-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={`text-xs px-2 py-1 rounded border ${
                    filter.has(s)
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-slate-300"
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="group-by" className="text-slate-600">Gruppieren:</label>
              <select
                id="group-by"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupKey)}
                className="border border-slate-300 rounded px-2 py-1 text-sm"
              >
                {GROUP_OPTIONS.map((g) => (
                  <option key={g.key} value={g.key}>{g.label}</option>
                ))}
              </select>
            </div>
            <div className="ml-auto text-sm text-slate-500">
              {filtered.length} von {antraege.length}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          {loading && <div className="p-8 text-slate-500">Lade …</div>}
          {error && <div className="p-4 text-rose-700">{error}</div>}
          {!loading && !error && (
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((col) => {
                    const active = sortKey === col.key;
                    const arrow = active ? (sortDir === "asc" ? "▲" : "▼") : "";
                    return (
                      <TableHead key={col.key} className={col.align === "right" ? "text-right" : ""}>
                        <button
                          type="button"
                          onClick={() => handleSort(col.key)}
                          className={`inline-flex items-center gap-1 text-xs uppercase tracking-wide ${active ? "text-slate-900 font-semibold" : "text-slate-500 hover:text-slate-900"}`}
                        >
                          {col.label} <span className="text-[10px]">{arrow}</span>
                        </button>
                      </TableHead>
                    );
                  })}
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rendered.map((item, idx) =>
                  item.kind === "group" ? (
                    <TableRow key={`g-${idx}`} className="bg-slate-200/70">
                      <TableCell colSpan={6} className="border-t-2 border-slate-300 font-bold text-sm uppercase tracking-wide text-slate-700 py-3">
                        {item.label} <span className="text-slate-500 font-normal normal-case tracking-normal">· {item.count} {item.count === 1 ? "Antrag" : "Anträge"}</span>
                      </TableCell>
                      <TableCell className="border-t-2 border-slate-300 font-bold text-base text-right tabular-nums text-slate-900 py-3">
                        {formatEuro(item.summe)}
                      </TableCell>
                      <TableCell className="border-t-2 border-slate-300"></TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={item.antrag.id} className="hover:bg-blue-50/40">
                      <TableCell className="font-mono text-xs text-slate-600">{item.antrag.antragsnummer}</TableCell>
                      <TableCell>{item.antrag.name}</TableCell>
                      <TableCell className="text-slate-600">{item.antrag.traeger}</TableCell>
                      <TableCell className="text-xs text-slate-600">{formatDateTime(item.antrag.submitted_at)}</TableCell>
                      <TableCell><Badge variant="secondary">{item.antrag.submitted_language.toUpperCase()}</Badge></TableCell>
                      <TableCell><StatusBadge status={item.antrag.status} /></TableCell>
                      <TableCell className="text-right tabular-nums text-slate-700">{formatEuro(totalEuro(item.antrag))}</TableCell>
                      <TableCell>
                        <Link to={`/antrag/${item.antrag.id}`} className="text-blue-600 underline text-sm">Öffnen</Link>
                      </TableCell>
                    </TableRow>
                  ),
                )}
                {rendered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-slate-500 py-8">
                      Keine Anträge gefunden.
                    </TableCell>
                  </TableRow>
                )}
                {rendered.length > 0 && (
                  <TableRow className="bg-slate-900 text-white hover:bg-slate-900">
                    <TableCell colSpan={6} className="font-semibold text-sm py-3 uppercase tracking-wide">
                      Gesamt über alle angezeigten Anträge
                    </TableCell>
                    <TableCell className="font-bold text-base text-right tabular-nums py-3">
                      {formatEuro(gesamtSumme)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
}
