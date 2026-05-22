import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileSearch, FileCheck2, AlertTriangle } from "lucide-react";
import { useOntologie } from "../hooks/useOntologie";
import { pathFromParagraphRef } from "../hooks/useAhpTree";

/**
 * Inspector-Seite /ontologie — vollständiger Regelkatalog.
 *
 * Zweck: Transparenz. Jede aktive Regel wird mit Name, Schwere, AHP-Bezug,
 * Klartext-Beschreibung und JSON-Logic-Ausdruck sichtbar. Studis und
 * Sachbearbeiter sehen damit präzise, WAS geprüft wird und WORAUF es sich
 * stützt — keine Black Box mehr.
 */
export function OntologieInspector() {
  const { rules, loading, error } = useOntologie("APL2");

  const verstoesse = rules.filter((r) => r.schwere === "verstoss");
  const hinweise = rules.filter((r) => r.schwere === "hinweis");

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
            <FileSearch className="h-4 w-4 text-wue-rot" />
            Ontologie · Regelkatalog
          </h1>
        </div>
      </header>

      <main className="w-full px-4 lg:px-8 py-8 max-w-[1400px] mx-auto">
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
          {/* Erklärungs-Header */}
          <div className="bg-slate-50 border-b border-slate-200 px-8 py-5">
            <h2 className="font-semibold text-slate-900">Was ist die Ontologie?</h2>
            <p className="text-sm text-slate-700 mt-1 leading-relaxed">
              Eine Sammlung deklarativer Regeln, die jeden Antrag gegen die
              AHP-Förderrichtlinie prüfen. Format: <code className="bg-white border border-slate-300 px-1 py-0.5 rounded font-mono text-[12px]">JSON-Logic</code>
              in PostgreSQL (Tabelle <code className="bg-white border border-slate-300 px-1 py-0.5 rounded font-mono text-[12px]">apl2.ontologie_rules</code>).
              Jede Regel verweist über <code className="bg-white border border-slate-300 px-1 py-0.5 rounded font-mono text-[12px]">paragraph_ref</code>
              auf einen konkreten Abschnitt im extrahierten AHP-Doctree.
            </p>
            <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-wue-rot" />
                {verstoesse.length} Verstoss-Regeln
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
                {hinweise.length} Hinweis-Regeln
              </span>
              <span>Plan: APL2</span>
            </div>
          </div>

          {loading && <div className="p-8 text-slate-500">Lade Regeln …</div>}
          {error && <div className="p-8 text-rose-700">Fehler: {error}</div>}

          {!loading && !error && (
            <div className="divide-y divide-slate-200">
              <RuleGroup
                title="Verstöße"
                subtitle="Regeln, deren Verletzung den Antrag formal blockiert"
                icon={<AlertTriangle className="h-4 w-4 text-wue-rot" />}
                rules={verstoesse}
              />
              <RuleGroup
                title="Hinweise"
                subtitle="Regeln, deren Verletzung manuelle Prüfung durch den Sachbearbeiter auslöst"
                icon={<FileCheck2 className="h-4 w-4 text-amber-600" />}
                rules={hinweise}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function RuleGroup({
  title, subtitle, icon, rules,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  rules: ReturnType<typeof useOntologie>["rules"];
}) {
  if (rules.length === 0) {
    return (
      <div className="px-8 py-6">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <h3 className="font-semibold text-slate-900">{title}</h3>
        </div>
        <p className="text-sm text-slate-500 italic">Keine Regeln in dieser Kategorie.</p>
      </div>
    );
  }
  return (
    <div className="px-8 py-6">
      <div className="flex items-baseline gap-3 mb-1">
        {icon}
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <span className="text-xs text-slate-500">({rules.length})</span>
      </div>
      <p className="text-xs text-slate-500 mb-5">{subtitle}</p>
      <div className="space-y-5">
        {rules.map((r) => {
          const ahpPath = pathFromParagraphRef(r.paragraph_ref);
          return (
            <div
              key={r.id}
              className="border border-slate-200 rounded-sm overflow-hidden"
            >
              <div className="bg-slate-50 px-4 py-2 flex items-baseline justify-between border-b border-slate-200">
                <div className="flex items-baseline gap-3 min-w-0">
                  <code className="font-mono text-[13px] font-semibold text-slate-900 break-all">
                    {r.rule_name}
                  </code>
                  {!r.aktiv && (
                    <span className="text-[10px] uppercase tracking-wider bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                      inaktiv
                    </span>
                  )}
                </div>
                {r.paragraph_ref && (
                  <Link
                    to={`/ahp${ahpPath ? `?section=${ahpPath}` : ""}`}
                    className="text-xs text-wue-rot hover:underline whitespace-nowrap ml-3"
                  >
                    → {r.paragraph_ref}
                  </Link>
                )}
              </div>
              <div className="px-4 py-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-slate-500 font-medium mb-1">
                    Beschreibung
                  </div>
                  <p className="text-sm text-slate-800">
                    {r.beschreibung || <span className="text-slate-400 italic">—</span>}
                  </p>
                  <div className="text-[10.5px] uppercase tracking-wider text-slate-500 font-medium mt-3 mb-1">
                    Befund-Text (bei Verletzung)
                  </div>
                  <p className="text-sm text-slate-700 italic">„{r.fehler_msg_de}"</p>
                </div>
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-slate-500 font-medium mb-1">
                    JSON-Logic-Bedingung
                  </div>
                  <pre className="bg-slate-900 text-slate-100 text-[12px] font-mono p-3 rounded-sm overflow-x-auto leading-relaxed">
                    {JSON.stringify(r.condition_jsonb, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
