import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAntraege } from "../hooks/useAntraege";
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

export function Inbox() {
  const { antraege, loading, error } = useAntraege();
  const { rolle } = useUserRole();
  const [filter, setFilter] = useState<Set<Status>>(new Set());
  const [search, setSearch] = useState("");

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

  function toggleStatus(s: Status) {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
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
                  <TableHead>Antragsnummer</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Träger</TableHead>
                  <TableHead>Eingegangen</TableHead>
                  <TableHead>Sprache</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">
                      {a.antragsnummer}
                    </TableCell>
                    <TableCell>{a.name}</TableCell>
                    <TableCell>{a.traeger}</TableCell>
                    <TableCell className="text-sm">
                      {formatDateTime(a.submitted_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {a.submitted_language.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/antrag/${a.id}`}
                        className="text-blue-600 underline text-sm"
                      >
                        Öffnen
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-slate-500 py-8"
                    >
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
