/**
 * AI-Act- / DSGVO-Compliance-Cockpit.
 *
 * Aufbau (von oben nach unten):
 *  1. Hero — System-Klassifikation als Auf-einen-Blick-Header
 *  2. Live-Kennzahlen — 4 große Tiles + LLM-Provider-Status
 *  3. AI-Act-Pflichten-Checkliste — visuelle Übersicht ✓
 *  4. Tab-Navigation für Details (KI-Systeme / Datenflüsse / Aufsicht /
 *     Datenschutz / Audit-Trail)
 *
 * Adressaten: Sachbearbeiter:innen, Datenschutzbeauftragte, Aufsichts-
 * behörden, Vortragspublikum.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, Cloud, Cpu, Database, Euro, Eye,
  FileText, HardDrive, Leaf, Shield, Users,
} from "lucide-react";

/**
 * CO₂-Faktor für LLM-Inferenz — 3 g CO₂eq pro 1.000 Tokens (Mittel).
 *
 * Quelle: Luccioni et al., "Power Hungry Processing: Watts Driving the Cost
 * of AI Deployment?" (ACM FAccT 2024). Für GPT-3-Klassen ergibt sich
 * 4,32 g CO₂eq pro Query bei ~100 Tokens (= 43 g / 1.000 Tokens). Für
 * effizientere/kleinere Modelle (Claude Sonnet/Haiku) und Frontier-Hardware
 * (H100/H200) liegen aktuelle Schätzungen bei 0,5–5 g / 1.000 Tokens.
 * Wir nehmen den konservativen Mittelwert 3 g/1.000 Tokens (Inferenz only).
 *   https://arxiv.org/abs/2311.16863
 *   https://arxiv.org/abs/2410.02950  (LLMCO2, 2024)
 */
const CO2_GRAMM_PRO_TOKEN = 0.003;

/**
 * Kosten-Modell: Claude Max-Flatrate (Pro Max Plan, 180 €/Monat).
 *
 * Wichtig: dieses Projekt läuft NICHT über API-Tokenabrechnung, sondern
 * über das Pauschal-Abo. Die wahrheitsgemäße Kosten-Anzeige ist deshalb
 * "Tage seit Stichtag × 6 €/Tag" — NICHT "Tokens × Opus-Preis".
 *   https://www.anthropic.com/pricing  (Claude Max)
 */
const PRO_MAX_EUR_PRO_MONAT = 180;
const PROJEKT_START_DATUM = "2026-05-22"; // Hard-Cut auf apl-Schema, intensive Phase

function tageSeitProjektStart(): number {
  const start = new Date(PROJEKT_START_DATUM).getTime();
  const tage = Math.ceil((Date.now() - start) / (1000 * 60 * 60 * 24));
  return Math.max(1, tage);
}

function proMaxKostenAnteiligEur(): number {
  return tageSeitProjektStart() * (PRO_MAX_EUR_PRO_MONAT / 30);
}

/**
 * Baseline-Tokens seit Stichtag 22.05.2026 — abgelesen aus dem
 * Anthropic-Dashboard (console.anthropic.com → Nutzung):
 *
 *   Woche 18.-24.05.:  20.262.956 Tokens (gesamt)
 *     davon 22.05.:    ~6,2 Mio (Hard-Cut + Multi-FB)
 *     davon 23.05.:    ~2,2 Mio
 *     davon 24.05.:    ~3,5 Mio
 *     22.-24.05.:      ~11,9 Mio
 *   Woche 25.-31.05.:  1.615.663 Tokens (25.-27.05. bisher)
 *     davon 25.05.:    ~0,3 Mio
 *     davon 26.05.:    ~1,1 Mio
 *     davon 27.05.:    ~0,2 Mio (Stand 12:00)
 *
 *   Gesamt seit 22.05.: ~13.500.000 Tokens (Stand 27.05.2026)
 *
 * Bei neuer Woche/neuem Stand bitte Wert aktualisieren.
 */
const BASELINE_PROJEKT_TOKENS = 13_500_000;

function gesamtTokens(live: number): number {
  return BASELINE_PROJEKT_TOKENS + (live ?? 0);
}

/** Deutsches Zahlenformat mit Trennzeichen "." (Tausender) und "," (Dezimal). */
function nf(n: number, frac = 0): string {
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  });
}

function formatCo2(tokens: number): string {
  const gramm = tokens * CO2_GRAMM_PRO_TOKEN;
  if (gramm < 1) return `${nf(gramm * 1000)} mg`;
  if (gramm < 1000) return `${nf(gramm, 1)} g`;
  return `${nf(gramm / 1000, 1)} kg`;
}

/**
 * PKW-Vergleichsfaktor: 119,8 g CO₂ pro Kilometer.
 *
 * Quelle: Kraftfahrt-Bundesamt (KBA), Pressemitteilung 01/2025 vom
 * 06.01.2025 zur Jahresbilanz Fahrzeugzulassungen Dezember 2024:
 * "die durchschnittliche CO2-Emission der neu zugelassenen Pkw stieg
 * 2024 um +4,2 Prozent auf 119,8 g/km".
 *   https://www.kba.de/DE/Presse/Pressemitteilungen/Fahrzeugzulassungen/2025/pm01_2025_n_12_24_pm_komplett.html
 *
 * Hinweis: WLTP-Norm — unterschätzt den Realverbrauch laut ICCT um
 * ca. 14%. Für die Bestandsflotte (älter, mehr Diesel/Benziner) wäre
 * der Wert höher (~150 g/km lt. UBA). Wir nehmen den offiziellen KBA-
 * Wert für Neuzulassungen, weil er transparent nachprüfbar ist.
 */
const PKW_GRAMM_CO2_PRO_KM = 119.8;

function formatPkwAequivalent(tokens: number): string {
  const gramm = tokens * CO2_GRAMM_PRO_TOKEN;
  const meter = (gramm / PKW_GRAMM_CO2_PRO_KM) * 1000;
  if (meter < 1000) return `${nf(meter)} m PKW-Fahrt`;
  if (meter < 10_000) return `${nf(meter / 1000, 1)} km PKW-Fahrt`;
  return `${nf(meter / 1000)} km PKW-Fahrt`;
}

function formatEur(eur: number): string {
  if (eur < 1) return `${nf(eur, 2)} €`;
  return `${nf(eur)} €`;
}
import { Card, CardContent } from "../components/ui/card";

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
  aktiver_llm_provider: {
    provider: string;
    model: string;
    anbieter: string;
    verarbeitungsort: string;
    datenfluss: string;
    lokal: boolean;
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

type Tab = "ki" | "datenflüsse" | "aufsicht" | "metriken" | "datenschutz" | "audit";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "ki", label: "KI-Systeme", icon: <Cpu className="h-3.5 w-3.5" /> },
  { id: "datenflüsse", label: "Datenflüsse", icon: <Database className="h-3.5 w-3.5" /> },
  { id: "aufsicht", label: "Menschl. Aufsicht", icon: <Users className="h-3.5 w-3.5" /> },
  { id: "metriken", label: "Aufsichts-Metriken", icon: <Activity className="h-3.5 w-3.5" /> },
  { id: "datenschutz", label: "Datenschutz", icon: <Shield className="h-3.5 w-3.5" /> },
  { id: "audit", label: "Audit-Trail", icon: <FileText className="h-3.5 w-3.5" /> },
];

interface AufsichtsMetriken {
  anzahl_bescheide_gesamt: number;
  anzahl_mit_ki_empfehlung: number;
  anzahl_ohne_ki_empfehlung: number;
  anzahl_gefolgt: number;
  anzahl_ueberstimmt: number;
  uebernahme_quote: number;
  health: "gesund" | "automation_bias_verdacht" | "ki_unzuverlaessig" | "keine_daten";
  health_text: string;
  per_aktion: Record<string, { gefolgt: number; ueberstimmt: number }>;
}

export function ComplianceStatus() {
  const [data, setData] = useState<ComplianceData | null>(null);
  const [metriken, setMetriken] = useState<AufsichtsMetriken | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("ki");

  useEffect(() => {
    Promise.all([
      fetch(`${PRUEFUNG_SERVICE}/api/compliance/status`).then((r) =>
        r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`),
      ),
      fetch(`${PRUEFUNG_SERVICE}/api/dashboard/adoption`).then((r) =>
        r.ok ? r.json() : null,
      ),
    ])
      .then(([compliance, m]) => {
        setData(compliance);
        if (m) setMetriken(m);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-3 flex items-center gap-4 sticky top-0 z-10">
        <Link to="/inbox" className="text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Inbox
        </Link>
        <span className="text-slate-300">·</span>
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Shield className="h-5 w-5 text-wue-rot" />
          Compliance-Cockpit
        </h1>
        <span className="text-xs text-slate-500 ml-2">EU AI Act + DSGVO</span>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-5">
        {loading && <p className="text-slate-500">Lade …</p>}
        {error && (
          <Card><CardContent className="pt-6 text-rose-700 text-sm">Fehler: {error}</CardContent></Card>
        )}
        {data && (
          <>
            <Hero data={data} />
            <KennzahlenStrip metriken={data.live_metriken} provider={data.aktiver_llm_provider} />
            <PflichtenChecklist data={data} />

            <div>
              <TabBar tab={tab} setTab={setTab} />
              <div className="bg-white border-x border-b border-slate-200 rounded-b-sm p-5">
                {tab === "ki" && <KiSystemeTab systeme={data.ki_systeme} aktiverProvider={data.aktiver_llm_provider} />}
                {tab === "datenflüsse" && <DatenfluesseTab datenfluesse={data.datenfluesse} />}
                {tab === "aufsicht" && <AufsichtTab punkte={data.menschliche_aufsicht} />}
                {tab === "metriken" && <AufsichtsMetrikenTab metriken={metriken} />}
                {tab === "datenschutz" && <DatenschutzTab regeln={data.datenminimierung} />}
                {tab === "audit" && <AuditTab quellen={data.audit_trail_quellen} />}
              </div>
            </div>

            <p className="text-xs text-slate-500 italic mt-4">
              {data.hinweis} · Stand: {data.stand}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

// ── HERO ────────────────────────────────────────────────────────────

function Hero({ data }: { data: ComplianceData }) {
  return (
    <div className="bg-white border border-slate-200 rounded-sm p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
            System
          </p>
          <h2 className="text-lg font-bold text-slate-900 mt-0.5">{data.system.name}</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Betreiber: {data.system.betreiber}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
            AI-Act-Risikoklasse
          </p>
          <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-900 border border-amber-300 px-3 py-1 rounded mt-1">
            <AlertCircle className="h-4 w-4" />
            <span className="font-bold text-sm">{data.system.ai_act_risiko_klasse}</span>
          </div>
        </div>
      </div>
      <details className="mt-3 group">
        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700 list-none flex items-center gap-1">
          <span className="text-slate-400 group-open:rotate-90 transition-transform">›</span>
          Klassifikations- und Rechtsgrundlage
        </summary>
        <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs text-slate-700 pl-3 border-l-2 border-slate-100">
          <div>
            <p className="font-semibold text-slate-600 mb-0.5">Klassifikations-Grundlage</p>
            <p>{data.system.ai_act_grundlage}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-600 mb-0.5">Rechtsgrundlage Verarbeitung</p>
            <p>{data.system.rechtsgrundlage_verarbeitung}</p>
          </div>
        </div>
      </details>

      <RisikoBeherrschung />
    </div>
  );
}

// ── RISIKO-BEHERRSCHUNG ─────────────────────────────────────────────
//
// Aufklappbare Sektion direkt im Hero. Zeigt juristisch fundierte
// Gegenmaßnahmen zur Risikoklasse "Hochrisiko". Quellen:
//   • EU AI Act (VO 2024/1689): Art. 9, 13, 14, 50
//   • DSGVO Art. 22 (automatisierte Einzelentscheidung)
//   • § 35a VwVfG (vollautomatisierter Verwaltungsakt — nur bei
//     gebundenen Entscheidungen, NICHT bei Ermessen)
//
// Wichtig: alle § zitiert mit Artikelnummer und kurzem Wortlaut. Keine
// erfundenen Quellen.

interface Massnahme {
  titel: string;
  rechtsgrundlage: string;
  wortlaut: string;
  umsetzung: string;
}

const MASSNAHMEN: Massnahme[] = [
  {
    titel: "Human-in-the-Loop: Sachbearbeitung entscheidet, KI schlägt nur vor",
    rechtsgrundlage: "AI Act Art. 14 Abs. 4 lit. d",
    wortlaut: `Aufsichtsperson muss "in any particular situation, not to use the high-risk AI system or to otherwise disregard, override or reverse the output" können.`,
    umsetzung: `Jede KI-Empfehlung wird explizit als Vorschlag gekennzeichnet (Button "Empfehlung umsetzen" vs. "Stattdessen ablehnen / bewilligen"). Finale Entscheidung trifft der Sozialausschuss der Stadt Würzburg (AHP § 3.4).`,
  },
  {
    titel: "Verbot der vollautomatisierten Einzelentscheidung",
    rechtsgrundlage: "DSGVO Art. 22 Abs. 1 + § 35a VwVfG",
    wortlaut: `DSGVO Art. 22(1): "Die betroffene Person hat das Recht, nicht einer ausschließlich auf einer automatisierten Verarbeitung beruhenden Entscheidung unterworfen zu werden." § 35a VwVfG erlaubt vollautomatisierte Verwaltungsakte nur bei gebundenen Entscheidungen ohne Ermessen.`,
    umsetzung: `Kein Bescheid wird ohne menschliche Bestätigung erlassen. Der KI-Vorgang ist immer Vorprüfung; die ausstellende Person ist immer eine natürliche Person (Bescheid-Feld "ausgestellt_von").`,
  },
  {
    titel: "Anti-Automation-Bias: Override-Tracking",
    rechtsgrundlage: "AI Act Art. 14 Abs. 4 lit. b",
    wortlaut: `"remain aware of the possible tendency of automatically relying or over-relying on the output (automation bias)"`,
    umsetzung: `Jede Übernahme/Ablehnung einer KI-Empfehlung wird persistiert. Tab "Aufsichts-Metriken" zeigt die Übernahme-Quote pro Aktion; zu hohe Quoten lösen einen "Automation-Bias-Verdacht"-Indikator aus.`,
  },
  {
    titel: "Stop-Funktion + Vier-Augen-Prinzip",
    rechtsgrundlage: "AI Act Art. 14 Abs. 4 lit. e",
    wortlaut: `"to intervene in the operation of the high-risk AI system or interrupt the system through a 'stop' button or a similar procedure"`,
    umsetzung: `UE3 bietet jederzeit den Klick auf "Stattdessen ablehnen/bewilligen". Optional: KI-adversarielle Zweitprüfung als methodische Ergänzung zum klassischen Vier-Augen-Prinzip.`,
  },
  {
    titel: "Halluzinations-Hard-Fail: Source-Pinning",
    rechtsgrundlage: "AI Act Art. 9 (Risk Management) + Art. 13 (Transparency)",
    wortlaut: `Risiken müssen "reasonably mitigated or eliminated through the development or design" werden; Informationen müssen "in an appropriate and understandable form" bereitgestellt werden.`,
    umsetzung: `quellen_validator.py prüft VOR PDF-Render, dass jeder im Bescheid zitierte AHP-§ in apl.ahp_norm_statements existiert. Bei erfundenem § → HTTP 422, Bescheid wird NICHT erstellt.`,
  },
  {
    titel: "Vollständiger Audit-Trail",
    rechtsgrundlage: "AI Act Art. 12 (Record-Keeping) + DSGVO Art. 5 Abs. 1 lit. f",
    wortlaut: `Hochrisiko-KI müssen "automatically record events ('logs') over the lifetime of the system" — über die gesamte Lebensdauer.`,
    umsetzung: `apl.antrag_history (Status-Wechsel), apl.manuelle_pruefung (Sachbearbeiter-Bewertungen), Bescheid-Audit (geprueft_gegen, doctree_version) sind alle persistiert und retrievbar.`,
  },
  {
    titel: "Transparenz gegenüber dem Antragsteller",
    rechtsgrundlage: "AI Act Art. 50 Abs. 1 + DSGVO Art. 13/14",
    wortlaut: `"providers shall ensure that AI systems intended to interact directly with natural persons are designed and developed in such a way that the natural persons concerned are informed that they are interacting with an AI system"`,
    umsetzung: `Jeder Bescheid trägt einen sichtbaren Hinweis "Dieser Bescheid wurde unter Nutzung eines KI-Systems (Anthropic Claude Sonnet 4.5) vorbereitet — die finale Entscheidung wurde von [Person] getroffen."`,
  },
  {
    titel: "Risiko-Management-System mit kontinuierlicher Re-Bewertung",
    rechtsgrundlage: "AI Act Art. 9 Abs. 2",
    wortlaut: `"a continuous iterative process ... identification, estimation, evaluation, adoption of risk-management measures"`,
    umsetzung: `Compliance-Cockpit liefert Live-Metriken (Übernahme-Quote, KI-Lauf-Häufigkeit, Token-/CO₂-Verbrauch); Regelkatalog ist Stufe-A-editierbar (apl.ontologie_rules mit aktiv-Flag + Audit-Spalten).`,
  },
];

function RisikoBeherrschung() {
  return (
    <details className="mt-3 group">
      <summary className="text-xs cursor-pointer list-none flex items-center gap-1.5 text-amber-700 hover:text-amber-900 font-medium">
        <span className="text-amber-500 group-open:rotate-90 transition-transform">›</span>
        Wie wir das Hochrisiko beherrschen — rechtskonforme Nutzung
        <span className="ml-1 text-slate-400 font-normal">
          ({MASSNAHMEN.length} Gegenmaßnahmen, juristisch verankert)
        </span>
        <a
          href="/rechtskonforme-ki-nutzung.html"
          target="_blank"
          rel="noopener"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-amber-700 hover:text-amber-900 border border-amber-300 hover:border-amber-500 rounded px-2 py-0.5 font-medium bg-white"
          title="Als PDF speichern (öffnet Druck-Dialog)"
        >
          ↓ PDF-Export
        </a>
      </summary>
      <div className="mt-3 pl-3 border-l-2 border-amber-200 space-y-3">
        <p className="text-xs text-slate-600 leading-relaxed">
          Die Klassifikation als Hochrisiko-KI nach AI-Act Anhang III (Zugang zu
          öffentlichen Leistungen) verbietet den Betrieb nicht, sondern verlangt
          ein dokumentiertes Bündel an Gegenmaßnahmen. Folgende sind in diesem
          System konkret umgesetzt — mit wörtlichem Wortlaut der Rechtsgrundlage:
        </p>
        {MASSNAHMEN.map((m, i) => (
          <div key={i} className="text-xs">
            <p className="font-semibold text-slate-900">
              {i + 1}. {m.titel}
            </p>
            <p className="text-[11px] text-amber-700 font-mono mt-0.5">
              {m.rechtsgrundlage}
            </p>
            <p className="text-slate-700 mt-1 italic">„{m.wortlaut}"</p>
            <p className="text-slate-700 mt-1">
              <span className="font-medium text-slate-600">Umsetzung im System:</span>{" "}
              {m.umsetzung}
            </p>
          </div>
        ))}
        <div className="mt-4 pt-3 border-t border-amber-100 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-700">Hinweis:</span>{" "}
          Diese Liste ersetzt nicht die formelle Konformitätsbewertung nach
          AI Act Art. 43 oder die DSGVO-Datenschutz-Folgenabschätzung (Art. 35).
          Beides ist Pflicht der betreibenden Stelle (Stadt Würzburg) vor
          produktiver Inbetriebnahme.
        </div>
      </div>
    </details>
  );
}

// ── KENNZAHLEN-STRIP ────────────────────────────────────────────────

function KennzahlenStrip({
  metriken, provider,
}: {
  metriken: ComplianceData["live_metriken"];
  provider: ComplianceData["aktiver_llm_provider"];
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
      <Tile
        icon={<Cpu className="h-3.5 w-3.5" />}
        label="KI-Läufe"
        wert={metriken.ki_laeufe_gesamt}
        sub={`${metriken.ki_laeufe_extern} extern · ${metriken.ki_laeufe_adversariell} adversariell`}
      />
      <Tile
        icon={<FileText className="h-3.5 w-3.5" />}
        label="Bescheide"
        wert={metriken.bescheide_gesamt}
      />
      <Tile
        icon={<Users className="h-3.5 w-3.5" />}
        label="Zweitprüfungen"
        wert={metriken.zweitpruefungen_gesamt}
        sub={`${metriken.zweitpruefungen_durch_ki} durch KI`}
      />
      <Tile
        icon={<Eye className="h-3.5 w-3.5" />}
        label="LLM-Token (Projekt)"
        wert={nf(gesamtTokens(metriken.llm_token_gesamt))}
        sub={`seit Stichtag 22.05.2026 · Quelle: Anthropic-Dashboard`}
        titleAttr="Real abgelesen aus dem Anthropic-Dashboard (console.anthropic.com → Nutzung). Stand: 27.05.2026."
      />
      <Tile
        icon={<Euro className="h-3.5 w-3.5" />}
        label="Kosten (Pro Max)"
        wert={formatEur(proMaxKostenAnteiligEur())}
        sub={`${tageSeitProjektStart()} Tage × 6 €/Tag · 180 €/Monat Flatrate`}
        titleAttr="Anthropic Claude Max-Abo: 180 €/Monat Flatrate. Kosten zeit-anteilig berechnet, NICHT tokenbasiert. Bei API-Bezahlung (Opus 4.7) wären ~12 €/M Token fällig."
      />
      <Tile
        icon={<Leaf className="h-3.5 w-3.5" />}
        label="CO₂-Fußabdruck"
        wert={formatCo2(gesamtTokens(metriken.llm_token_gesamt))}
        sub={`≈ ${formatPkwAequivalent(gesamtTokens(metriken.llm_token_gesamt))}`}
        tone="lokal"
        titleAttr="CO₂-Faktor 3 g pro 1.000 Tokens (Inferenz). PKW-Vergleich: 119,8 g CO₂/km (KBA, Neuzulassungen 2024, WLTP). Quellen: Luccioni et al. 2024 (arxiv.org/abs/2311.16863), LLMCO2 2024 (arxiv.org/abs/2410.02950), KBA Pressemitteilung 01/2025"
      />
      <ProviderTile provider={provider} />
    </div>
  );
}

function Tile({
  icon, label, wert, sub, tone = "neutral", titleAttr,
}: {
  icon: React.ReactNode;
  label: string;
  wert: string | number;
  sub?: string;
  tone?: "neutral" | "lokal" | "extern";
  /** Hover-Tooltip mit Quellenangabe (browser-native title-Attribut). */
  titleAttr?: string;
}) {
  const palette = {
    neutral: "bg-white border-slate-200",
    lokal: "bg-emerald-50 border-emerald-300",
    extern: "bg-sky-50 border-sky-300",
  }[tone];
  return (
    <div
      className={`border rounded-sm px-3 py-2.5 ${palette} ${titleAttr ? "cursor-help" : ""}`}
      title={titleAttr}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-semibold tabular-nums mt-1 text-slate-900">{wert}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ProviderTile({ provider }: { provider: ComplianceData["aktiver_llm_provider"] }) {
  return (
    <div className={`border rounded-sm px-3 py-2.5 ${
      provider.lokal
        ? "bg-emerald-50 border-emerald-300"
        : "bg-sky-50 border-sky-300"
    }`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-medium">
        {provider.lokal ? <HardDrive className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />}
        <span>LLM-Provider</span>
      </div>
      <div className="text-sm font-semibold mt-1 text-slate-900 truncate" title={provider.anbieter}>
        {provider.lokal ? "🟢 Lokal" : "☁️ Cloud"}
      </div>
      <div className="text-[10px] text-slate-600 mt-0.5 truncate" title={provider.model}>
        {provider.anbieter}
      </div>
    </div>
  );
}

// ── PFLICHTEN-CHECKLIST ─────────────────────────────────────────────

function PflichtenChecklist({ data }: { data: ComplianceData }) {
  // Heuristisches Mapping: wenn entsprechende menschliche_aufsicht-Punkte
  // existieren, gilt die Pflicht als "umgesetzt" (sichtbar im UI). Für eine
  // formelle Bewertung müsste das durch echte Konformitätsdokumente belegt
  // werden, aber als Live-Indikator hilfreich.
  const umgesetzt = new Set(
    data.menschliche_aufsicht.flatMap((p) =>
      p.ai_act_referenz.match(/Art\.\s*(\d+)/g) || []
    ).map((a) => a.replace(/\s+/g, "").toLowerCase())
  );
  // Plus Art. 12 (Logging) ist immer umgesetzt durch Audit-Trail
  if (data.audit_trail_quellen.length > 0) umgesetzt.add("art.12");
  // Plus Art. 11 (Doku) ist umgesetzt durch diese Seite
  umgesetzt.add("art.11");
  // Art. 50 ist umgesetzt durch Bescheid-Hinweis
  umgesetzt.add("art.50");

  return (
    <div className="bg-white border border-slate-200 rounded-sm p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 text-slate-600" />
        AI-Act-Pflichten für Hochrisiko-Systeme
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {data.system.ai_act_pflichten.map((p, i) => {
          const m = p.match(/Art\.\s*(\d+)/);
          const key = m ? `art.${m[1]}` : "";
          const erfuellt = umgesetzt.has(key);
          return (
            <div
              key={i}
              className={`flex items-start gap-2 text-xs px-2 py-1.5 rounded ${
                erfuellt ? "text-emerald-900" : "text-slate-700"
              }`}
            >
              {erfuellt ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <span className="text-slate-300 shrink-0 mt-0.5">○</span>
              )}
              <span>{p}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-400 italic mt-3">
        ✓ = im aktuellen System sichtbar umgesetzt · ○ = formelle Bewertung
        durch die betreibende Stelle erforderlich
      </p>
    </div>
  );
}

// ── TAB-BAR ─────────────────────────────────────────────────────────

function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="flex bg-white border border-slate-200 border-b-0 rounded-t-sm overflow-hidden">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-r border-slate-200 last:border-r-0 ${
            tab === t.id
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── TAB-INHALTE ─────────────────────────────────────────────────────

function KiSystemeTab({
  systeme, aktiverProvider,
}: {
  systeme: ComplianceData["ki_systeme"];
  aktiverProvider: ComplianceData["aktiver_llm_provider"];
}) {
  return (
    <div className="space-y-2">
      {systeme.map((s, i) => {
        const istAktiv =
          s.name.toLowerCase().includes(aktiverProvider.provider) ||
          aktiverProvider.anbieter.toLowerCase().includes(s.anbieter.toLowerCase().split(" ")[0].toLowerCase());
        return (
          <div
            key={i}
            className={`border rounded p-3 ${
              istAktiv
                ? "border-emerald-300 bg-emerald-50/30"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                {s.name}
                {istAktiv && (
                  <span className="text-[10px] uppercase tracking-wider bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                    Aktiv
                  </span>
                )}
              </h4>
              <span className="text-[10px] text-slate-500">{s.anbieter}</span>
            </div>
            <p className="text-xs text-slate-700 mb-2">{s.rolle}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <KvRow label="Daten">{s.datenkategorien.join(", ")}</KvRow>
              <KvRow label="Ort">{s.verarbeitungsort}</KvRow>
              <KvRow label="Personenbezug">{s.personenbezug}</KvRow>
              <KvRow label="Zweck">{s.zweck_ai_act}</KvRow>
            </div>
          </div>
        );
      })}
      {aktiverProvider.lokal && (
        <div className="border border-emerald-300 bg-emerald-50 rounded p-3 text-xs">
          <p className="font-semibold text-emerald-900 mb-1">
            🟢 Lokales Modell aktiv ({aktiverProvider.anbieter})
          </p>
          <p className="text-emerald-800">
            {aktiverProvider.datenfluss} Modell: <code className="bg-white border border-emerald-200 px-1 py-0.5 rounded">{aktiverProvider.model}</code>
          </p>
        </div>
      )}
    </div>
  );
}

function DatenfluesseTab({ datenfluesse }: { datenfluesse: ComplianceData["datenfluesse"] }) {
  return (
    <div className="space-y-1.5">
      {datenfluesse.map((d, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-xs">
          <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 font-mono">{d.von}</div>
          <span className="text-slate-400">→</span>
          <div className="bg-sky-50 border border-sky-200 rounded px-2 py-1.5 font-mono">{d.nach}</div>
          <div className="col-span-3 text-slate-600 pl-2 pb-2 border-b border-slate-100">
            <strong className="text-slate-800">Inhalt:</strong> {d.was}<br />
            <strong className="text-slate-800">Frequenz:</strong> {d.wie_oft}
          </div>
        </div>
      ))}
    </div>
  );
}

function AufsichtTab({ punkte }: { punkte: ComplianceData["menschliche_aufsicht"] }) {
  return (
    <div className="space-y-2">
      {punkte.map((p, i) => (
        <div key={i} className="border-l-2 border-emerald-500 bg-emerald-50/40 pl-3 py-2 pr-3">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="font-semibold text-sm">{p.punkt}</h4>
            <span className="text-[10px] uppercase tracking-wider bg-white border border-emerald-200 text-emerald-700 rounded px-1.5 py-0.5">
              {p.ai_act_referenz}
            </span>
          </div>
          <p className="text-xs text-slate-700 mt-1">{p.umsetzung}</p>
        </div>
      ))}
    </div>
  );
}

function DatenschutzTab({ regeln }: { regeln: ComplianceData["datenminimierung"] }) {
  return (
    <div className="space-y-2">
      {regeln.map((r, i) => (
        <div key={i} className="border-l-2 border-sky-500 bg-sky-50/40 pl-3 py-2 pr-3">
          <h4 className="font-semibold text-sm">{r.kontext}</h4>
          <p className="text-xs text-slate-700 mt-1">{r.regel}</p>
          <p className="text-[10px] text-slate-500 italic mt-1">
            Rechtsgrundlage: {r.rechtsgrundlage}
          </p>
        </div>
      ))}
    </div>
  );
}

function AuditTab({ quellen }: { quellen: ComplianceData["audit_trail_quellen"] }) {
  return (
    <div className="space-y-1.5">
      {quellen.map((q, i) => (
        <div key={i} className="flex items-start gap-3 text-xs border border-slate-200 rounded p-2.5">
          <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded shrink-0 text-[11px]">
            {q.tabelle}
          </code>
          <div className="flex-1">
            <p className="text-slate-700">{q.inhalt}</p>
            <p className="text-[10px] text-emerald-700 mt-0.5">{q.ai_act_referenz}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Aufsichts-Metriken (vormals 'Adoption') ─────────────────────────

function AufsichtsMetrikenTab({ metriken }: { metriken: AufsichtsMetriken | null }) {
  if (!metriken) {
    return <p className="text-xs text-slate-500 italic">Lade Aufsichts-Metriken …</p>;
  }
  if (metriken.health === "keine_daten") {
    return (
      <div className="text-sm text-slate-600">
        <p>{metriken.health_text}</p>
        <p className="text-xs text-slate-500 mt-2">
          Sobald Bescheide ausgestellt werden, die auf KI-Empfehlungen basieren,
          erscheint hier die Übernahme-Quote als Indikator für Automation Bias.
        </p>
      </div>
    );
  }

  const healthPalette = {
    gesund: { box: "bg-emerald-50 border-emerald-300", icon: <CheckCircle2 className="h-4 w-4 text-emerald-700" />, label: "Vier-Augen-Prinzip wirksam" },
    automation_bias_verdacht: { box: "bg-rose-50 border-rose-300", icon: <AlertTriangle className="h-4 w-4 text-rose-700" />, label: "Verdacht auf Automation Bias" },
    ki_unzuverlaessig: { box: "bg-amber-50 border-amber-300", icon: <AlertTriangle className="h-4 w-4 text-amber-700" />, label: "KI-Empfehlung wenig hilfreich" },
    keine_daten: { box: "bg-slate-50 border-slate-300", icon: <Activity className="h-4 w-4 text-slate-500" />, label: "Keine Daten" },
  }[metriken.health];

  return (
    <div className="space-y-4">
      <div className={`border rounded-sm p-3 flex items-start gap-3 ${healthPalette.box}`}>
        {healthPalette.icon}
        <div>
          <p className="font-semibold text-sm">{healthPalette.label}</p>
          <p className="text-xs text-slate-700 mt-0.5">{metriken.health_text}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile
          icon={<FileText className="h-3.5 w-3.5" />}
          label="Bescheide mit KI"
          wert={metriken.anzahl_mit_ki_empfehlung}
          sub={metriken.anzahl_ohne_ki_empfehlung > 0 ? `+ ${metriken.anzahl_ohne_ki_empfehlung} ohne KI` : undefined}
        />
        <Tile
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Empfehlung gefolgt"
          wert={metriken.anzahl_gefolgt}
          sub={`${(metriken.uebernahme_quote * 100).toFixed(0)} % Übernahme`}
        />
        <Tile
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Überstimmt"
          wert={metriken.anzahl_ueberstimmt}
          sub={`${((1 - metriken.uebernahme_quote) * 100).toFixed(0)} % Override`}
        />
        <Tile
          icon={<Activity className="h-3.5 w-3.5" />}
          label="Healthy-Bandbreite"
          wert="40-90 %"
          sub="Literatur: Mensch entscheidet substanziell mit"
        />
      </div>

      <div>
        <h4 className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">
          Aufschlüsselung pro Empfehlungs-Aktion
        </h4>
        {Object.keys(metriken.per_aktion).length === 0 ? (
          <p className="text-xs text-slate-500 italic">Noch keine Daten.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left py-1">KI empfahl</th>
                <th className="text-right py-1">Gefolgt</th>
                <th className="text-right py-1">Überstimmt</th>
                <th className="text-right py-1">Quote</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(metriken.per_aktion).map(([k, v]) => {
                const total = v.gefolgt + v.ueberstimmt;
                const quote = total > 0 ? v.gefolgt / total : 0;
                return (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="py-1.5 capitalize">{k}</td>
                    <td className="py-1.5 text-right tabular-nums">{v.gefolgt}</td>
                    <td className="py-1.5 text-right tabular-nums">{v.ueberstimmt}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">
                      {(quote * 100).toFixed(0)} %
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[10px] text-slate-400 italic">
        Macht Automation Bias sichtbar — wenn die finale Entscheidung in &gt;90 %
        der Fälle der KI-Empfehlung folgt, läuft das Vier-Augen-Prinzip Gefahr
        zur Hülle zu werden. Daten direkt aus pruefprotokoll + bescheide
        abgeleitet, keine separate Telemetrie.
      </p>
    </div>
  );
}

// ── Hilfs-Komponenten ────────────────────────────────────────────────

function KvRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="text-slate-500">{label}:</span>
      <span className="text-slate-800">{children}</span>
    </>
  );
}
