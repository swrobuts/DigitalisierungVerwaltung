import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Settings } from "lucide-react";
import { useAntraege, type AntragRow } from "../hooks/useAntraege";
import { DemoDatenBanner } from "../components/DemoDatenBanner";
import {
  istStadtAnteilRelevant,
  istTreffenRelevant,
  naTooltip,
} from "../lib/foerderbereich-relevanz";
import { useUserRole } from "../hooks/useUserRole";
import { useSession } from "../hooks/useSession";
import { supabase } from "../lib/supabase";
import { StatusBadge } from "../components/StatusBadge";
import { formatDate, formatEuro, formatDurchlaufzeit, durchlaufzeitAmpel, type DurchlaufzeitAmpel } from "../lib/format";
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
  | "submitted_language" | "status" | "durchlaufzeit"
  | "antragssumme" | "vj" | "diff"
  | "stadt_anteil" | "teilnehmer" | "treffen";

/** Tailwind-Klassen-Mapping für die Durchlaufzeit-Ampel.
 *  Identisch in UE2/UE3 — Sachbearbeitende sollen denselben visuellen
 *  Code in beiden Cockpits sehen. */
const AMPEL_BG: Record<DurchlaufzeitAmpel, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-slate-400",
};
type SortDir = "asc" | "desc";
type GroupKey = "none" | "status" | "traeger" | "submitted_language" | "month";

/** Spalten der Inbox — IDENTISCH zu UE3 (amt-ki). Beide Cockpits setzen
 *  auf demselben UE1-Antragsformular und derselben Rechtsgrundlage auf;
 *  die Unterschiede zwischen UE2 und UE3 liegen ausschließlich in den
 *  KI-Features (Vier-Augen-Prinzip, KI-Validierung) — nicht in der
 *  Datenanzeige. Daher dieselbe Spaltenstruktur inklusive Zahnrad-
 *  Konfigurator.
 */
interface SpaltenDef {
  key: SortKey;
  label: string;
  align?: "right";
  tooltip?: string;
  /** Pflicht-Spalten können nicht via Zahnrad versteckt werden — sie
   *  sind die Mindest-Identifikation eines Antrags. */
  pflicht?: boolean;
  /** Sichtbar bei erstem Laden (wenn User nichts gespeichert hat). */
  defaultVisible: boolean;
}

const COLUMNS: SpaltenDef[] = [
  { key: "antragsnummer", label: "Antragsnummer", pflicht: true, defaultVisible: true,
    tooltip: "Antragsnummer (eindeutige ID)" },
  { key: "name", label: "Name", defaultVisible: true },
  { key: "traeger", label: "Träger", defaultVisible: true },
  { key: "submitted_at", label: "Eingegangen", defaultVisible: true,
    tooltip: "Zeitpunkt des Antragseingangs" },
  { key: "submitted_language", label: "Sprache", defaultVisible: false },
  { key: "status", label: "Status", pflicht: true, defaultVisible: true },
  { key: "durchlaufzeit", label: "Durchlaufzeit", defaultVisible: true,
    tooltip:
      "Tage zwischen Antragseingang und Bewilligung/Ablehnung. " +
      "Bei offenen Anträgen: Tage seit Eingang. Ampel: <30 grün, " +
      "30–60 gelb, >60 rot (Migration 058)." },
  { key: "antragssumme", label: "Antragssumme", align: "right", pflicht: true, defaultVisible: true,
    tooltip: "Beantragte Fördersumme im aktuellen Haushaltsjahr (max. 10.000 € gem. AHP 2.3 Pkt. 2)" },
  { key: "vj", label: "Antragssumme Vorjahr", align: "right", defaultVisible: true,
    tooltip: "Beantragte Fördersumme im Vorjahres-Antrag desselben Trägers (aus DB rekonstruiert)" },
  { key: "diff", label: "Δ Antragssumme", align: "right", defaultVisible: true,
    tooltip: "Aktuelle Antragssumme minus Vorjahres-Antragssumme" },
  { key: "stadt_anteil", label: "Stadt-Anteil", align: "right", defaultVisible: true,
    tooltip:
      "Anteil Stadtbewohner:innen Würzburg an Gesamt-Teilnehmer:innen des " +
      "Vorjahres. Ausschlaggebend NUR für Begegnungszentren und " +
      "Bildungsträger (anteilige Auszahlung gem. AHP 2.3 Pkt. 2). Bei " +
      "anderen Förderbereichen wird n/a angezeigt." },
  { key: "teilnehmer", label: "Teilnehmer:innen", align: "right", defaultVisible: false,
    tooltip:
      "Teilnehmer:innen gesamt im Vorjahr. Allgemeiner Bemessungs- " +
      "und Gewichtungsfaktor (AHP 2.3 Pkt. 2 / 3) — wird hier für alle " +
      "Förderbereiche angezeigt." },
  { key: "treffen", label: "Veranstaltungen", align: "right", defaultVisible: false,
    tooltip:
      "Durchgeführte Veranstaltungen im Vorjahr. Bei Seniorenkreisen " +
      "bindet die Treffen-Staffel (AHP 2.3.4) die Förderhöhe direkt; bei " +
      "Begegnungszentren als Gewichtungsfaktor. Bei anderen " +
      "Förderbereichen wird n/a angezeigt." },
];

const HIDDEN_COLUMNS_STORAGE_KEY = "inbox.hidden_columns.v1";

function loadHiddenColumns(): Set<SortKey> {
  if (typeof window === "undefined") return defaultHidden();
  try {
    const raw = window.localStorage.getItem(HIDDEN_COLUMNS_STORAGE_KEY);
    if (!raw) return defaultHidden();
    const arr = JSON.parse(raw) as SortKey[];
    return new Set(arr.filter((k) => !COLUMNS.find((c) => c.key === k)?.pflicht));
  } catch {
    return defaultHidden();
  }
}

function defaultHidden(): Set<SortKey> {
  return new Set(
    COLUMNS.filter((c) => !c.defaultVisible && !c.pflicht).map((c) => c.key),
  );
}

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
      // 'diff' bleibt bewusst beim Default-Label „Δ Antragssumme" —
      // ein blankes „Δ" wäre inkonsistent zu den ausgeschriebenen
      // Nachbarspalten und für Außenstehende kryptisch.
      case "stadt_anteil":
        return { ...c, label: `Stadt-Anteil ${vj}` };
      case "teilnehmer":
        return { ...c, label: `Teilnehmer:innen ${vj}` };
      case "treffen":
        return { ...c, label: `Veranstaltungen ${vj}` };
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

/** Kompaktes Δ-Format für die Inbox-Spalte (analog UE3): keine Centbeträge
 *  ab 100 €, Prozent ohne Nachkommastelle, Vorzeichen direkt am Wert. */
function formatDiff(current: number, vj: number | null): { text: string; tone: "up" | "down" | "neutral" } {
  if (vj === null) return { text: "—", tone: "neutral" };
  const diff = current - vj;
  if (Math.abs(diff) < 0.01) return { text: "± 0", tone: "neutral" };
  const sign = diff > 0 ? "+" : "−";
  const abs = Math.abs(diff);
  const euroFmt = abs >= 100
    ? `${Math.round(abs).toLocaleString("de-DE")} €`
    : formatEuro(abs);
  const pct = vj === 0 ? null : (diff / vj) * 100;
  const pctTxt = pct === null
    ? ""
    : ` (${pct > 0 ? "+" : "−"}${Math.round(Math.abs(pct))} %)`;
  return {
    text: `${sign}${euroFmt}${pctTxt}`,
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
  // Spalten-Konfiguration: User kann via Zahnrad an/abwählen, was er
  // sehen will. Default + Preset im localStorage. Identisch zu UE3.
  const [hiddenCols, setHiddenCols] = useState<Set<SortKey>>(loadHiddenColumns);
  const istSichtbar = (key: SortKey) => !hiddenCols.has(key);
  function toggleColumn(key: SortKey) {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(HIDDEN_COLUMNS_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch { /* ignore quota errors */ }
      return next;
    });
  }

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
  const sichtbareSpalten = useMemo(
    () => spaltenMitJahr.filter((c) => istSichtbar(c.key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spaltenMitJahr, hiddenCols],
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
    if (key === "teilnehmer") {
      const d = (a.anzahl_teilnehmer ?? -Infinity) - (b.anzahl_teilnehmer ?? -Infinity);
      return dir === "asc" ? d : -d;
    }
    if (key === "treffen") {
      const d = (a.anzahl_treffen_jahr ?? -Infinity) - (b.anzahl_treffen_jahr ?? -Infinity);
      return dir === "asc" ? d : -d;
    }
    if (key === "status") {
      const ai = STATUS_ORDER.indexOf(a.status);
      const bi = STATUS_ORDER.indexOf(b.status);
      return dir === "asc" ? ai - bi : bi - ai;
    }
    if (key === "durchlaufzeit") {
      const d = (a.durchlaufzeit_tage ?? 0) - (b.durchlaufzeit_tage ?? 0);
      return dir === "asc" ? d : -d;
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
        teilnehmerSumme: number;
        treffenSumme: number;
      }
    | { kind: "row"; antrag: AntragRow }
  > = [];

  if (groupBy === "none") {
    sorted.forEach((a) => rendered.push({ kind: "row", antrag: a }));
  } else {
    const counts = new Map<string, number>();
    const antragsSums = new Map<string, number>();
    const teilnehmerSums = new Map<string, number>();
    const treffenSums = new Map<string, number>();
    const stadtZaehler = new Map<string, number>();
    const stadtNenner = new Map<string, number>();
    const vjSums = new Map<string, number | null>();
    sorted.forEach((a) => {
      const g = groupKeyOf(a);
      counts.set(g, (counts.get(g) ?? 0) + 1);
      antragsSums.set(g, (antragsSums.get(g) ?? 0) + (a.geforderte_foerdersumme_euro ?? 0));
      teilnehmerSums.set(g, (teilnehmerSums.get(g) ?? 0) + (a.anzahl_teilnehmer ?? 0));
      treffenSums.set(g, (treffenSums.get(g) ?? 0) + (a.anzahl_treffen_jahr ?? 0));
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
          teilnehmerSumme: teilnehmerSums.get(g) ?? 0,
          treffenSumme: treffenSums.get(g) ?? 0,
        });
        currentGroup = g;
      }
      rendered.push({ kind: "row", antrag: a });
    });
  }

  const gesamtAntragsSumme = filtered.reduce(
    (s, a) => s + (a.geforderte_foerdersumme_euro ?? 0), 0,
  );
  const gesamtTeilnehmer = filtered.reduce((s, a) => s + (a.anzahl_teilnehmer ?? 0), 0);
  const gesamtTreffen = filtered.reduce((s, a) => s + (a.anzahl_treffen_jahr ?? 0), 0);
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

  // Spalten-Gruppen für Footer/Group-Row Colspan-Berechnung (analog UE3)
  // Durchlaufzeit zählt zu den Identitäts-Spalten (pro-Zeile-Wert,
  // kein sinnvolles Summen-Aggregat im Footer). Damit colspan in
  // Gruppen-/Footer-Zeile sie korrekt mit überdeckt.
  const IDENT_KEYS: SortKey[] = ["antragsnummer", "name", "traeger", "submitted_at", "submitted_language", "status", "durchlaufzeit"];
  const aggregatKeys: SortKey[] = ["antragssumme", "vj", "diff", "stadt_anteil", "teilnehmer", "treffen"];
  const sichtbareIdentSpalten = IDENT_KEYS.filter(istSichtbar);
  const sichtbareAggregatSpalten = aggregatKeys.filter(istSichtbar);
  const COL_COUNT_BEFORE_GESAMT = sichtbareIdentSpalten.length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 relative">
        {/* 3px Würzburg-Rot-Akzentlinie oben — visuelle Konsistenz zu
            UE3 (KI-Variante), aber bewusst OHNE die KI-Nav-Links
            (AHP / Normen / Regelkatalog / Compliance), weil UE2 diese
            Features funktional nicht hat. */}
        <div className="absolute inset-x-0 top-0 h-[3px] bg-wue-rot" />
        <div className="w-full px-4 py-3 flex items-center justify-between gap-6">
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

      <DemoDatenBanner />

      <main className="w-full px-4 py-6">
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
            <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
              <span>
                {filtered.length} von {antraege.length}
                {effektivesHj !== null && (
                  <span className="text-slate-400"> (gefiltert HJ {effektivesHj})</span>
                )}
              </span>
              <SpaltenKonfig
                spalten={spaltenMitJahr}
                hidden={hiddenCols}
                onToggle={toggleColumn}
              />
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
                  {sichtbareSpalten.map((col) => {
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
                      {COL_COUNT_BEFORE_GESAMT > 0 ? (
                        <TableCell colSpan={COL_COUNT_BEFORE_GESAMT} className="py-3 pl-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <span className="inline-block w-[3px] h-5 bg-blue-700 rounded-sm" aria-hidden="true"></span>
                            <span className="font-semibold text-[15px] text-slate-900">{item.label}</span>
                            <span className="text-xs text-slate-500 font-normal">{item.count} {item.count === 1 ? "Antrag" : "Anträge"}</span>
                          </div>
                        </TableCell>
                      ) : (
                        sichtbareAggregatSpalten.length === 0 && <TableCell />
                      )}
                      {istSichtbar("antragssumme") && (
                        <TableCell className="text-right tabular-nums font-semibold text-[15px] text-slate-900 py-3 whitespace-nowrap">
                          {formatEuro(item.antragsSumme)}
                        </TableCell>
                      )}
                      {istSichtbar("vj") && (
                        <TableCell className="text-right tabular-nums text-sm text-slate-500 py-3 whitespace-nowrap">
                          {item.vjSumme === null ? "—" : formatEuro(item.vjSumme)}
                        </TableCell>
                      )}
                      {istSichtbar("diff") && (
                        <TableCell className="text-right tabular-nums text-sm py-3 whitespace-nowrap">
                          <span className={toneClass(formatDiff(item.antragsSumme, item.vjSumme).tone)}>
                            {formatDiff(item.antragsSumme, item.vjSumme).text}
                          </span>
                        </TableCell>
                      )}
                      {istSichtbar("stadt_anteil") && (
                        <TableCell className="text-right tabular-nums text-sm text-slate-700 py-3 whitespace-nowrap font-medium">
                          {formatStadtAnteil(item.stadtAnteilGewichtet)}
                        </TableCell>
                      )}
                      {istSichtbar("teilnehmer") && (
                        <TableCell className="text-right tabular-nums text-sm text-slate-600 py-3 whitespace-nowrap">
                          {item.teilnehmerSumme.toLocaleString("de-DE")}
                        </TableCell>
                      )}
                      {istSichtbar("treffen") && (
                        <TableCell className="text-right tabular-nums text-sm text-slate-600 py-3 whitespace-nowrap">
                          {item.treffenSumme.toLocaleString("de-DE")}
                        </TableCell>
                      )}
                      <TableCell></TableCell>
                    </TableRow>
                  ) : (
                    (() => {
                      const vj = vjValue(item.antrag, vjMap);
                      const diff = formatDiff(item.antrag.geforderte_foerdersumme_euro ?? 0, vj);
                      return (
                        <TableRow key={item.antrag.id} className="hover:bg-blue-50/30">
                          {istSichtbar("antragsnummer") && (
                            <TableCell className="font-mono text-xs text-slate-500 whitespace-nowrap">
                              <Highlight text={item.antrag.antragsnummer} needle={search} />
                            </TableCell>
                          )}
                          {istSichtbar("name") && (
                            <TableCell className="text-slate-900 align-top">
                              <div className="max-w-[14rem] leading-snug">
                                <Highlight text={item.antrag.name} needle={search} />
                              </div>
                            </TableCell>
                          )}
                          {istSichtbar("traeger") && (
                            <TableCell className="text-slate-600 align-top">
                              <div className="max-w-[16rem] leading-snug">
                                <Highlight text={item.antrag.traeger} needle={search} />
                              </div>
                            </TableCell>
                          )}
                          {istSichtbar("submitted_at") && (
                            <TableCell className="text-xs text-slate-500 whitespace-nowrap">{formatDate(item.antrag.submitted_at)}</TableCell>
                          )}
                          {istSichtbar("submitted_language") && (
                            <TableCell className="whitespace-nowrap"><Badge variant="secondary">{item.antrag.submitted_language.toUpperCase()}</Badge></TableCell>
                          )}
                          {istSichtbar("status") && (
                            <TableCell className="whitespace-nowrap"><StatusBadge status={item.antrag.status} /></TableCell>
                          )}
                          {istSichtbar("durchlaufzeit") && (() => {
                            const entschieden = item.antrag.entscheidungs_typ !== null;
                            const ampel = durchlaufzeitAmpel(item.antrag.durchlaufzeit_tage, entschieden);
                            return (
                              <TableCell className="whitespace-nowrap text-xs text-slate-700">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className={`inline-block h-2 w-2 rounded-full ${AMPEL_BG[ampel]}`} aria-hidden="true" />
                                  {formatDurchlaufzeit(item.antrag.durchlaufzeit_tage, entschieden)}
                                </span>
                              </TableCell>
                            );
                          })()}
                          {istSichtbar("antragssumme") && (
                            <TableCell className="text-right tabular-nums text-sm whitespace-nowrap">
                              {item.antrag.geforderte_foerdersumme_euro !== null
                                ? <span className="font-medium text-slate-900">{formatEuro(item.antrag.geforderte_foerdersumme_euro)}</span>
                                : <span className="text-slate-400">—</span>}
                            </TableCell>
                          )}
                          {istSichtbar("vj") && (
                            <TableCell className="text-right tabular-nums text-sm text-slate-500 whitespace-nowrap">
                              {vj === null ? "—" : formatEuro(vj)}
                            </TableCell>
                          )}
                          {istSichtbar("diff") && (
                            <TableCell className="text-right tabular-nums text-sm whitespace-nowrap">
                              <span className={toneClass(diff.tone)}>{diff.text}</span>
                            </TableCell>
                          )}
                          {istSichtbar("stadt_anteil") && (
                            <TableCell className="text-right tabular-nums text-sm text-slate-700 whitespace-nowrap font-medium">
                              {istStadtAnteilRelevant(item.antrag.foerderbereich)
                                ? formatStadtAnteil(item.antrag.stadtbewohner_anteil)
                                : (
                                  <span
                                    className="text-slate-400 italic font-normal"
                                    title={naTooltip("stadt_anteil", item.antrag.foerderbereich!)}
                                  >n/a</span>
                                )}
                            </TableCell>
                          )}
                          {istSichtbar("teilnehmer") && (
                            <TableCell className="text-right tabular-nums text-sm text-slate-600 whitespace-nowrap">
                              {item.antrag.anzahl_teilnehmer === null
                                ? <span className="text-slate-400">—</span>
                                : item.antrag.anzahl_teilnehmer.toLocaleString("de-DE")}
                            </TableCell>
                          )}
                          {istSichtbar("treffen") && (
                            <TableCell className="text-right tabular-nums text-sm text-slate-600 whitespace-nowrap">
                              {!istTreffenRelevant(item.antrag.foerderbereich)
                                ? (
                                  <span
                                    className="text-slate-400 italic"
                                    title={naTooltip("treffen", item.antrag.foerderbereich!)}
                                  >n/a</span>
                                )
                                : item.antrag.anzahl_treffen_jahr === null
                                  ? <span className="text-slate-400">—</span>
                                  : item.antrag.anzahl_treffen_jahr.toLocaleString("de-DE")}
                            </TableCell>
                          )}
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
                    <TableCell colSpan={sichtbareSpalten.length + 1} className="text-center text-slate-500 py-8">
                      Keine Anträge gefunden.
                    </TableCell>
                  </TableRow>
                )}
                {rendered.length > 0 && (
                  <TableRow className="border-t-2 border-blue-700 bg-blue-50/30 hover:bg-blue-50/30">
                    {COL_COUNT_BEFORE_GESAMT > 0 ? (
                      <TableCell colSpan={COL_COUNT_BEFORE_GESAMT} className="py-4 pl-4 text-sm text-slate-700 whitespace-nowrap">
                        Gesamtsumme aller angezeigten Anträge
                      </TableCell>
                    ) : (
                      sichtbareAggregatSpalten.length === 0 && <TableCell />
                    )}
                    {istSichtbar("antragssumme") && (
                      <TableCell className="py-4 text-right tabular-nums text-lg font-bold text-slate-900 whitespace-nowrap">
                        {formatEuro(gesamtAntragsSumme)}
                      </TableCell>
                    )}
                    {istSichtbar("vj") && (
                      <TableCell className="py-4 text-right tabular-nums text-sm text-slate-500 whitespace-nowrap">
                        {gesamtVj.hasAny ? formatEuro(gesamtVj.sum) : "—"}
                      </TableCell>
                    )}
                    {istSichtbar("diff") && (
                      <TableCell className="py-4 text-right tabular-nums text-sm whitespace-nowrap">
                        <span className={toneClass(gesamtDiff.tone)}>{gesamtDiff.text}</span>
                      </TableCell>
                    )}
                    {istSichtbar("stadt_anteil") && (
                      <TableCell className="py-4 text-right tabular-nums text-sm text-slate-700 whitespace-nowrap font-medium">
                        {formatStadtAnteil(gesamtStadtAnteil)}
                      </TableCell>
                    )}
                    {istSichtbar("teilnehmer") && (
                      <TableCell className="py-4 text-right tabular-nums text-sm text-slate-600 whitespace-nowrap">
                        {gesamtTeilnehmer.toLocaleString("de-DE")}
                      </TableCell>
                    )}
                    {istSichtbar("treffen") && (
                      <TableCell className="py-4 text-right tabular-nums text-sm text-slate-600 whitespace-nowrap">
                        {gesamtTreffen.toLocaleString("de-DE")}
                      </TableCell>
                    )}
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

/**
 * Zahnrad-Popover zur Sichtbarkeits-Steuerung der Tabellenspalten —
 * identisch zur UE3-Version. Zwei Sektionen:
 *
 *  - „Immer sichtbar": Pflicht-Spalten (Antragsnummer, Status,
 *    Antragssumme) als Chips mit Lock-Icon, nicht-interaktiv.
 *  - „Optional": toggle-bare Spalten mit Checkbox.
 *
 * Persistenz via localStorage (HIDDEN_COLUMNS_STORAGE_KEY).
 */
function SpaltenKonfig({
  spalten,
  hidden,
  onToggle,
}: {
  spalten: SpaltenDef[];
  hidden: Set<SortKey>;
  onToggle: (key: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const pflichtSpalten = spalten.filter((c) => c.pflicht);
  const optionaleSpalten = spalten.filter((c) => !c.pflicht);
  const versteckteAnzahl = optionaleSpalten.filter((c) => hidden.has(c.key)).length;

  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Spalten konfigurieren"
        aria-label="Spalten konfigurieren"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors ${
          open
            ? "bg-slate-900 text-white border-slate-900"
            : "bg-white text-slate-600 border-slate-300 hover:text-slate-900 hover:border-slate-400"
        }`}
      >
        <Settings className="h-3.5 w-3.5" />
        Spalten
        {versteckteAnzahl > 0 && (
          <span
            className="ml-0.5 inline-flex items-center gap-0.5 h-4 px-1.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-semibold tabular-nums"
            title={`${versteckteAnzahl} optionale Spalte${versteckteAnzahl === 1 ? "" : "n"} aktuell ausgeblendet`}
          >
            {versteckteAnzahl} aus
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-72 bg-white border border-slate-200 rounded shadow-lg p-2">
          {pflichtSpalten.length > 0 && (
            <>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 px-2 pt-1 pb-1.5">
                Immer sichtbar
              </div>
              <div className="px-2 pb-2 flex flex-wrap gap-1.5 border-b border-slate-100 mb-2">
                {pflichtSpalten.map((col) => (
                  <span
                    key={col.key}
                    title="Diese Spalte ist Pflicht und kann nicht ausgeblendet werden — sie identifiziert den Antrag eindeutig."
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs"
                  >
                    <Lock className="h-3 w-3 text-slate-500" aria-hidden="true" />
                    {col.label}
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="text-[11px] uppercase tracking-wide text-slate-500 px-2 pt-1 pb-1.5">
            Optional ({optionaleSpalten.length - versteckteAnzahl} von {optionaleSpalten.length} sichtbar)
          </div>
          {optionaleSpalten.map((col) => {
            const sichtbar = !hidden.has(col.key);
            return (
              <label
                key={col.key}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                title={col.tooltip}
              >
                <input
                  type="checkbox"
                  checked={sichtbar}
                  onChange={() => onToggle(col.key)}
                  className="accent-blue-700"
                />
                <span className="flex-1">{col.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
