/**
 * InboxTable — die Antrags-Tabelle der Inbox mit:
 *  • Spalten-Sortierung (Klick auf Header)
 *  • Gruppierung (Keine / Förderbereich / Status)
 *  • Spalten-Konfig (Zahnrad → Checkbox-Popover)
 * Einstellungen werden in localStorage persistiert, damit der
 * Sachbearbeiter seine Vorlieben über Sessions hinweg behält.
 *
 * Identische Komponente in UE2 (sachbearbeiter) und UE3 (sachbearbeitung-ki) —
 * gibt sonst nichts Plattform-Spezifisches.
 */
import { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronUp, ChevronDown, Settings2 } from "lucide-react";
import { prefetchAntragBundle } from "@dv/data-layer";
import type { AntragInbox } from "@dv/data-layer";
import { StatusBadge } from "./StatusBadge";
import { FbBadge } from "./FbBadge";
import {
  formatDate,
  formatEuro,
  formatDurchlaufzeit,
  durchlaufzeitAmpel,
  type DurchlaufzeitAmpel,
} from "../lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

const AMPEL_BG: Record<DurchlaufzeitAmpel, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-slate-400",
};

type ColId =
  | "foerderbereich"
  | "antragsnummer"
  | "einrichtung"
  | "submitted_at"
  | "status"
  | "durchlaufzeit_tage"
  | "antragssumme";

const COL_LABELS: Record<ColId, string> = {
  foerderbereich: "Förderbereich",
  antragsnummer: "Antragsnummer",
  einrichtung: "Einrichtung",
  submitted_at: "Eingang",
  status: "Status",
  durchlaufzeit_tage: "Durchlaufzeit",
  antragssumme: "Antragssumme",
};

const ALL_COLS: ColId[] = [
  "foerderbereich",
  "antragsnummer",
  "einrichtung",
  "submitted_at",
  "status",
  "durchlaufzeit_tage",
  "antragssumme",
];

type GroupBy = "keine" | "foerderbereich" | "status";
const GROUP_LABELS: Record<GroupBy, string> = {
  keine: "Keine",
  foerderbereich: "Förderbereich",
  status: "Status",
};

type SortDir = "asc" | "desc";

function antragssummeText(a: AntragInbox): { text: string; numeric: number | null } {
  switch (a.foerderbereich) {
    case "I":
      return a.fb_i_gesamtkosten_euro != null
        ? { text: formatEuro(a.fb_i_gesamtkosten_euro), numeric: a.fb_i_gesamtkosten_euro }
        : { text: "—", numeric: null };
    case "II":
      return { text: "Pauschale", numeric: null };
    case "III":
      if (a.fb_iii_c_betrag_euro != null) {
        return {
          text: formatEuro(a.fb_iii_c_betrag_euro),
          numeric: a.fb_iii_c_betrag_euro,
        };
      }
      return {
        text: a.fb_iii_variante ? `Variante ${a.fb_iii_variante}` : "—",
        numeric: null,
      };
    case "IV":
      return a.fb_iv_beantragte_summe_euro != null
        ? {
            text: formatEuro(a.fb_iv_beantragte_summe_euro),
            numeric: a.fb_iv_beantragte_summe_euro,
          }
        : { text: "—", numeric: null };
  }
}

/** Vergleicher für eine Spalte. */
function cmp(a: AntragInbox, b: AntragInbox, col: ColId): number {
  switch (col) {
    case "foerderbereich":
      return a.foerderbereich.localeCompare(b.foerderbereich);
    case "antragsnummer":
      return (a.antragsnummer ?? "").localeCompare(b.antragsnummer ?? "");
    case "einrichtung":
      return a.einrichtung.localeCompare(b.einrichtung);
    case "submitted_at":
      return a.submitted_at.localeCompare(b.submitted_at);
    case "status":
      return a.status.localeCompare(b.status);
    case "durchlaufzeit_tage":
      return (a.durchlaufzeit_tage ?? 0) - (b.durchlaufzeit_tage ?? 0);
    case "antragssumme": {
      const na = antragssummeText(a).numeric ?? -1;
      const nb = antragssummeText(b).numeric ?? -1;
      return na - nb;
    }
  }
}

/** localStorage helper — gefährdet kein Render wenn Browser keinen Storage hat. */
function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

const STORAGE_NS = "inbox.v1.";

export function InboxTable({ antraege }: { antraege: AntragInbox[] }) {
  const [sortCol, setSortCol] = useState<ColId>(
    () => loadJson(STORAGE_NS + "sortCol", "submitted_at" as ColId),
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    () => loadJson(STORAGE_NS + "sortDir", "desc" as SortDir),
  );
  const [groupBy, setGroupBy] = useState<GroupBy>(
    () => loadJson(STORAGE_NS + "groupBy", "keine" as GroupBy),
  );
  const [visibleCols, setVisibleCols] = useState<Set<ColId>>(() => {
    const saved = loadJson<ColId[] | null>(STORAGE_NS + "visibleCols", null);
    return new Set(saved ?? ALL_COLS);
  });
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveJson(STORAGE_NS + "sortCol", sortCol), [sortCol]);
  useEffect(() => saveJson(STORAGE_NS + "sortDir", sortDir), [sortDir]);
  useEffect(() => saveJson(STORAGE_NS + "groupBy", groupBy), [groupBy]);
  useEffect(
    () => saveJson(STORAGE_NS + "visibleCols", Array.from(visibleCols)),
    [visibleCols],
  );

  // Click-outside-Handler für das Spalten-Menü
  useEffect(() => {
    if (!colMenuOpen) return;
    function handler(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [colMenuOpen]);

  function toggleSort(col: ColId) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  function toggleCol(col: ColId) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      // Mindestens 1 Spalte sichtbar
      if (next.size === 0) next.add(col);
      return next;
    });
  }

  const sorted = useMemo(() => {
    const arr = [...antraege];
    arr.sort((a, b) => {
      const c = cmp(a, b, sortCol);
      return sortDir === "asc" ? c : -c;
    });
    return arr;
  }, [antraege, sortCol, sortDir]);

  const groups = useMemo(() => {
    if (groupBy === "keine") return [{ key: "all", titel: null, items: sorted }];
    const map = new Map<string, AntragInbox[]>();
    for (const a of sorted) {
      const key = groupBy === "foerderbereich" ? a.foerderbereich : a.status;
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      titel: groupBy === "foerderbereich" ? `Förderbereich ${key}` : statusLabel(key),
      items,
    }));
  }, [sorted, groupBy]);

  return (
    <div className="bg-white border border-slate-200 rounded">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50/50">
        <label className="inline-flex items-center gap-1 text-xs text-slate-600">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">
            Gruppieren
          </span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-wue-rot"
          >
            {Object.entries(GROUP_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>

        <div className="relative" ref={colMenuRef}>
          <button
            type="button"
            onClick={() => setColMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded px-2 py-1 bg-white"
            aria-expanded={colMenuOpen}
            aria-label="Spalten konfigurieren"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Spalten
          </button>
          {colMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-md shadow-lg p-2 min-w-[180px]">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 px-1.5 pb-1.5">
                Sichtbare Spalten
              </div>
              {ALL_COLS.map((col) => (
                <label
                  key={col}
                  className="flex items-center gap-2 px-1.5 py-1 hover:bg-slate-50 rounded cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={visibleCols.has(col)}
                    onChange={() => toggleCol(col)}
                    className="rounded border-slate-300"
                  />
                  <span>{COL_LABELS[col]}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabelle */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {ALL_COLS.filter((c) => visibleCols.has(c)).map((col) => (
                <SortableHead
                  key={col}
                  label={COL_LABELS[col]}
                  active={sortCol === col}
                  dir={sortDir}
                  onClick={() => toggleSort(col)}
                  alignRight={col === "antragssumme"}
                />
              ))}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <GroupRows
                key={g.key}
                titel={g.titel}
                items={g.items}
                visibleCols={visibleCols}
                colSpan={visibleCols.size + 1}
              />
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={visibleCols.size + 1}
                  className="text-center text-slate-500 py-8"
                >
                  Keine Anträge gefunden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SortableHead({
  label,
  active,
  dir,
  onClick,
  alignRight,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  alignRight?: boolean;
}) {
  return (
    <TableHead className={alignRight ? "text-right" : ""}>
      <button
        type="button"
        onClick={onClick}
        className={
          "inline-flex items-center gap-1 hover:text-slate-900 " +
          (active ? "text-slate-900" : "text-slate-600")
        }
      >
        {label}
        {active && (dir === "asc"
          ? <ChevronUp className="h-3 w-3" />
          : <ChevronDown className="h-3 w-3" />)}
      </button>
    </TableHead>
  );
}

function GroupRows({
  titel,
  items,
  visibleCols,
  colSpan,
}: {
  titel: string | null;
  items: AntragInbox[];
  visibleCols: Set<ColId>;
  colSpan: number;
}) {
  return (
    <>
      {titel && (
        <TableRow className="bg-slate-100 hover:bg-slate-100">
          <TableCell
            colSpan={colSpan}
            className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 py-1.5"
          >
            {titel}
            <span className="ml-2 text-slate-400 font-normal tabular-nums">
              ({items.length})
            </span>
          </TableCell>
        </TableRow>
      )}
      {items.map((a) => (
        <AntragRow key={a.id} a={a} visibleCols={visibleCols} />
      ))}
    </>
  );
}

function AntragRow({
  a,
  visibleCols,
}: {
  a: AntragInbox;
  visibleCols: Set<ColId>;
}) {
  const summe = antragssummeText(a);
  const entschieden = a.entscheidungs_typ !== null;
  const ampel = durchlaufzeitAmpel(a.durchlaufzeit_tage, entschieden);
  const prefetch = () => prefetchAntragBundle(a.id);
  return (
    <TableRow
      className="hover:bg-blue-50/30"
      onMouseEnter={prefetch}
      onFocus={prefetch}
    >
      {visibleCols.has("foerderbereich") && (
        <TableCell><FbBadge fb={a.foerderbereich} /></TableCell>
      )}
      {visibleCols.has("antragsnummer") && (
        <TableCell className="font-mono text-xs text-slate-500 whitespace-nowrap">
          {a.antragsnummer ?? "—"}
        </TableCell>
      )}
      {visibleCols.has("einrichtung") && (
        <TableCell>
          <div className="text-sm text-slate-900">{a.einrichtung}</div>
          {a.dachverband && (
            <div className="text-xs text-slate-500">{a.dachverband}</div>
          )}
        </TableCell>
      )}
      {visibleCols.has("submitted_at") && (
        <TableCell className="text-xs text-slate-500 whitespace-nowrap">
          {formatDate(a.submitted_at)}
        </TableCell>
      )}
      {visibleCols.has("status") && (
        <TableCell><StatusBadge status={a.status} /></TableCell>
      )}
      {visibleCols.has("durchlaufzeit_tage") && (
        <TableCell className="whitespace-nowrap text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${AMPEL_BG[ampel]}`}
              aria-hidden="true"
            />
            {formatDurchlaufzeit(a.durchlaufzeit_tage, entschieden)}
          </span>
        </TableCell>
      )}
      {visibleCols.has("antragssumme") && (
        <TableCell className="text-right tabular-nums text-sm">
          {summe.numeric != null ? (
            <span className="font-medium text-slate-900">{summe.text}</span>
          ) : (
            <span className="text-slate-500 italic">{summe.text}</span>
          )}
        </TableCell>
      )}
      <TableCell className="whitespace-nowrap pr-4">
        <Link
          to={`/antrag/${a.id}`}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-1.5"
        >
          Öffnen →
        </Link>
      </TableCell>
    </TableRow>
  );
}

function statusLabel(s: string): string {
  // Direkter Mapping — UE2/UE3 haben STATUS_LABELS in lib/workflow,
  // aber wir wollen InboxTable schmal halten und Plattform-frei.
  const map: Record<string, string> = {
    eingegangen: "Eingegangen",
    in_pruefung: "In Prüfung",
    rueckfrage: "Rückfrage",
    bewilligt: "Bewilligt",
    abgelehnt: "Abgelehnt",
  };
  return map[s] ?? s;
}
