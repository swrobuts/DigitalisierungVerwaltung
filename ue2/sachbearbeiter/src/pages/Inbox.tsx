import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAntraege, type AntragRow } from "../hooks/useAntraege";
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

/** Stadtbewohner-Anteil 0…1 als Prozent-String. AHP 2.3 Pkt. 2/3:
 *  Auszahlung erfolgt anteilig nach dem Anteil Würzburger Stadtbewohner. */
function formatStadtAnteil(a: number | null): string {
  if (a === null || a === undefined) return "—";
  return `${(a * 100).toFixed(1).replace(".", ",")} %`;
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
  | "submitted_language" | "status"
  | "antragssumme" | "vj" | "diff"
  | "stadt_anteil";
type SortDir = "asc" | "desc";
type GroupKey = "none" | "status" | "traeger" | "submitted_language" | "month";

/** Spalten der Inbox, analog zu UE3 (amt-ki). UE2 hat kein Zahnrad zum
 *  An/Abwählen — wir zeigen nur die Spalten, die in UE3 default sichtbar
 *  sind. „Sprache" sowie „Teilnehmer:innen"/„Veranstaltungen" sind in
 *  UE3 default-off; lassen wir hier aus, um die Tabelle nicht zu
 *  überfrachten. Wer mehr braucht, nutzt UE3.
 */
interface SpaltenDef {
  key: SortKey;
  label: string;
  align?: "right";
  tooltip?: string;
}

const COLUMNS: SpaltenDef[] = [
  { key: "antragsnummer", label: "Antrag-Nr.",
    tooltip: "Antragsnummer (eindeutige ID)" },
  { key: "name", label: "Name" },
  { key: "traeger", label: "Träger" },
  { key: "submitted_at", label: "Eingang",
    tooltip: "Zeitpunkt des Antragseingangs" },
  { key: "status", label: "Status" },
  { key: "antragssumme", label: "Antragssumme", align: "right",
    tooltip: "Beantragte Fördersumme im aktuellen Haushaltsjahr (max. 10.000 € gem. AHP 2.3 Pkt. 2)" },
  { key: "vj", label: "Antragssumme Vorjahr", align: "right",
    tooltip: "Beantragte Fördersumme im Vorjahres-Antrag desselben Trägers (aus DB rekonstruiert)" },
  { key: "diff", label: "Δ", align: "right",
    tooltip: "Aktuelle Antragssumme minus Vorjahres-Antragssumme" },
  { key: "stadt_anteil", label: "Stadt-Anteil", align: "right",
    tooltip:
      "Anteil Stadtbewohner:innen Würzburg an Gesamt-Teilnehmer:innen des " +
      "Vorjahres. Bestimmt direkt den prozentualen Auszahlungsanteil " +
      "(AHP 2.3 Pkt. 2)." },
];

/** Jahres-spezifische Labels (z.B. „Antragssumme 2026" / „Antragssumme 2025")
 *  aus dem aktiven Haushaltsjahres-Filter. */
function spaltenFuerHaushaltsjahr(hj: number | null): SpaltenDef[] {
  if (hj === null) return COLUMNS;
  const vj = hj - 1;
  return COLUMNS.map((c) => {
    switch (c.key) {
      case "antragssumme":
        return { ...c, label: `Antragssumme ${hj}` };
      case "vj":
        return { ...c, label: `Antragssumme ${vj}` };
      case "stadt_anteil":
        return { ...c, label: `Stadt-Anteil ${vj}` };
      default:
        return c;
    }
  });
}

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
 * VJ-Wert eines Antrags = Summe der GEFORDERTEN Fördersummen aller Anträge
 * desselben Trägers für haushaltsjahr - 1. Null = kein VJ-Antrag.
 *
 * Wichtig: hier wird geforderte_foerdersumme_euro summiert (Antrags-vs-
 * Antrags-Vergleich, „Forderung gegen Forderung"). Früher wurde totalEuro
 * (Aufwand-Eigenangabe) summiert — das war Äpfel/Birnen, weil das Δ dann
 * Aufwand vs. Antrag verglichen hat. Fix synchron zu UE3.
 */
function buildVjMap(antraege: AntragRow[]): Map<string, number> {
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
  const { rolle } = useUserRole();
  const { session } = useSession();
  const userEmail = session?.user?.email ?? "";
  const userMeta = (session?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (typeof userMeta.full_name === "string" && userMeta.full_name) ||
    (typeof userMeta.name === "string" && userMeta.name) ||
    (userEmail ? userEmail.split("@")[0] : "—");
  // Demo-Avatar wird aus public/ ausgeliefert; identisch zu UE3 für
  // visuelle Konsistenz zwischen beiden Sachbearbeiter-Cockpits.
  const avatarUrl = "/demoImage.png";
  const [filter, setFilter] = useState<Set<Status>>(new Set());
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("submitted_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [groupBy, setGroupBy] = useState<GroupKey>("none");

  // VJ-Map über ALLE Anträge (nicht nur gefilterte) — sonst falscher Vergleich
  const vjMap = useMemo(() => buildVjMap(antraege), [antraege]);

  // Haushaltsjahr-Filter: Default das jüngste vorhandene HJ.
  // Sachbearbeitende sehen primär das laufende Förderjahr; ältere Anträge
  // (z.B. für Vorjahres-Vergleich) sind über das Dropdown explizit
  // zuschaltbar. Analog zu UE3.
  const verfuegbareHj = useMemo(() => {
    const set = new Set<number>();
    for (const a of antraege) if (a.haushaltsjahr) set.add(a.haushaltsjahr);
    return Array.from(set).sort((a, b) => b - a);
  }, [antraege]);
  const [hjFilter, setHjFilter] = useState<number | null>(null);
  const [hjFilterDirty, setHjFilterDirty] = useState(false);
  const effektivesHj: number | null = hjFilterDirty
    ? hjFilter
    : (verfuegbareHj[0] ?? null);

  // Spalten mit jahresbezogenen Labels (z.B. „Antragssumme 2026" /
  // „Antragssumme 2025") — synchron zu UE3 für visuelle Konsistenz.
  const spaltenMitJahr = useMemo(
    () => spaltenFuerHaushaltsjahr(effektivesHj),
    [effektivesHj],
  );

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
    if (key === "vj") {
      const va = vjValue(a, vjMap) ?? -Infinity;
      const vb = vjValue(b, vjMap) ?? -Infinity;
      return dir === "asc" ? va - vb : vb - va;
    }
    if (key === "diff") {
      // Δ = aktuelle Antragssumme − VJ-Antragssumme (siehe buildVjMap-Docstring)
      const va = vjValue(a, vjMap);
      const vb = vjValue(b, vjMap);
      const da = va === null ? -Infinity : (a.geforderte_foerdersumme_euro ?? 0) - va;
      const db = vb === null ? -Infinity : (b.geforderte_foerdersumme_euro ?? 0) - vb;
      return dir === "asc" ? da - db : db - da;
    }
    if (key === "stadt_anteil") {
      const d = (a.stadtbewohner_anteil ?? -Infinity) - (b.stadtbewohner_anteil ?? -Infinity);
      return dir === "asc" ? d : -d;
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

  // Render-Liste mit Gruppen-Markern + Aggregaten.
  // Stadt-Anteil wird TEILNEHMER-GEWICHTET aggregiert (siehe UE3 — AHP 2.3
  // Pkt. 2 definiert ihn als „Anteil an GESAMTEN Teilnehmer:innen", daher
  // nicht arithmetisches Mittel über Anträge).
  const rendered: Array<
    | {
        kind: "group";
        label: string;
        count: number;
        antragsSumme: number;
        vjSumme: number | null;
        stadtAnteilGewichtet: number | null;
      }
    | { kind: "row"; antrag: AntragRow }
  > = [];

  if (groupBy === "none") {
    sorted.forEach((a) => rendered.push({ kind: "row", antrag: a }));
  } else {
    const counts = new Map<string, number>();
    const antragsSums = new Map<string, number>();
    const stadtZaehler = new Map<string, number>();
    const stadtNenner = new Map<string, number>();
    const vjSums = new Map<string, number | null>();
    sorted.forEach((a) => {
      const g = groupKeyOf(a);
      counts.set(g, (counts.get(g) ?? 0) + 1);
      antragsSums.set(g, (antragsSums.get(g) ?? 0) + (a.geforderte_foerdersumme_euro ?? 0));
      if (a.stadtbewohner_anteil !== null && a.anzahl_teilnehmer !== null) {
        stadtZaehler.set(g, (stadtZaehler.get(g) ?? 0) + a.stadtbewohner_anteil * a.anzahl_teilnehmer);
        stadtNenner.set(g, (stadtNenner.get(g) ?? 0) + a.anzahl_teilnehmer);
      }
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
        const nenner = stadtNenner.get(g) ?? 0;
        const zaehler = stadtZaehler.get(g) ?? 0;
        rendered.push({
          kind: "group",
          label: groupLabel(groupBy, g),
          count: counts.get(g) ?? 0,
          antragsSumme: antragsSums.get(g) ?? 0,
          vjSumme: vjSums.get(g) ?? null,
          stadtAnteilGewichtet: nenner > 0 ? zaehler / nenner : null,
        });
        currentGroup = g;
      }
      rendered.push({ kind: "row", antrag: a });
    });
  }

  const gesamtAntragsSumme = filtered.reduce(
    (s, a) => s + (a.geforderte_foerdersumme_euro ?? 0), 0,
  );
  // Stadt-Anteil im Footer = teilnehmer-gewichteter Durchschnitt (siehe oben)
  const stadtAgg = filtered.reduce<{ z: number; n: number }>((acc, a) => {
    if (a.stadtbewohner_anteil !== null && a.anzahl_teilnehmer !== null) {
      acc.z += a.stadtbewohner_anteil * a.anzahl_teilnehmer;
      acc.n += a.anzahl_teilnehmer;
    }
    return acc;
  }, { z: 0, n: 0 });
  const gesamtStadtAnteil: number | null = stadtAgg.n > 0 ? stadtAgg.z / stadtAgg.n : null;
  const gesamtVj = filtered.reduce<{ sum: number; hasAny: boolean }>(
    (acc, a) => {
      const v = vjValue(a, vjMap);
      if (v !== null) return { sum: acc.sum + v, hasAny: true };
      return acc;
    },
    { sum: 0, hasAny: false },
  );
  const gesamtDiff = formatDiff(gesamtAntragsSumme, gesamtVj.hasAny ? gesamtVj.sum : null);

  const toneClass = (tone: "up" | "down" | "neutral") =>
    tone === "up" ? "text-emerald-700" : tone === "down" ? "text-rose-700" : "text-slate-400";

  // Identitäts-Spalten (links der ersten Aggregat-Spalte) für colspan im
  // Gruppen-/Footer-Header. Status zählt mit, Antragssumme + rechts davon
  // nicht.
  const COL_COUNT_BEFORE_GESAMT = 5; // antragsnr, name, traeger, eingang, status

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 relative">
        {/* 3px Würzburg-Rot-Akzentlinie oben — visuelle Konsistenz zu
            UE3 (KI-Variante), aber bewusst OHNE die KI-Nav-Links
            (AHP / Normen / Regelkatalog / Compliance), weil UE2 diese
            Features funktional nicht hat. */}
        <div className="absolute inset-x-0 top-0 h-[3px] bg-wue-rot" />
        <div className="w-full px-4 lg:px-8 py-3 flex items-center justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-wue-rot font-semibold">
              Stadt Würzburg · Sozialreferat
            </div>
            <h1 className="text-xl font-bold leading-tight">
              Sachbearbeitung — APL 2
            </h1>
            <p className="text-sm text-slate-500">
              Beratungsstelle für Senioren · Antragsprüfung
            </p>
          </div>
          <div className="flex items-center gap-4">
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
                  {spaltenMitJahr.map((col) => {
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
                      <TableCell className="text-right tabular-nums text-sm text-slate-500 py-3 whitespace-nowrap">
                        {item.vjSumme === null ? "—" : formatEuro(item.vjSumme)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm py-3 whitespace-nowrap">
                        <span className={toneClass(formatDiff(item.antragsSumme, item.vjSumme).tone)}>
                          {formatDiff(item.antragsSumme, item.vjSumme).text}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-slate-700 py-3 whitespace-nowrap font-medium">
                        {formatStadtAnteil(item.stadtAnteilGewichtet)}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  ) : (
                    (() => {
                      const vj = vjValue(item.antrag, vjMap);
                      const diff = formatDiff(item.antrag.geforderte_foerdersumme_euro ?? 0, vj);
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
                          <TableCell className="whitespace-nowrap"><StatusBadge status={item.antrag.status} /></TableCell>
                          <TableCell className="text-right tabular-nums text-sm whitespace-nowrap">
                            {item.antrag.geforderte_foerdersumme_euro !== null
                              ? <span className="font-medium text-slate-900">{formatEuro(item.antrag.geforderte_foerdersumme_euro)}</span>
                              : <span className="text-slate-400">—</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-slate-500 whitespace-nowrap">
                            {vj === null ? "—" : formatEuro(vj)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm whitespace-nowrap">
                            <span className={toneClass(diff.tone)}>{diff.text}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-slate-700 whitespace-nowrap font-medium">
                            {formatStadtAnteil(item.antrag.stadtbewohner_anteil)}
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
                    <TableCell colSpan={spaltenMitJahr.length + 1} className="text-center text-slate-500 py-8">
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
                    <TableCell className="py-4 text-right tabular-nums text-sm text-slate-500 whitespace-nowrap">
                      {gesamtVj.hasAny ? formatEuro(gesamtVj.sum) : "—"}
                    </TableCell>
                    <TableCell className="py-4 text-right tabular-nums text-sm whitespace-nowrap">
                      <span className={toneClass(gesamtDiff.tone)}>{gesamtDiff.text}</span>
                    </TableCell>
                    <TableCell className="py-4 text-right tabular-nums text-sm text-slate-700 whitespace-nowrap font-medium">
                      {formatStadtAnteil(gesamtStadtAnteil)}
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
