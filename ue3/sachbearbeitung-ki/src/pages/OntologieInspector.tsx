import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, FileCheck2, FileSearch, Info, Power, ShieldAlert,
} from "lucide-react";
import { useOntologie, type OntologieRule } from "../hooks/useOntologie";
import { useSession } from "../hooks/useSession";
import { useUserRole } from "../hooks/useUserRole";
import { pathFromParagraphRef } from "../hooks/useAhpTree";

/**
 * Inspector-Seite /regelkatalog — vollständiger Regelkatalog.
 *
 * Lese-Modus für alle, **aktiv/inaktiv-Toggle nur für Admin-Rolle**
 * (Stufe-A-Edit nach Migration 041). Logik-Änderungen (JSON-Logic
 * Bedingung) bleiben Code/Migration-Pflicht — würden eine Rechtsänderung
 * darstellen, die nicht durch UI-Klicks erfolgen darf.
 */
export function OntologieInspector() {
  const { rules, loading, error, toggle } = useOntologie("APL2");
  const { session } = useSession();
  const { rolle } = useUserRole();
  const email = session?.user?.email ?? null;
  const istAdmin = rolle === "admin";

  const verstoesse = rules.filter((r) => r.schwere === "verstoss");
  const hinweise = rules.filter((r) => r.schwere === "hinweis");
  const aktiv = rules.filter((r) => r.aktiv).length;
  const inaktiv = rules.length - aktiv;

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
            Regelkatalog
          </h1>
        </div>
      </header>

      <main className="w-full px-4 lg:px-8 py-6 max-w-[1400px] mx-auto space-y-4">
        {/* Disclaimer: was darf hier editiert werden, was nicht */}
        <RegelEditDisclaimer istAdmin={istAdmin} />

        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
          {/* Erklärungs-Header */}
          <div className="bg-slate-50 border-b border-slate-200 px-8 py-5">
            <h2 className="font-semibold text-slate-900">Was ist der Regelkatalog?</h2>
            <p className="text-sm text-slate-700 mt-1 leading-relaxed">
              Eine Sammlung deklarativer Prüfregeln, die jeden Antrag gegen die
              AHP-Förderrichtlinie abgleichen. Format: <code className="bg-white border border-slate-300 px-1 py-0.5 rounded font-mono text-[12px]">JSON-Logic</code>
              in PostgreSQL. Jede Regel verweist über <code className="bg-white border border-slate-300 px-1 py-0.5 rounded font-mono text-[12px]">paragraph_ref</code>
              auf einen konkreten Abschnitt der AHP-Förderrichtlinie.
            </p>
            <div className="mt-3 flex items-center gap-4 text-xs text-slate-500 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-wue-rot" />
                {verstoesse.length} Verstoss-Regeln
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
                {hinweise.length} Hinweis-Regeln
              </span>
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <Power className="h-3 w-3" />
                {aktiv} aktiv
              </span>
              {inaktiv > 0 && (
                <span className="inline-flex items-center gap-1.5 text-slate-500">
                  <span className="text-slate-300">·</span>
                  {inaktiv} inaktiv
                </span>
              )}
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
                istAdmin={istAdmin}
                email={email}
                onToggle={toggle}
              />
              <RuleGroup
                title="Hinweise"
                subtitle="Regeln, deren Verletzung manuelle Prüfung durch den Sachbearbeiter auslöst"
                icon={<FileCheck2 className="h-4 w-4 text-amber-600" />}
                rules={hinweise}
                istAdmin={istAdmin}
                email={email}
                onToggle={toggle}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function RegelEditDisclaimer({ istAdmin }: { istAdmin: boolean }) {
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-sm p-4 flex items-start gap-3">
      <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
      <div className="text-xs text-amber-900 leading-relaxed">
        <p className="font-semibold mb-1">
          Was hier editierbar ist — und was nicht
        </p>
        <p>
          {istAdmin ? "Du kannst" : "Admins können"} einzelne Regeln{" "}
          <strong>aktivieren oder deaktivieren</strong> (z.B. wenn die Stadt
          Würzburg eine Förderlinie pausiert). Jede Umschaltung wird mit
          Zeitstempel, Benutzer und Begründung im Audit-Trail festgehalten.
        </p>
        <p className="mt-1">
          <strong>Nicht editierbar:</strong> die Regel-Logik selbst
          (JSON-Logic-Bedingung), die Schwere oder die AHP-Paragraph-
          Referenz. Solche Änderungen sind Rechtsänderungen und erfordern
          einen Beschluss der Stadt Würzburg sowie ein IT-Deployment.
        </p>
        {!istAdmin && (
          <p className="mt-2 text-amber-800 italic">
            Du bist nicht in der Admin-Rolle — Toggle ist nur sichtbar, nicht
            klickbar.
          </p>
        )}
      </div>
    </div>
  );
}

function RuleGroup({
  title, subtitle, icon, rules, istAdmin, email, onToggle,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  rules: OntologieRule[];
  istAdmin: boolean;
  email: string | null;
  onToggle: (id: string, aktiv: boolean, email: string, grund: string) => Promise<{ error?: string }>;
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
        {rules.map((r) => (
          <RuleRow
            key={r.id}
            rule={r}
            istAdmin={istAdmin}
            email={email}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

function RuleRow({
  rule: r, istAdmin, email, onToggle,
}: {
  rule: OntologieRule;
  istAdmin: boolean;
  email: string | null;
  onToggle: (id: string, aktiv: boolean, email: string, grund: string) => Promise<{ error?: string }>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ahpPath = pathFromParagraphRef(r.paragraph_ref);

  async function handleToggle() {
    if (!istAdmin || !email) return;
    const action = r.aktiv ? "deaktivieren" : "aktivieren";
    const grund = window.prompt(
      `Regel "${r.rule_name}" ${action} — Begründung (Pflicht, Audit-Trail):`,
      "",
    );
    if (!grund || !grund.trim()) return;
    setPending(true);
    setError(null);
    const result = await onToggle(r.id, !r.aktiv, email, grund.trim());
    setPending(false);
    if (result.error) setError(result.error);
  }

  return (
    <div
      className={`border rounded-sm overflow-hidden ${
        r.aktiv ? "border-slate-200" : "border-slate-300 bg-slate-50/50 opacity-75"
      }`}
    >
      <div className="bg-slate-50 px-4 py-2 flex items-baseline justify-between gap-3 border-b border-slate-200">
        <div className="flex items-baseline gap-3 min-w-0">
          <code className="font-mono text-[13px] font-semibold text-slate-900 break-all">
            {r.rule_name}
          </code>
          {!r.aktiv && (
            <span className="text-[10px] uppercase tracking-wider bg-slate-200 text-slate-700 px-2 py-0.5 rounded shrink-0">
              inaktiv
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {r.paragraph_ref && (
            <Link
              to={`/ahp${ahpPath ? `?section=${ahpPath}` : ""}`}
              className="text-xs text-wue-rot hover:underline whitespace-nowrap"
            >
              → {r.paragraph_ref}
            </Link>
          )}
          <button
            type="button"
            onClick={handleToggle}
            disabled={!istAdmin || pending}
            title={
              istAdmin
                ? r.aktiv
                  ? "Regel deaktivieren — wird nicht mehr geprüft"
                  : "Regel aktivieren — wird wieder geprüft"
                : "Nur Admin-Rolle kann Regeln umschalten"
            }
            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
              !istAdmin
                ? "border-slate-200 text-slate-400 cursor-not-allowed"
                : r.aktiv
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Power className="h-3 w-3" />
            {pending ? "…" : r.aktiv ? "Aktiv" : "Inaktiv"}
          </button>
        </div>
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
          {r.geaendert_am && (
            <div className="mt-3 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
              <div className="flex items-center gap-1 font-medium text-slate-600 mb-0.5">
                <Info className="h-3 w-3" />
                Letzte Änderung
              </div>
              <div>
                {new Date(r.geaendert_am).toLocaleString("de-DE")} ·{" "}
                {r.geaendert_von ?? "—"}
              </div>
              {r.aenderungsgrund && (
                <div className="italic mt-0.5">„{r.aenderungsgrund}"</div>
              )}
            </div>
          )}
          {error && (
            <div className="mt-2 text-xs bg-rose-50 border border-rose-200 text-rose-800 px-2 py-1 rounded">
              {error}
            </div>
          )}
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-slate-500 font-medium mb-1">
            JSON-Logic-Bedingung (read-only)
          </div>
          <pre className="bg-slate-900 text-slate-100 text-[12px] font-mono p-3 rounded-sm overflow-x-auto leading-relaxed">
            {JSON.stringify(r.condition_jsonb, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
