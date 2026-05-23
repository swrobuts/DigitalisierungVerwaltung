/**
 * AI-Act- / DSGVO-Compliance-Statusseite.
 *
 * Zeigt strukturiert, welche KI-Eingriffe wo passieren, welche Daten
 * wohin gehen, wie menschliche Aufsicht gewährleistet ist und wo
 * Audit-Trail geführt wird. Live-Metriken aus DB.
 *
 * Adressaten:
 *  - Sachbearbeiter:innen (Selbst-Audit)
 *  - Datenschutzbeauftragte
 *  - Aufsichtsbehörden (LDA Bayern, ggf. BfDI)
 *  - Vortragspublikum / Lehrkontext
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle, ArrowLeft, Database, Eye, FileText, Server, Shield, Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

const PRUEFUNG_SERVICE = "https://pruefung.butscher.cloud";

interface ComplianceData {
  system: {
    name: string;
    betreiber: string;
    ai_act_risiko_klasse: string;
    ai_act_grundlage: string;
    ai_act_pflichten: string[];
    rechtsgrundlage_verarbeitung: string;
  };
  ki_systeme: Array<{
    name: string; rolle: string; anbieter: string;
    datenkategorien: string[]; personenbezug: string;
    verarbeitungsort: string; endpoint_envvar: string;
    zweck_ai_act: string;
  }>;
  datenfluesse: Array<{ von: string; nach: string; was: string; wie_oft: string }>;
  menschliche_aufsicht: Array<{ punkt: string; umsetzung: string; ai_act_referenz: string }>;
  audit_trail_quellen: Array<{ tabelle: string; inhalt: string; ai_act_referenz: string }>;
  datenminimierung: Array<{ kontext: string; regel: string; rechtsgrundlage: string }>;
  live_metriken: {
    ki_laeufe_gesamt: number;
    ki_laeufe_extern: number;
    ki_laeufe_adversariell: number;
    bescheide_gesamt: number;
    zweitpruefungen_gesamt: number;
    zweitpruefungen_durch_ki: number;
    llm_token_gesamt: number;
    llm_kosten_usd_geschaetzt: number;
  };
  stand: string;
  hinweis: string;
}

export function ComplianceStatus() {
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${PRUEFUNG_SERVICE}/api/compliance/status`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-3 flex items-center gap-4">
        <Link to="/inbox" className="text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Inbox
        </Link>
        <span className="text-slate-300">·</span>
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Shield className="h-5 w-5 text-wue-rot" />
          Compliance-Status
        </h1>
        <span className="text-xs text-slate-500 ml-2">
          EU AI Act + DSGVO
        </span>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {loading && <p className="text-slate-500">Lade …</p>}
        {error && (
          <Card><CardContent className="pt-6 text-rose-700 text-sm">Fehler: {error}</CardContent></Card>
        )}
        {data && (
          <>
            <SystemKlassifikationCard system={data.system} />
            <LiveMetrikenCard metriken={data.live_metriken} />
            <KiSystemeCard systeme={data.ki_systeme} />
            <DatenfluesseCard datenfluesse={data.datenfluesse} />
            <MenschlicheAufsichtCard punkte={data.menschliche_aufsicht} />
            <DatenminimierungCard regeln={data.datenminimierung} />
            <AuditTrailCard quellen={data.audit_trail_quellen} />
            <HinweisCard text={data.hinweis} stand={data.stand} />
          </>
        )}
      </main>
    </div>
  );
}

// ── Sektionen ────────────────────────────────────────────────────────

function SystemKlassifikationCard({ system }: { system: ComplianceData["system"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Server className="h-4 w-4 text-slate-600" />
          System-Klassifikation
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        <DefRow label="Name">{system.name}</DefRow>
        <DefRow label="Betreiber">{system.betreiber}</DefRow>
        <DefRow label="AI-Act-Risikoklasse">
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-300 px-2 py-0.5 rounded text-xs font-medium">
            <AlertCircle className="h-3 w-3" />
            {system.ai_act_risiko_klasse}
          </span>
        </DefRow>
        <DefRow label="Klassifikations-Grundlage">{system.ai_act_grundlage}</DefRow>
        <DefRow label="Rechtsgrundlage Verarbeitung">{system.rechtsgrundlage_verarbeitung}</DefRow>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-1">
            AI-Act-Pflichten für Hochrisiko-Systeme
          </div>
          <ul className="text-xs text-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-y-0.5 gap-x-3 list-disc list-inside">
            {system.ai_act_pflichten.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function LiveMetrikenCard({ metriken }: { metriken: ComplianceData["live_metriken"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Eye className="h-4 w-4 text-slate-600" />
          Live-Metriken — was hat das System tatsächlich getan?
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kennzahl label="KI-Läufe gesamt" wert={metriken.ki_laeufe_gesamt} />
          <Kennzahl label="davon extern" wert={metriken.ki_laeufe_extern} />
          <Kennzahl label="adversariell" wert={metriken.ki_laeufe_adversariell} />
          <Kennzahl label="Bescheide" wert={metriken.bescheide_gesamt} />
          <Kennzahl label="Zweitprüfungen" wert={metriken.zweitpruefungen_gesamt} />
          <Kennzahl label="davon KI" wert={metriken.zweitpruefungen_durch_ki} />
          <Kennzahl
            label="LLM-Token"
            wert={metriken.llm_token_gesamt.toLocaleString("de-DE")}
            sub="Input + Output"
          />
          <Kennzahl
            label="LLM-Kosten"
            wert={`$ ${metriken.llm_kosten_usd_geschaetzt.toFixed(2)}`}
            sub="geschätzt nach Listenpreis"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function KiSystemeCard({ systeme }: { systeme: ComplianceData["ki_systeme"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Server className="h-4 w-4 text-slate-600" />
          Eingesetzte KI-Systeme
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {systeme.map((s, i) => (
          <div key={i} className="border border-slate-200 rounded p-3 bg-slate-50/40">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h3 className="font-semibold text-sm">{s.name}</h3>
              <span className="text-xs text-slate-500">{s.anbieter}</span>
            </div>
            <p className="text-xs text-slate-700 mb-2">{s.rolle}</p>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-slate-500">Datenkategorien:</dt>
              <dd>{s.datenkategorien.join(", ")}</dd>
              <dt className="text-slate-500">Personenbezug:</dt>
              <dd>{s.personenbezug}</dd>
              <dt className="text-slate-500">Verarbeitungsort:</dt>
              <dd>{s.verarbeitungsort}</dd>
              <dt className="text-slate-500">AI-Act-Zweck:</dt>
              <dd>{s.zweck_ai_act}</dd>
            </dl>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DatenfluesseCard({ datenfluesse }: { datenfluesse: ComplianceData["datenfluesse"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-4 w-4 text-slate-600" />
          Datenflüsse
        </CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-xs">
          <thead className="text-slate-500 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left py-1.5">Von</th>
              <th className="text-left py-1.5">→ Nach</th>
              <th className="text-left py-1.5">Was</th>
              <th className="text-left py-1.5">Wie oft</th>
            </tr>
          </thead>
          <tbody>
            {datenfluesse.map((d, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1.5 pr-3 font-mono text-[11px]">{d.von}</td>
                <td className="py-1.5 pr-3 font-mono text-[11px]">{d.nach}</td>
                <td className="py-1.5 pr-3">{d.was}</td>
                <td className="py-1.5 text-slate-600">{d.wie_oft}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function MenschlicheAufsichtCard({ punkte }: { punkte: ComplianceData["menschliche_aufsicht"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-600" />
          Menschliche Aufsicht (AI Act Art. 14)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {punkte.map((p, i) => (
          <div key={i} className="border-l-2 border-emerald-400 bg-emerald-50/40 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-semibold text-sm text-slate-900">{p.punkt}</h3>
              <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-white border border-emerald-200 rounded px-1.5 py-0.5">
                {p.ai_act_referenz}
              </span>
            </div>
            <p className="text-xs text-slate-700 mt-0.5">{p.umsetzung}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DatenminimierungCard({ regeln }: { regeln: ComplianceData["datenminimierung"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-slate-600" />
          Datenminimierung (DSGVO Art. 5)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {regeln.map((r, i) => (
          <div key={i} className="border-l-2 border-sky-400 bg-sky-50/40 px-3 py-2">
            <h3 className="font-semibold text-sm">{r.kontext}</h3>
            <p className="text-xs text-slate-700 mt-0.5">{r.regel}</p>
            <p className="text-[10px] text-slate-500 italic mt-1">
              Rechtsgrundlage: {r.rechtsgrundlage}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AuditTrailCard({ quellen }: { quellen: ComplianceData["audit_trail_quellen"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-600" />
          Audit-Trail-Quellen
        </CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-xs">
          <thead className="text-slate-500 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left py-1.5">Tabelle</th>
              <th className="text-left py-1.5">Inhalt</th>
              <th className="text-left py-1.5">AI-Act-Bezug</th>
            </tr>
          </thead>
          <tbody>
            {quellen.map((q, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1.5 pr-3 font-mono text-[11px]">{q.tabelle}</td>
                <td className="py-1.5 pr-3">{q.inhalt}</td>
                <td className="py-1.5 text-slate-500 text-[11px]">{q.ai_act_referenz}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function HinweisCard({ text, stand }: { text: string; stand: string }) {
  return (
    <Card>
      <CardContent className="pt-5 text-xs text-slate-600 italic leading-relaxed">
        <p>{text}</p>
        <p className="mt-2 text-slate-400 not-italic">Stand: {stand}</p>
      </CardContent>
    </Card>
  );
}

// ── Hilfs-Komponenten ────────────────────────────────────────────────

function DefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
      <dt className="text-[11px] uppercase tracking-wider text-slate-500 font-medium pt-0.5">
        {label}
      </dt>
      <dd className="text-sm text-slate-800">{children}</dd>
    </div>
  );
}

function Kennzahl({ label, wert, sub }: { label: string; wert: string | number; sub?: string }) {
  return (
    <div className="border border-slate-200 rounded px-3 py-2 bg-white">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums mt-0.5">{wert}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}
