import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAntraege, type AntragRow } from "../hooks/useAntraege";
import { useUserRole } from "../hooks/useUserRole";
import { supabase } from "../lib/supabase";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../lib/format";
import { STATUS_ORDER, STATUS_LABELS, type Status } from "../lib/workflow";
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

type SortKey = "antragsnummer" | "name" | "traeger" | "submitted_at" | "submitted_language" | "status";
type SortDir = "asc" | "desc";
type GroupKey = "none" | "status" | "traeger" | "submitted_language";

const COLUMNS: Array<{ key: SortKey; label: string; cls?: string }> = [
  { key: "antragsnummer", label: "Antragsnummer" },
  { key: "name", label: "Name" },
  { key: "traeger", label: "Träger" },
  { key: "submitted_at", label: "Eingegangen" },
  { key: "submitted_language", label: "Sprache" },
  { key: "status", label: "Status" },
];

const GROUP_OPTIONS: Array<{ key: GroupKey; label: string }> = [
  { key: "none", label: "Keine Gruppierung" },
  { key: "status", label: "Status" },
  { key: "traeger", label: "Träger" },
  { key: "submitted_language", label: "Sprache" },
];

function compareVals(a: AntragRow, b: AntragRow, key: SortKey, dir: SortDir): number {
  const av = a[key];
  const bv = b[key];
  // Status hat eine semantische Reihenfolge (eingegangen < in_pruefung < ...)
  if (key === "status") {
    const ai = STATUS_ORDER.indexOf(av as Status);
    const bi = STATUS_ORDER.indexOf(bv as Status);
    return dir === "asc" ? ai - bi : bi - ai;
  }
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

  // Gruppierungs-Marker einfügen
  const rendered: Array<{ kind: "group"; label: string; count: number } | { kind: "row"; antrag: AntragRow }> = [];
  if (groupBy === "none") {
    sorted.forEach((a) => rendered.push({ kind: "row", antrag: a }));
  } else {
    let currentGroup = "";
    let groupCounts = new Map<string, number>();
    sorted.forEach((a) => {
      const g = String(a[groupBy as keyof AntragRow] ?? "");
      groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1);
    });
    sorted.forEach((a) => {
      const g = String(a[groupBy as keyof AntragRow] ?? "");
      if (g !== currentGroup) {
        rendered.push({ kind: "group", label: groupLabel(groupBy, g), count: groupCounts.get(g) ?? 0 });
        currentGroup = g;
      }
      rendered.push({ kind: "row", antrag: a });
    });
  }

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
                      <TableHead key={col.key}>
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
                    <TableRow key={`g-${idx}`}>
                      <TableCell colSpan={7} className="bg-slate-100 font-semibold text-sm py-2">
                        {item.label} <span className="text-slate-500 font-normal">({item.count})</span>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={item.antrag.id}>
                      <TableCell className="font-mono text-xs">{item.antrag.antragsnummer}</TableCell>
                      <TableCell>{item.antrag.name}</TableCell>
                      <TableCell>{item.antrag.traeger}</TableCell>
                      <TableCell className="text-sm">{formatDateTime(item.antrag.submitted_at)}</TableCell>
                      <TableCell><Badge variant="secondary">{item.antrag.submitted_language.toUpperCase()}</Badge></TableCell>
                      <TableCell><StatusBadge status={item.antrag.status} /></TableCell>
                      <TableCell>
                        <Link to={`/antrag/${item.antrag.id}`} className="text-blue-600 underline text-sm">Öffnen</Link>
                      </TableCell>
                    </TableRow>
                  ),
                )}
                {rendered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                      Keine Anträge gefunden.
                    </TableCell>
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
