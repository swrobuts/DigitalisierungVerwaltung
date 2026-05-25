import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { BookOpen, FileSearch, Lock, Network, Settings, Shield } from "lucide-react";
import { useAntraege, type AntragRow } from "../hooks/useAntraege";
import { useMeineZweitpruefungen } from "../hooks/useMeineZweitpruefungen";
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

/** Stadt-Anteil aus DB (0…1) als Prozent-String. Robert hatte bei der ersten
 * Spaltennamen-Iteration zu Recht moniert, dass die Daten damals nur aus
 * Seed kamen — seit dem UE1-Step-4-Refactor erhebt das Antragsformular diese
 * Werte explizit gem. AHP 2.3 Pkt. 2 (Stadt-Anteil ist Pflichtfeld), daher
 * jetzt rechtlich abgedeckt. */
function formatStadtAnteil(a: number | null): string {
  if (a === null || a === undefined) return "—";
  return `${(a * 100).toFixed(1).replace(".", ",")} %`;
}
type SortDir = "asc" | "desc";
type GroupKey = "none" | "status" | "traeger" | "submitted_language" | "month";

// Risiko-Score-Spalte wurde bewusst entfernt: heuristischer Wert ohne
// inline-Erklärbarkeit — alle Anträge zeigten denselben Score, ohne dass
// im UI sichtbar war, welche Faktoren zugrunde lagen. Backend-Endpoint
// /api/antrag/{id}/risiko-score bleibt für späteren Re-Use, wenn wir
// eine bessere Erklärungs-UI bauen.
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

/**
 * Spalten der Inbox-Übersicht — bewusst KONSERVATIV gehalten.
 *
 * Gezeigt wird nur, was
 *   (a) das UE1-Antragsformular tatsächlich erhebt und
 *   (b) in der AHP-Förderrichtlinie eindeutig als rechtlich relevante
 *       Größe verankert ist.
 *
 * Bewusst NICHT in der Übersicht (auch wenn DB-Schema und Migrationen
 * sie kennen):
 *
 * - anzahl_teilnehmer, stadtbewohner_anteil, anzahl_treffen_jahr
 *   → vom Antragsformular nicht abgefragt; Werte stammen nur aus Seed.
 *     Migration 029 hat die Spalten für künftige Ontologie-Prüfungen
 *     vorbereitet, das Formular ist aber noch nicht erweitert.
 * - betriebskosten/personalkosten/miete
 *   → werden zwar erhoben, sind aber für Förderbereich III
 *     (Pauschalzuschuss bis 10.000 €) keine Bemessungsgrundlage:
 *     AHP 3.8 stellt klar, dass „Belege nur auf Anfrage einzureichen"
 *     sind.
 *
 * Diese Felder bleiben im AntragDetail sichtbar — dort sind sie reine
 * Antrags-Eigenschaften, nicht Bemessungs­auszug.
 *
 * Jahres-abhängige Labels (antragssumme, vj, diff) werden in
 * `spaltenFuerHaushaltsjahr()` aus dem aktiven HJ-Filter abgeleitet.
 */
const COLUMNS: SpaltenDef[] = [
  { key: "antragsnummer", label: "Antragsnummer", pflicht: true, defaultVisible: true,
    tooltip: "Antragsnummer (eindeutige ID)" },
  { key: "name", label: "Name", defaultVisible: true },
  { key: "traeger", label: "Träger", defaultVisible: true },
  { key: "submitted_at", label: "Eingegangen", defaultVisible: true,
    tooltip: "Zeitpunkt des Antragseingangs" },
  { key: "submitted_language", label: "Sprache", defaultVisible: false },
  { key: "status", label: "Status", pflicht: true, defaultVisible: true },
  // Durchlaufzeit (Migration 058) — Tage zwischen Eingang und
  // Bewilligung/Ablehnung; bei offenen Anträgen seit Eingang. Wird
  // direkt aus apl2.antrag_history abgeleitet. Default sichtbar,
  // weil Sachbearbeitende auf einen Blick sehen sollen, ob Anträge
  // zu lange liegenbleiben.
  { key: "durchlaufzeit", label: "Durchlaufzeit", defaultVisible: true,
    tooltip:
      "Tage zwischen Antragseingang und Bewilligung/Ablehnung. " +
      "Bei offenen Anträgen: Tage seit Eingang. Ampel: <30 grün, " +
      "30–60 gelb, >60 rot (Migration 058)." },
  // Antragssumme + Vorjahres-Antragssumme + Δ: rechtlich eindeutige
  // Größen — die 10.000-Euro-Höchstgrenze gem. AHP 2.3 Pkt. 2 wird
  // direkt gegen die Antragssumme geprüft, und der Vorjahres-Vergleich
  // ist die einzige Trendaussage, die sich aus der DB-Historie verläss-
  // lich rekonstruieren lässt.
  { key: "antragssumme", label: "Antragssumme", align: "right", pflicht: true, defaultVisible: true,
    tooltip: "Beantragte Fördersumme im aktuellen Haushaltsjahr (max. 10.000 € gem. AHP 2.3 Pkt. 2)" },
  { key: "vj", label: "Antragssumme Vorjahr", align: "right", defaultVisible: true,
    tooltip: "Beantragte Fördersumme im Vorjahres-Antrag desselben Trägers (aus DB rekonstruiert)" },
  { key: "diff", label: "Δ Antragssumme", align: "right", defaultVisible: true,
    tooltip: "Aktuelle Antragssumme minus Vorjahres-Antragssumme" },
  // AHP-Bemessungsgrößen aus Step 4 des Antragsformulars (alle Vorjahr).
  // Stadt-Anteil ist default sichtbar, weil er die Auszahlung direkt
  // bestimmt — Sachbearbeitende müssen ihn auf einen Blick sehen.
  // Teilnehmer und Veranstaltungen sind Gewichtungsgrößen, default off.
  { key: "stadt_anteil", label: "Stadt-Anteil", align: "right", defaultVisible: true,
    tooltip:
      "Anteil Stadtbewohner:innen Würzburg an Gesamt-Teilnehmer:innen des " +
      "Vorjahres. Bestimmt direkt den prozentualen Auszahlungsanteil " +
      "(AHP 2.3 Pkt. 2). Aus Antragsformular Step 4." },
  { key: "teilnehmer", label: "Teilnehmer:innen", align: "right", defaultVisible: false,
    tooltip:
      "Teilnehmer:innen gesamt im Vorjahr. Geht in die Gewichtung der " +
      "Zuwendung aus dem Budget ein (AHP 2.3 Pkt. 2)." },
  { key: "treffen", label: "Veranstaltungen", align: "right", defaultVisible: false,
    tooltip:
      "Durchgeführte Veranstaltungen im Vorjahr. Geht in die Gewichtung " +
      "der Zuwendung aus dem Budget ein (AHP 2.3 Pkt. 2)." },
];

/**
 * Liefert die Spaltendefinitionen mit Haushaltsjahres-spezifischen
 * Labels. Wenn `hj` gesetzt ist (Single-Year-Filter), bekommen die
 * jahresbezogenen Spalten den Jahres-Suffix in Klammern — so steht
 * „Antragssumme (2026)" und „Antragssumme (2025)" konsistent
 * nebeneinander statt einmal Wort, einmal „VJ"-Kürzel.
 *
 * Bei `hj === null` („Alle Jahre") fallen wir auf die generischen
 * Labels zurück, weil ein Jahres-Suffix dann irreführend wäre
 * (die Spalte mischt mehrere Jahre).
 */
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
      // Stadt-Anteil, Teilnehmer, Veranstaltungen beziehen sich gem.
      // AHP 2.3 Pkt. 2 auf das Vorjahr — Jahres-Suffix macht das explizit.
      // Der Bezug zum VJ ist jetzt durch das Antragsformular gedeckt
      // (Step 4 fragt 'Vorjahr'-Werte ab), daher kein Spekulations-Risiko.
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
 * Belege/Mietplan (= Bemessungsgrundlagen). Sonst zeigt die VJ-Spalte
 * die Belege der Vorjahres-Anträge statt deren Forderung — irreführend
 * und meist 0, weil die VJ-Anträge oft keine Belege/Mietplan gepflegt
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

/**
 * Kompaktes Δ-Format für die Inbox-Spalte. Bewusst knapper als die
 * AntragDetail-Anzeige, weil hier viele Zeilen nebeneinander stehen
 * und horizontaler Platz knapp ist:
 *   - keine Centbeträge ab 100 € (gerundet — Antragsförderung ist
 *     ohnehin nur in vollen Euro relevant)
 *   - Prozent ohne Nachkommastelle (gerundet)
 *   - Vorzeichen direkt am Wert (kein Leerzeichen)
 *
 * Beispiel:
 *   vorher: "+ 50.000,00 € (+666,7 %)"  → 24 Zeichen
 *   jetzt:  "+50.000 € (+667 %)"        → 18 Zeichen
 */
function formatDiff(current: number, vj: number | null): { text: string; tone: "up" | "down" | "neutral" } {
  if (vj === null) return { text: "—", tone: "neutral" };
  const diff = current - vj;
  if (Math.abs(diff) < 0.01) return { text: "± 0", tone: "neutral" };
  const sign = diff > 0 ? "+" : "−";
  const abs = Math.abs(diff);
  // Centbeträge nur bei kleinen Differenzen (< 100 €) anzeigen.
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
  // Spalten-Konfiguration: User kann via Zahnrad an/abwählen, was er
  // sehen will. Default + Preset im localStorage.
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

  // Spalten mit jahresbezogenen Labels (z.B. „Antragssumme (2026)" /
  // „Antragssumme (2025)"). Wird hier zentral berechnet und an Header,
  // SpaltenKonfig und Footer-Logik weitergegeben — damit überall
  // dasselbe Label steht.
  const spaltenMitJahr = useMemo(
    () => spaltenFuerHaushaltsjahr(effektivesHj),
    [effektivesHj],
  );
  const sichtbareSpalten = useMemo(
    () => spaltenMitJahr.filter((c) => istSichtbar(c.key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spaltenMitJahr, hiddenCols],
  );

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
    if (key === "vj") {
      const va = vjValue(a, vjMap) ?? -Infinity;
      const vb = vjValue(b, vjMap) ?? -Infinity;
      return dir === "asc" ? va - vb : vb - va;
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
    if (key === "diff") {
      // Sortiert nach Δ Antragssumme (aktuell vs. VJ-Antrag), nicht nach
      // Belege/Mietplan — die Spalte zeigt genau diese Differenz.
      const va = vjValue(a, vjMap);
      const vb = vjValue(b, vjMap);
      const da = va === null ? -Infinity : (a.geforderte_foerdersumme_euro ?? 0) - va;
      const db = vb === null ? -Infinity : (b.geforderte_foerdersumme_euro ?? 0) - vb;
      return dir === "asc" ? da - db : db - da;
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
  // Stadt-Anteil wird TEILNEHMER-GEWICHTET aggregiert (nicht arithmetisches
  // Mittel), weil AHP 2.3 ihn als „Anteil an den GESAMTEN Teilnehmer:innen"
  // definiert — ein Antrag mit 1000 Teilnehmer:innen darf nicht gleich
  // gewichtet werden wie einer mit 30. Anträge ohne Teilnehmer-Angabe
  // fließen nicht in die Aggregation ein.
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
    const stadtZaehler = new Map<string, number>(); // Σ (anteil × teilnehmer)
    const stadtNenner = new Map<string, number>();  // Σ teilnehmer
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
  // Stadt-Anteil im Footer = teilnehmer-gewichteter Durchschnitt
  // (siehe Gruppen-Aggregat — AHP 2.3 Pkt. 2)
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
  // Footer-Δ vergleicht aktuelle Antragssummen vs. VJ-Antragssummen
  // (Forderung gegen Forderung; korrekter Apfel-mit-Apfel-Vergleich)
  const gesamtDiff = formatDiff(gesamtAntragsSumme, gesamtVj.hasAny ? gesamtVj.sum : null);

  const toneClass = (tone: "up" | "down" | "neutral") =>
    tone === "up" ? "text-emerald-700" : tone === "down" ? "text-rose-700" : "text-slate-400";

  // Spalten-Gruppen für Footer/Group-Row Colspan-Berechnung:
  // 'identitaet' = alle Spalten links der Antragssumme (Antragsnummer .. Status),
  // hier kommt der Group-/Footer-Header rein. Antragssumme + die VJ-Spalten
  // bekommen jeweils eigene Zellen mit Aggregaten.
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
        <div className="absolute inset-x-0 top-0 h-[3px] bg-wue-rot" />
        <div className="w-full px-4 py-3 flex items-center justify-between gap-6">
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

      <main className="w-full px-4 py-6">
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
                      {COL_COUNT_BEFORE_GESAMT > 0 && (
                        <TableCell colSpan={COL_COUNT_BEFORE_GESAMT} className="py-3 pl-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <span className="inline-block w-[3px] h-5 bg-blue-700 rounded-sm" aria-hidden="true"></span>
                            <span className="font-semibold text-[15px] text-slate-900">{item.label}</span>
                            <span className="text-xs text-slate-500 font-normal">{item.count} {item.count === 1 ? "Antrag" : "Anträge"}</span>
                          </div>
                        </TableCell>
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
                          {/* Δ: aktuelle Antragssumme vs. VJ-Antragssumme */}
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
                      // Δ Antrag = geforderte Fördersumme aktuell − VJ-Antrag
                      // (siehe buildVjMap-Docstring — beide auf geforderte Summe,
                      // sonst Äpfel/Birnen-Vergleich)
                      const diff = formatDiff(
                        item.antrag.geforderte_foerdersumme_euro ?? 0, vj,
                      );
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
                              {formatStadtAnteil(item.antrag.stadtbewohner_anteil)}
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
                              {item.antrag.anzahl_treffen_jahr === null
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
                      // Wenn alle Identitäts-Spalten ausgeblendet sind, hängen wir
                      // das Label an die erste verfügbare Aggregat-Spalte (selten,
                      // aber sonst verlieren wir den "Gesamtsumme"-Hinweis ganz).
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
 * Zahnrad-Popover zur Sichtbarkeits-Steuerung der Tabellenspalten.
 *
 * Aufbau in zwei klar getrennten Sektionen statt einer langen Liste:
 *
 * - „Immer sichtbar" — Pflicht-Spalten (Antragsnummer, Status,
 *   Antragssumme aktuelles HJ). Als nicht-interaktive Chips mit
 *   Lock-Icon dargestellt; KEINE disabled-Checkbox, weil die im
 *   Browser-Default je nach OS so blass rendert, dass sie nach
 *   „ausgeblendet" aussieht (genau die Verwirrung wollen wir
 *   vermeiden).
 * - „Optional" — toggle-bare Spalten mit normaler Checkbox.
 *
 * Sichtbarkeit wird in localStorage persistiert (via onToggle im
 * Parent). Click-outside und Escape schließen das Popover.
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

  // Click-outside + Escape
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
          {/* Sektion 1: Pflicht-Spalten — nicht-interaktiv, mit Lock */}
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

          {/* Sektion 2: Optionale Spalten — toggle-bar */}
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

