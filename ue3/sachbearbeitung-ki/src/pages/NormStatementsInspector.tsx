import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Network, BookOpen, Cpu } from "lucide-react";
import {
  useNormStatements,
  type NormStatement,
  type StatementType,
  type StatementStatus,
} from "../hooks/useNormStatements";
import { useOntologie } from "../hooks/useOntologie";
import { useSession } from "../hooks/useSession";
import { Button } from "../components/ui/button";

/**
 * Inspector-Seite /normen — Knowledge-Layer L2.
 *
 * Zeigt alle aus dem AHP-Doctree per LLM extrahierten normativen Aussagen
 * an, gruppiert nach Status. Sachbearbeiter kann jede Aussage
 * 'kuratieren' (freigeben) oder 'verwerfen'. Coverage-Anzeige am Anfang:
 * wie viele Statements sind bereits durch Ontologie-Regeln gedeckt.
 */

const TYPE_META: Record<
  StatementType,
  { label: string; emoji: string; color: string }
> = {
  cap:           { label: "Geld-Obergrenze",  emoji: "€",  color: "bg-amber-50 text-amber-900 border-amber-200" },
  frist:         { label: "Frist",            emoji: "⏱", color: "bg-blue-50 text-blue-900 border-blue-200" },
  verbot:        { label: "Verbot",           emoji: "✖", color: "bg-rose-50 text-rose-900 border-rose-200" },
  verpflichtung: { label: "Verpflichtung",    emoji: "→", color: "bg-slate-50 text-slate-900 border-slate-200" },
  pflichtfeld:   { label: "Pflichtfeld",      emoji: "▢", color: "bg-violet-50 text-violet-900 border-violet-200" },
  staffel:       { label: "Staffelung",       emoji: "≋", color: "bg-teal-50 text-teal-900 border-teal-200" },
  qualitativ:    { label: "qualitativ",       emoji: "○", color: "bg-stone-50 text-stone-700 border-stone-200" },
};

export function NormStatementsInspector() {
  const { statements, loading, error, updateStatus } = useNormStatements();
  const { rules } = useOntologie("APL2");
  const { session } = useSession();
  const userEmail = session?.user?.email ?? null;

  const [filterStatus, setFilterStatus] = useState<StatementStatus | "all">("pending");
  const [filterType, setFilterType] = useState<StatementType | "all">("all");
  const [showOnlyPruefbar, setShowOnlyPruefbar] = useState(false);

  const filtered = useMemo(() => {
    return statements.filter((s) => {
      if (filterStatus !== "all" && s.status !== filterStatus) return false;
      if (filterType !== "all" && s.statement_type !== filterType) return false;
      if (showOnlyPruefbar && !s.maschinell_pruefbar) return false;
      return true;
    });
  }, [statements, filterStatus, filterType, showOnlyPruefbar]);

  // Coverage-Metriken
  const total = statements.length;
  const byStatus = useMemo(() => {
    const out: Record<StatementStatus, number> = {
      pending: 0, kuratiert: 0, verworfen: 0,
    };
    for (const s of statements) out[s.status]++;
    return out;
  }, [statements]);
  const pruefbarTotal = statements.filter((s) => s.maschinell_pruefbar).length;
  const pruefbarMitRegel = statements.filter(
    (s) => s.maschinell_pruefbar && s.ontologie_rule_id !== null,
  ).length;
  const coveragePct =
    pruefbarTotal > 0 ? Math.round((pruefbarMitRegel / pruefbarTotal) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 relative sticky top-0 z-30">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-wue-rot" />
        <div className="w-full px-4 lg:px-8 py-4 flex items-center gap-3">
          <Link
            to="/inbox"
            className="text-sm text-slate-500 flex items-center gap-1 hover:text-wue-rot"
          >
            <ArrowLeft className="h-4 w-4" /> Inbox
          </Link>
          <span className="text-slate-300">·</span>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Network className="h-4 w-4 text-wue-rot" />
            Knowledge-Layer · Norm-Statements
          </h1>
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <Link to="/ahp" className="hover:text-wue-rot inline-flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" />
              Doctree
            </Link>
            <span className="text-slate-300">·</span>
            <Link to="/ontologie" className="hover:text-wue-rot inline-flex items-center gap-1">
              <Cpu className="h-3.5 w-3.5" />
              Ontologie ({rules.length})
            </Link>
          </div>
        </div>
      </header>

      <main className="w-full px-4 lg:px-8 py-8 max-w-[1500px] mx-auto">
        {/* Erklärung + Coverage-KPIs */}
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden mb-6">
          <div className="bg-slate-50 border-b border-slate-200 px-8 py-5">
            <h2 className="font-semibold text-slate-900">
              Was ist der Knowledge-Layer (L2)?
            </h2>
            <p className="text-sm text-slate-700 mt-1 leading-relaxed">
              Norm-Aussagen, die per LLM aus dem AHP-Doctree (L1) extrahiert
              wurden — die Brücke zwischen Volltext und ausführbaren
              Ontologie-Regeln (L3). Jede Aussage durchläuft den Lifecycle{" "}
              <code className="bg-white border border-slate-300 px-1 py-0.5 rounded text-[11px]">
                pending
              </code>{" "}
              →{" "}
              <code className="bg-white border border-slate-300 px-1 py-0.5 rounded text-[11px]">
                kuratiert
              </code>{" "}
              /{" "}
              <code className="bg-white border border-slate-300 px-1 py-0.5 rounded text-[11px]">
                verworfen
              </code>{" "}
              und kann mit einer Ontologie-Regel verknüpft werden.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-slate-200 border-b border-slate-200">
            <Kpi label="Statements gesamt" value={total} />
            <Kpi label="Pending" value={byStatus.pending} accent="amber" />
            <Kpi label="Kuratiert" value={byStatus.kuratiert} accent="emerald" />
            <Kpi label="Verworfen" value={byStatus.verworfen} accent="slate" />
            <Kpi
              label="Ontologie-Coverage"
              value={`${coveragePct} %`}
              sub={`${pruefbarMitRegel}/${pruefbarTotal} maschinell prüfbare mit Regel`}
              accent={coveragePct >= 80 ? "emerald" : coveragePct >= 50 ? "amber" : "rose"}
            />
          </div>

          {/* Filter */}
          <div className="px-8 py-3 flex flex-wrap items-center gap-3">
            <span className="text-xs uppercase tracking-wider text-slate-500">Filter:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as StatementStatus | "all")}
              className="text-sm border border-slate-300 rounded px-2 py-1"
            >
              <option value="all">Alle Status</option>
              <option value="pending">Pending</option>
              <option value="kuratiert">Kuratiert</option>
              <option value="verworfen">Verworfen</option>
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as StatementType | "all")}
              className="text-sm border border-slate-300 rounded px-2 py-1"
            >
              <option value="all">Alle Typen</option>
              {(Object.keys(TYPE_META) as StatementType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_META[t].emoji} {TYPE_META[t].label}
                </option>
              ))}
            </select>
            <label className="text-sm inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showOnlyPruefbar}
                onChange={(e) => setShowOnlyPruefbar(e.target.checked)}
              />
              nur maschinell prüfbar
            </label>
            <div className="ml-auto text-xs text-slate-500">
              {filtered.length} von {total} angezeigt
            </div>
          </div>
        </div>

        {loading && (
          <div className="bg-white border border-slate-200 rounded-sm p-8 text-slate-500">
            Lade Statements …
          </div>
        )}
        {error && (
          <div className="bg-white border border-slate-200 rounded-sm p-8 text-rose-700">
            Fehler: {error}
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-3">
            {filtered.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-sm p-8 text-slate-500">
                Keine Statements für diese Filter.
              </div>
            )}
            {filtered.map((s) => (
              <StatementCard
                key={s.id}
                statement={s}
                onCurate={async () => {
                  await updateStatus(s.id, "kuratiert", undefined, userEmail ?? undefined);
                }}
                onReject={async () => {
                  await updateStatus(s.id, "verworfen", undefined, userEmail ?? undefined);
                }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Kpi({
  label, value, sub, accent = "slate",
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "slate" | "emerald" | "amber" | "rose";
}) {
  const accentClass = {
    slate: "text-slate-900",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
  }[accent];
  return (
    <div className="px-6 py-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${accentClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function StatementCard({
  statement, onCurate, onReject,
}: {
  statement: NormStatement;
  onCurate: () => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const meta = TYPE_META[statement.statement_type];
  const statusIcon =
    statement.status === "kuratiert" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> :
    statement.status === "verworfen" ? <XCircle className="h-4 w-4 text-slate-400" /> :
    <Clock className="h-4 w-4 text-amber-600" />;
  const statusLabel =
    statement.status === "kuratiert" ? "Kuratiert" :
    statement.status === "verworfen" ? "Verworfen" :
    "Pending";

  const ahpPath = statement.section_path || null;

  return (
    <div
      className={
        "bg-white border rounded-sm shadow-sm " +
        (statement.status === "verworfen" ? "border-slate-200 opacity-60" :
         statement.status === "kuratiert" ? "border-emerald-200" :
         "border-slate-200")
      }
    >
      <div className="px-5 py-3 border-b border-slate-100 flex items-baseline gap-3 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${meta.color}`}>
          {meta.emoji} {meta.label}
        </span>
        {statement.maschinell_pruefbar ? (
          <span className="text-[11px] uppercase tracking-wider text-emerald-700">
            maschinell prüfbar
          </span>
        ) : (
          <span className="text-[11px] uppercase tracking-wider text-slate-400">
            nur Hinweis
          </span>
        )}
        {ahpPath && (
          <Link
            to={`/ahp?section=${ahpPath}`}
            className="text-xs text-wue-rot hover:underline"
          >
            → AHP {ahpPath}
          </Link>
        )}
        {statement.ontologie_rule_id && (
          <Link
            to="/ontologie"
            className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1"
            title="Bereits in Ontologie umgesetzt"
          >
            ✓ in Ontologie
          </Link>
        )}
        <span className="ml-auto text-xs text-slate-500 inline-flex items-center gap-1">
          {statusIcon} {statusLabel}
        </span>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm text-slate-900 leading-relaxed">{statement.statement}</p>
        {statement.section_title && (
          <p className="text-[11px] text-slate-500 mt-1">
            Quelle: {statement.section_title}
          </p>
        )}
        {Object.keys(statement.applicable_to).length > 0 && (
          <pre className="mt-2 text-[11px] font-mono text-slate-600 bg-slate-50 px-2 py-1 rounded inline-block">
            {JSON.stringify(statement.applicable_to)}
          </pre>
        )}
      </div>
      {statement.status === "pending" && (
        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2 bg-slate-50">
          <Button variant="default" size="sm" onClick={() => void onCurate()}>
            ✓ Kuratieren
          </Button>
          <Button variant="outline" size="sm" onClick={() => void onReject()}>
            ✖ Verwerfen
          </Button>
          {statement.kuratiert_von && (
            <span className="ml-auto text-xs text-slate-500">
              von {statement.kuratiert_von}
            </span>
          )}
        </div>
      )}
      {statement.status !== "pending" && statement.kuratiert_von && (
        <div className="px-5 py-2 border-t border-slate-100 text-xs text-slate-500 bg-slate-50">
          {statement.status === "kuratiert" ? "Freigegeben" : "Verworfen"} von{" "}
          <span className="font-mono">{statement.kuratiert_von}</span>
          {statement.kuratiert_am && (
            <> am {new Date(statement.kuratiert_am).toLocaleDateString("de-DE")}</>
          )}
        </div>
      )}
    </div>
  );
}
