import { useState, useMemo } from "react";
import { Link, NavLink } from "react-router-dom";
import { BookOpen, FileSearch, Network, Shield } from "lucide-react";
import { useAntraege, type AntragRow } from "../hooks/useAntraege";
import { useMeineZweitpruefungen } from "../hooks/useMeineZweitpruefungen";
import { useUserRole } from "../hooks/useUserRole";
import { useSession } from "../hooks/useSession";
import { supabase } from "../lib/supabase";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatEuro } from "../lib/format";
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

function totalEuro(a: AntragRow): number {
  return (
    Number(a.betriebskosten_vorjahr_euro ?? 0) +
    Number(a.personalkosten_vorjahr_euro ?? 0) +
    Number(a.miete_jahr_euro ?? 0)
  );
}

/**
 * Splittet `text` an allen Treffern von `needle` (case-insensitive, ohne Regex-
 * Sonderbehandlung) und gibt React-Children mit <mark>-Wrappern zurück.
 * Leerer Needle → unveränderter Text.
 */
function Highlight({ text, needle }: { text: string; needle: string }) {
  if (!needle || !text) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: Array<{ str: string; hit: boolean }> = [];
  let i = 0;
  while (i < text.length) {
    const idx = lowerText.indexOf(lowerNeedle, i);
    if (idx === -1) {
      parts.push({ str: text.slice(i), hit: false });
      break;
    }
    if (idx > i) parts.push({ str: text.slice(i, idx), hit: false });
    parts.push({ str: text.slice(idx, idx + needle.length), hit: true });
    i = idx + needle.length;
  }
  return (
    <>
      {parts.map((p, j) =>
        p.hit ? (
          <mark key={j} className="bg-amber-200 text-slate-900 rounded-sm px-0.5">
            {p.str}
          </mark>
        ) : (
          <span key={j}>{p.str}</span>
        ),
      )}
    </>
  );
}

const MONATE_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function monthKey(iso: string): string {
  // YYYY-MM aus submitted_at, in Europe/Berlin
  const d = new Date(iso);
  const berlinDate = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  return `${berlinDate.getFullYear()}-${String(berlinDate.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const idx = Math.max(0, Math.min(11, Number(m) - 1));
  return `${MONATE_DE[idx]} ${y}`;
}

type SortKey =
  | "antragsnummer" | "name" | "traeger" | "submitted_at"
  | "submitted_language" | "status" | "antragssumme" | "gesamt" | "vj" | "diff";
type SortDir = "asc" | "desc";
type GroupKey = "none" | "status" | "traeger" | "submitted_language" | "month";

// Risiko-Score-Spalte wurde bewusst entfernt: heuristischer Wert ohne
// inline-Erklärbarkeit — alle Anträge zeigten denselben Score, ohne dass
// im UI sichtbar war, welche Faktoren zugrunde lagen. Backend-Endpoint
// /api/antrag/{id}/risiko-score bleibt für späteren Re-Use, wenn wir
// eine bessere Erklärungs-UI bauen.
const COLUMNS: Array<{ key: SortKey; label: string; align?: "right"; tooltip?: string }> = [
  { key: "antragsnummer", label: "Antragsnummer" },
  { key: "name", label: "Name" },
  { key: "traeger", label: "Träger" },
  { key: "submitted_at", label: "Eingegangen" },
  { key: "submitted_language", label: "Sprache" },
  { key: "status", label: "Status" },
  { key: "antragssumme", label: "Antragssumme", align: "right",
    tooltip: "Aktuell beantragte Fördersumme (geforderte_foerdersumme_euro)" },
  { key: "gesamt", label: "Aufwand VJ (Eigenangabe)", align: "right",
    tooltip: "Im aktuellen Antrag angegebener Aufwand des Vorjahres (Betriebskosten + Personal + Miete)" },
  { key: "vj", label: "Antrag VJ", align: "right",
    tooltip: "Was derselbe Träger im Vorjahres-Antrag beantragt hatte (aus DB rekonstruiert)" },
  { key: "diff", label: "Δ Antrag", align: "right",
    tooltip: "Aktuelle Antragssumme − Vorjahres-Antragssumme" },
];

const GROUP_OPTIONS: Array<{ key: GroupKey; label: string }> = [
  { key: "none", label: "Keine Gruppierung" },
  { key: "status", label: "Status" },
  { key: "traeger", label: "Träger" },
  { key: "submitted_language", label: "Sprache" },
  { key: "month", label: "Eingegangen Monat" },
];

function groupLabel(key: GroupKey, val: string): string {
  if (key === "status") return STATUS_LABELS[val as Status] ?? val;
  if (key === "submitted_language") return val.toUpperCase();
  if (key === "month") return monthLabel(val);
  return val || "—";
}

/**
 * VJ-Wert (Vorjahres-Wert) eines Antrags = Summe der GEFORDERTEN Förder-
 * summen aller Anträge desselben Trägers für haushaltsjahr - 1. Gibt
 * null zurück, wenn kein VJ-Antrag existiert.
 *
 * Wichtig: hier wird geforderte_foerdersumme_euro summiert, NICHT
 * totalEuro (= Aufwand-Eigenangabe). Sonst zeigt 'Antrag VJ' den
 * Aufwand der Vorjahres-Anträge statt deren Forderung — irreführend
 * und meist 0 weil die VJ-Anträge oft keine Aufwandsfelder gepflegt
 * haben.
 */
function buildVjMap(antraege: AntragRow[]): Map<string, number> {
  // Key: "traeger|haushaltsjahr" → Summe geforderter Fördersummen
  const m = new Map<string, number>();
  for (const a of antraege) {
    const k = `${a.traeger}|${a.haushaltsjahr}`;
    m.set(k, (m.get(k) ?? 0) + (a.geforderte_foerdersumme_euro ?? 0));
  }
  return m;
}

function vjValue(a: AntragRow, vjMap: Map<string, number>): number | null {
  const k = `${a.traeger}|${a.haushaltsjahr - 1}`;
  return vjMap.has(k) ? (vjMap.get(k) ?? 0) : null;
}

function formatDiff(current: number, vj: number | null): { text: string; tone: "up" | "down" | "neutral" } {
  if (vj === null) return { text: "—", tone: "neutral" };
  const diff = current - vj;
  if (Math.abs(diff) < 0.01) return { text: "± 0", tone: "neutral" };
  const pct = vj === 0 ? null : (diff / vj) * 100;
  const sign = diff > 0 ? "+" : "−";
  const abs = Math.abs(diff);
  const pctTxt = pct === null ? "" : ` (${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1).replace(".", ",")} %)`;
  return {
    text: `${sign} ${formatEuro(abs)}${pctTxt}`,
    tone: diff > 0 ? "up" : "down",
  };
}

export function Inbox() {
  const { antraege, loading, error } = useAntraege();
  const { eintraege: meineZweitpruefungen } = useMeineZweitpruefungen();
  const { rolle } = useUserRole();
  const { session } = useSession();
  const userEmail = session?.user?.email ?? "";
  const userMeta = (session?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (typeof userMeta.full_name === "string" && userMeta.full_name) ||
    (typeof userMeta.name === "string" && userMeta.name) ||
    (userEmail ? userEmail.split("@")[0] : "—");
  // Demo-Avatar wird aus public/ ausgeliefert; statisch für alle eingeloggten Nutzer
  const avatarUrl = "/demoImage.png";
  const [filter, setFilter] = useState<Set<Status>>(new Set());
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("submitted_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [groupBy, setGroupBy] = useState<GroupKey>("none");
  // null = "alle Jahre", default = das jüngste vorhandene Haushaltsjahr.
  // Sachbearbeiter:innen sehen primär das laufende Förderjahr; ältere
  // Anträge (z.B. für Vorjahres-Vergleich) sind über das Dropdown
  // explizit zuschaltbar.
  const [hjFilter, setHjFilter] = useState<number | null>(null);

  // Verfügbare Haushaltsjahre — distinct, absteigend sortiert
  const verfuegbareHj = useMemo(() => {
    const set = new Set<number>();
    for (const a of antraege) if (a.haushaltsjahr) set.add(a.haushaltsjahr);
    return Array.from(set).sort((a, b) => b - a);
  }, [antraege]);

  // Default-HJ einmalig setzen sobald Anträge geladen sind. Wir tun das
  // im useMemo des effektiven Filters, nicht in einem useEffect, damit es
  // ohne extra Render-Zyklus passiert. Sobald der User explizit etwas
  // wählt (auch "alle"), wird der eigene State respektiert.
  const [hjFilterDirty, setHjFilterDirty] = useState(false);
  const effektivesHj: number | null = hjFilterDirty
    ? hjFilter
    : (verfuegbareHj[0] ?? null);

  // VJ-Map über ALLE Anträge (nicht nur gefilterte) — sonst falscher Vergleich
  const vjMap = useMemo(() => buildVjMap(antraege), [antraege]);


  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return antraege.filter((a) => {
      if (effektivesHj !== null && a.haushaltsjahr !== effektivesHj) return false;
      if (filter.size > 0 && !filter.has(a.status)) return false;
      if (s && !`${a.antragsnummer} ${a.name} ${a.traeger}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [antraege, effektivesHj, filter, search]);

  function groupKeyOf(a: AntragRow): string {
    if (groupBy === "month") return monthKey(a.submitted_at);
    return String(a[groupBy as keyof AntragRow] ?? "");
  }

  function compareVals(a: AntragRow, b: AntragRow, key: SortKey, dir: SortDir): number {
    if (key === "antragssumme") {
      const d = (a.geforderte_foerdersumme_euro ?? -Infinity) - (b.geforderte_foerdersumme_euro ?? -Infinity);
      return dir === "asc" ? d : -d;
    }
    if (key === "gesamt") {
      const d = totalEuro(a) - totalEuro(b);
      return dir === "asc" ? d : -d;
    }
    if (key === "vj") {
      const va = vjValue(a, vjMap) ?? -Infinity;
      const vb = vjValue(b, vjMap) ?? -Infinity;
      return dir === "asc" ? va - vb : vb - va;
    }
    if (key === "diff") {
      const va = vjValue(a, vjMap);
      const vb = vjValue(b, vjMap);
      const da = va === null ? -Infinity : totalEuro(a) - va;
      const db = vb === null ? -Infinity : totalEuro(b) - vb;
      return dir === "asc" ? da - db : db - da;
    }
    if (key === "status") {
      const ai = STATUS_ORDER.indexOf(a.status);
      const bi = STATUS_ORDER.indexOf(b.status);
      return dir === "asc" ? ai - bi : bi - ai;
    }
    const av = String(a[key as keyof AntragRow] ?? "").toLowerCase();
    const bv = String(b[key as keyof AntragRow] ?? "").toLowerCase();
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  }

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (groupBy !== "none") {
        const ga = groupKeyOf(a);
        const gb = groupKeyOf(b);
        if (groupBy === "status") {
          const ai = STATUS_ORDER.indexOf(ga as Status);
          const bi = STATUS_ORDER.indexOf(gb as Status);
          if (ai !== bi) return ai - bi;
        } else if (groupBy === "month") {
          // Neueste Monate zuerst
          if (ga !== gb) return ga < gb ? 1 : -1;
        } else {
          if (ga < gb) return -1;
          if (ga > gb) return 1;
        }
      }
      return compareVals(a, b, sortKey, sortDir);
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir, groupBy, vjMap]);

  function toggleStatus(s: Status) {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // Render-Liste mit Gruppen-Markern + aggregierter Summe + VJ-Aggregat pro Gruppe
  const rendered: Array<
    | { kind: "group"; label: string; count: number; antragsSumme: number; summe: number; vjSumme: number | null }
    | { kind: "row"; antrag: AntragRow }
  > = [];

  if (groupBy === "none") {
    sorted.forEach((a) => rendered.push({ kind: "row", antrag: a }));
  } else {
    const counts = new Map<string, number>();
    const antragsSums = new Map<string, number>();
    const sums = new Map<string, number>();
    const vjSums = new Map<string, number | null>();
    sorted.forEach((a) => {
      const g = groupKeyOf(a);
      counts.set(g, (counts.get(g) ?? 0) + 1);
      antragsSums.set(g, (antragsSums.get(g) ?? 0) + (a.geforderte_foerdersumme_euro ?? 0));
      sums.set(g, (sums.get(g) ?? 0) + totalEuro(a));
      const vj = vjValue(a, vjMap);
      const prev = vjSums.get(g);
      if (vj !== null) {
        vjSums.set(g, (prev ?? 0) + vj);
      } else if (!vjSums.has(g)) {
        vjSums.set(g, null);
      }
    });
    let currentGroup = "";
    sorted.forEach((a) => {
      const g = groupKeyOf(a);
      if (g !== currentGroup) {
        rendered.push({
          kind: "group",
          label: groupLabel(groupBy, g),
          count: counts.get(g) ?? 0,
          antragsSumme: antragsSums.get(g) ?? 0,
          summe: sums.get(g) ?? 0,
          vjSumme: vjSums.get(g) ?? null,
        });
        currentGroup = g;
      }
      rendered.push({ kind: "row", antrag: a });
    });
  }

  const gesamtAntragsSumme = filtered.reduce(
    (s, a) => s + (a.geforderte_foerdersumme_euro ?? 0), 0,
  );
  const gesamtSumme = filtered.reduce((s, a) => s + totalEuro(a), 0);
  const gesamtVj = filtered.reduce<{ sum: number; hasAny: boolean }>(
    (acc, a) => {
      const v = vjValue(a, vjMap);
      if (v !== null) return { sum: acc.sum + v, hasAny: true };
      return acc;
    },
    { sum: 0, hasAny: false },
  );
  // Footer-Δ vergleicht aktuelle GeforderteSummen vs. VJ-Antragssummen
  // (nicht Aufwand vs. Antrag — das wäre Äpfel/Birnen)
  const gesamtDiff = formatDiff(gesamtAntragsSumme, gesamtVj.hasAny ? gesamtVj.sum : null);

  const toneClass = (tone: "up" | "down" | "neutral") =>
    tone === "up" ? "text-emerald-700" : tone === "down" ? "text-rose-700" : "text-slate-400";

  const COL_COUNT_BEFORE_GESAMT = 6; // antragsnr, name, traeger, datum, sprache, status

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 relative">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-wue-rot" />
        <div className="w-full px-4 lg:px-8 py-3 flex items-center justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-wue-rot font-semibold">
              Stadt Würzburg · Sozialreferat
            </div>
            <h1 className="text-xl font-bold leading-tight">
              Sachbearbeitung KI — APL 2
            </h1>
            <p className="text-sm text-slate-500">
              Beratungsstelle für Senioren · KI-gestützte Antragsprüfung
            </p>
          </div>
          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-1 text-sm mr-2">
              <NavLink
                to="/ahp"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                title="AHP-Förderrichtlinie als strukturierter Volltext"
              >
                <BookOpen className="h-4 w-4" />
                AHP
              </NavLink>
              <NavLink
                to="/normen"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                title="Norm-Aussagen aus der AHP-Richtlinie"
              >
                <Network className="h-4 w-4" />
                Normen
              </NavLink>
              <NavLink
                to="/regelkatalog"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                title="Prüfregeln gegen die AHP-Förderrichtlinie"
              >
                <FileSearch className="h-4 w-4" />
                Regelkatalog
              </NavLink>
              <NavLink
                to="/compliance"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                title="AI-Act- + DSGVO-Compliance-Statusseite"
              >
                <Shield className="h-4 w-4" />
                Compliance
              </NavLink>
              <span className="h-6 w-px bg-slate-200 mx-1" aria-hidden="true" />
            </nav>
            <img
              src={avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-10 w-10 rounded-full ring-2 ring-wue-rot-soft shadow-sm object-cover"
            />
            <div className="text-sm leading-tight">
              <div className="font-medium text-slate-900">{displayName}</div>
              <div className="text-xs text-slate-500">{userEmail || "—"}</div>
            </div>
            <div className="hidden sm:block h-8 w-px bg-slate-200" aria-hidden="true"></div>
            <div className="text-sm text-slate-500">
              Rolle <span className="font-medium text-slate-700">{rolle ?? "—"}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
              Abmelden
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full px-4 lg:px-8 py-6">
        {meineZweitpruefungen.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded p-4 mb-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden="true">👁️</span>
              <div className="flex-1">
                <h2 className="font-semibold text-amber-900 text-sm">
                  Du bist als Zweitprüfer:in zugewiesen ({meineZweitpruefungen.length})
                </h2>
                <p className="text-xs text-amber-800 mt-0.5">
                  Folgende Anträge warten auf deine Zweitprüfung — bitte zeitnah bearbeiten.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {meineZweitpruefungen.map((z) => (
                    <Link
                      key={z.pruefung_id}
                      to={`/antrag/${z.antrag_id}`}
                      className="inline-flex items-center gap-1.5 text-xs bg-white border border-amber-300 hover:border-amber-500 text-amber-900 rounded px-2 py-1 transition-colors"
                    >
                      <span className="font-mono">{z.antragsnummer}</span>
                      <span className="text-amber-700">·</span>
                      <span>{z.traeger}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
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
                    filter.has(s) ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="hj-filter" className="text-slate-600">Haushaltsjahr:</label>
              <select
                id="hj-filter"
                value={effektivesHj === null ? "all" : String(effektivesHj)}
                onChange={(e) => {
                  setHjFilterDirty(true);
                  setHjFilter(e.target.value === "all" ? null : Number(e.target.value));
                }}
                className="border border-slate-300 rounded px-2 py-1 text-sm tabular-nums"
              >
                {verfuegbareHj.map((hj) => (
                  <option key={hj} value={String(hj)}>{hj}</option>
                ))}
                <option value="all">Alle Jahre</option>
              </select>
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
              {effektivesHj !== null && (
                <span className="text-slate-400"> (gefiltert HJ {effektivesHj})</span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded overflow-x-auto">
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
                      <TableHead key={col.key} className={`whitespace-nowrap ${col.align === "right" ? "text-right" : ""}`}>
                        <button
                          type="button"
                          onClick={() => handleSort(col.key)}
                          title={col.tooltip}
                          className={`inline-flex items-center gap-1 text-xs uppercase tracking-wide ${active ? "text-slate-900 font-semibold" : "text-slate-500 hover:text-slate-900"} ${col.tooltip ? "cursor-help" : ""}`}
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
                    <TableRow key={`g-${idx}`} className="border-t border-slate-200 hover:bg-transparent">
                      <TableCell colSpan={COL_COUNT_BEFORE_GESAMT} className="py-3 pl-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <span className="inline-block w-[3px] h-5 bg-blue-700 rounded-sm" aria-hidden="true"></span>
                          <span className="font-semibold text-[15px] text-slate-900">{item.label}</span>
                          <span className="text-xs text-slate-500 font-normal">{item.count} {item.count === 1 ? "Antrag" : "Anträge"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-[15px] text-slate-900 py-3 whitespace-nowrap">
                        {formatEuro(item.antragsSumme)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-slate-600 py-3 whitespace-nowrap">
                        {formatEuro(item.summe)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-slate-500 py-3 whitespace-nowrap">
                        {item.vjSumme === null ? "—" : formatEuro(item.vjSumme)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm py-3 whitespace-nowrap">
                        {/* Δ Antrag: aktuelle Forderung vs. VJ-Forderung (nicht Aufwand) */}
                        <span className={toneClass(formatDiff(item.antragsSumme, item.vjSumme).tone)}>
                          {formatDiff(item.antragsSumme, item.vjSumme).text}
                        </span>
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  ) : (
                    (() => {
                      const vj = vjValue(item.antrag, vjMap);
                      // Δ Antrag = geforderte Fördersumme aktuell − VJ-Antrag
                      // (siehe buildVjMap-Docstring — beide auf geforderte Summe,
                      // sonst Äpfel/Birnen-Vergleich)
                      const diff = formatDiff(
                        item.antrag.geforderte_foerdersumme_euro ?? 0, vj,
                      );
                      return (
                        <TableRow key={item.antrag.id} className="hover:bg-blue-50/30">
                          <TableCell className="font-mono text-xs text-slate-500 whitespace-nowrap">
                            <Highlight text={item.antrag.antragsnummer} needle={search} />
                          </TableCell>
                          <TableCell className="text-slate-900 whitespace-nowrap">
                            <Highlight text={item.antrag.name} needle={search} />
                          </TableCell>
                          <TableCell className="text-slate-600 whitespace-nowrap">
                            <Highlight text={item.antrag.traeger} needle={search} />
                          </TableCell>
                          <TableCell className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(item.antrag.submitted_at)}</TableCell>
                          <TableCell className="whitespace-nowrap"><Badge variant="secondary">{item.antrag.submitted_language.toUpperCase()}</Badge></TableCell>
                          <TableCell className="whitespace-nowrap"><StatusBadge status={item.antrag.status} /></TableCell>
                          <TableCell className="text-right tabular-nums text-sm whitespace-nowrap">
                            {item.antrag.geforderte_foerdersumme_euro !== null
                              ? <span className="font-medium text-slate-900">{formatEuro(item.antrag.geforderte_foerdersumme_euro)}</span>
                              : <span className="text-slate-400">—</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-slate-600 whitespace-nowrap">{formatEuro(totalEuro(item.antrag))}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-slate-500 whitespace-nowrap">
                            {vj === null ? "—" : formatEuro(vj)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm whitespace-nowrap">
                            <span className={toneClass(diff.tone)}>{diff.text}</span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap pr-4">
                            <Link
                              to={`/antrag/${item.antrag.id}`}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-1.5 shadow-sm transition-colors"
                            >
                              Öffnen
                              <span aria-hidden="true">→</span>
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })()
                  ),
                )}
                {rendered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length + 1} className="text-center text-slate-500 py-8">
                      Keine Anträge gefunden.
                    </TableCell>
                  </TableRow>
                )}
                {rendered.length > 0 && (
                  <TableRow className="border-t-2 border-blue-700 bg-blue-50/30 hover:bg-blue-50/30">
                    <TableCell colSpan={COL_COUNT_BEFORE_GESAMT} className="py-4 pl-4 text-sm text-slate-700 whitespace-nowrap">
                      Gesamtsumme aller angezeigten Anträge
                    </TableCell>
                    <TableCell className="py-4 text-right tabular-nums text-lg font-bold text-slate-900 whitespace-nowrap">
                      {formatEuro(gesamtAntragsSumme)}
                    </TableCell>
                    <TableCell className="py-4 text-right tabular-nums text-sm text-slate-600 whitespace-nowrap">
                      {formatEuro(gesamtSumme)}
                    </TableCell>
                    <TableCell className="py-4 text-right tabular-nums text-sm text-slate-500 whitespace-nowrap">
                      {gesamtVj.hasAny ? formatEuro(gesamtVj.sum) : "—"}
                    </TableCell>
                    <TableCell className="py-4 text-right tabular-nums text-sm whitespace-nowrap">
                      <span className={toneClass(gesamtDiff.tone)}>{gesamtDiff.text}</span>
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

