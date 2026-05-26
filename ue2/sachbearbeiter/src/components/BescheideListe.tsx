/**
 * Gruppier- und sortierbare Bescheide-Liste für AntragDetail.
 *
 * Default: gruppiert nach Entscheidung, sortiert nach Datum DESC.
 * Sachbearbeiter kann beide Achsen umschalten — State ist component-lokal
 * (Liste hat selten >20 Einträge, URL-Persistenz lohnt nicht).
 */
import { useMemo, useState } from "react";
import { ChevronDown, FileText, Trash2, FilePlus2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { formatEuro, formatDateTime } from "../lib/format";
import type { BescheidRow } from "../hooks/useBescheide";

/** Entscheidungen, die per Hand-Trigger erzeugbar sind. */
export type ManuelleEntscheidung = "bewilligen" | "ablehnen" | "rueckfrage";

type Gruppieren = "keine" | "entscheidung" | "bearbeitende" | "monat";
type Sortieren = "datum_desc" | "datum_asc" | "summe_desc" | "entscheidung";

const GRUPPEN_LABELS: Record<Gruppieren, string> = {
  keine: "(keine)",
  entscheidung: "Entscheidung",
  bearbeitende: "Bearbeitende:r",
  monat: "Monat",
};

const SORTIER_LABELS: Record<Sortieren, string> = {
  datum_desc: "Datum ↓",
  datum_asc: "Datum ↑",
  summe_desc: "Summe ↓",
  entscheidung: "Entscheidung",
};

const ENTSCHEIDUNGS_LABELS: Record<string, { text: string; color: string }> = {
  bewilligt:  { text: "Bewilligt",  color: "text-emerald-700" },
  abgelehnt:  { text: "Abgelehnt",  color: "text-rose-700" },
  rueckfrage: { text: "Rückfrage",  color: "text-amber-700" },
};

interface Props {
  bescheide: BescheidRow[];
  onOpen: (b: BescheidRow) => void;
  onOpenDocx: (b: BescheidRow) => void;
  onDelete: (b: BescheidRow) => void;
  /** Optionaler Fehler aus dem letzten Lösch- oder Erstell-Versuch.
   *  Erscheint als rote Fehler-Box am Anfang der Card. */
  error?: string | null;
  /** Optional: aktiviert den eingebauten „Bescheid manuell erstellen"-Block.
   *  UE2 (manuelle Sachbearbeitung) übergibt das, UE3 nicht — dort kommt der
   *  Bescheid aus dem KI-Empfehlungs-Flow. Backend-Pfad ist identisch
   *  (POST /api/bescheid → Halluzinations-Validator läuft in beiden Fällen). */
  onCreateManual?: (entscheidung: ManuelleEntscheidung) => Promise<void>;
  creatingManual?: boolean;
}

export function BescheideListe({
  bescheide, onOpen, onOpenDocx, onDelete, error,
  onCreateManual, creatingManual,
}: Props) {
  const [gruppieren, setGruppieren] = useState<Gruppieren>("entscheidung");
  const [sortieren, setSortieren] = useState<Sortieren>("datum_desc");

  const gruppen = useMemo(
    () => baueGruppen(bescheide, gruppieren, sortieren),
    [bescheide, gruppieren, sortieren],
  );

  // Bei leerer Liste OHNE Manuell-Trigger: nichts rendern (UE3-Verhalten).
  // MIT Trigger: trotzdem Card zeigen, sonst gibt es keinen Anfasspunkt für
  // die manuelle Erstellung — UE2-Hauptaktion wäre unsichtbar.
  if (bescheide.length === 0 && !onCreateManual) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle>
            Bescheide
            <span className="ml-1.5 text-sm font-normal text-slate-500 tabular-nums">
              ({bescheide.length})
            </span>
          </CardTitle>
          {bescheide.length > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <SelectDropdown
                label="Gruppieren"
                value={gruppieren}
                options={GRUPPEN_LABELS}
                onChange={(v) => setGruppieren(v as Gruppieren)}
              />
              <SelectDropdown
                label="Sortieren"
                value={sortieren}
                options={SORTIER_LABELS}
                onChange={(v) => setSortieren(v as Sortieren)}
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="text-xs bg-rose-50 border border-rose-300 text-rose-800 px-2 py-1.5 rounded">
            <strong>Fehler:</strong> {error}
          </div>
        )}
        {onCreateManual && (
          <ManuellerBescheidBlock
            onCreate={onCreateManual}
            busy={!!creatingManual}
            existieren={bescheide.length > 0}
          />
        )}
        {gruppen.map((g) => (
          <BescheideGruppe
            key={g.key}
            titel={g.titel}
            bescheide={g.bescheide}
            summe={g.summe}
            showHeader={gruppieren !== "keine"}
            onOpen={onOpen}
            onOpenDocx={onOpenDocx}
            onDelete={onDelete}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function BescheideGruppe({
  titel, bescheide, summe, showHeader, onOpen, onOpenDocx, onDelete,
}: {
  titel: string;
  bescheide: BescheidRow[];
  summe: number;
  showHeader: boolean;
  onOpen: (b: BescheidRow) => void;
  onOpenDocx: (b: BescheidRow) => void;
  onDelete: (b: BescheidRow) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className={showHeader ? "border-l-2 border-slate-200 pl-2" : ""}>
      {showHeader && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 py-1 text-left group"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <ChevronDown
              className={
                "h-3.5 w-3.5 text-slate-400 transition-transform " +
                (open ? "" : "-rotate-90")
              }
            />
            {titel}
            <span className="text-xs font-normal text-slate-500">({bescheide.length})</span>
          </span>
          {summe > 0 && (
            <span className="text-xs text-slate-500 tabular-nums">
              Σ {formatEuro(summe)}
            </span>
          )}
        </button>
      )}
      {open && (
        <div className="space-y-1.5 mt-1">
          {bescheide.map((b) => (
            <BescheidZeile
              key={b.id}
              bescheid={b}
              onOpen={() => onOpen(b)}
              onOpenDocx={() => onOpenDocx(b)}
              onDelete={() => onDelete(b)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BescheidZeile({
  bescheid: b, onOpen, onOpenDocx, onDelete,
}: {
  bescheid: BescheidRow;
  onOpen: () => void;
  onOpenDocx: () => void;
  onDelete: () => void;
}) {
  const entscheidung = ENTSCHEIDUNGS_LABELS[b.entscheidung];
  return (
    <div className="border border-slate-200 rounded p-2 hover:border-slate-300 transition-colors">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-sm font-semibold ${entscheidung?.color ?? "text-slate-700"}`}>
            {entscheidung?.text ?? b.entscheidung}
          </span>
          {b.bewilligte_summe_euro && (
            <span className="text-xs text-slate-600 tabular-nums">
              {formatEuro(b.bewilligte_summe_euro)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
            {formatDateTime(b.ausgestellt_am)}
          </span>
          <button
            type="button"
            onClick={onDelete}
            className="text-slate-400 hover:text-rose-600 transition-colors"
            title="Bescheid löschen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {b.doctree_version && (
        <p className="text-[10px] text-slate-400 mb-1.5 font-mono">
          AHP-Stand {b.doctree_version}
        </p>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={onOpen}
          disabled={!b.pdf_storage_path}
          className="text-xs justify-center gap-1.5"
        >
          <FileText className="h-3.5 w-3.5" />
          PDF
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onOpenDocx}
          className="text-xs justify-center gap-1.5"
        >
          <FileText className="h-3.5 w-3.5" />
          DOCX
        </Button>
      </div>
    </div>
  );
}

function SelectDropdown({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1 text-slate-600">
      <span className="text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-wue-rot bg-white"
      >
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
    </label>
  );
}

interface Gruppe {
  key: string;
  titel: string;
  bescheide: BescheidRow[];
  summe: number;
}

function baueGruppen(
  bescheide: BescheidRow[],
  gruppieren: Gruppieren,
  sortieren: Sortieren,
): Gruppe[] {
  const sortiert = [...bescheide].sort(vergleich(sortieren));
  if (gruppieren === "keine") {
    return [{
      key: "all",
      titel: "Alle",
      bescheide: sortiert,
      summe: sortiert.reduce((s, b) => s + (b.bewilligte_summe_euro ?? 0), 0),
    }];
  }
  const map = new Map<string, BescheidRow[]>();
  for (const b of sortiert) {
    const key = gruppenSchluessel(b, gruppieren);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }
  // Stabile Gruppen-Reihenfolge: Entscheidung in [bewilligt, abgelehnt, rueckfrage],
  // sonst alphabetisch
  const keys = Array.from(map.keys());
  if (gruppieren === "entscheidung") {
    const order = ["bewilligt", "abgelehnt", "rueckfrage"];
    keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  } else if (gruppieren === "monat") {
    keys.sort().reverse(); // neuestes Jahr/Monat zuerst
  } else {
    keys.sort();
  }
  return keys.map((k) => {
    const items = map.get(k)!;
    return {
      key: k,
      titel: gruppenTitel(k, gruppieren),
      bescheide: items,
      summe: items.reduce((s, b) => s + (b.bewilligte_summe_euro ?? 0), 0),
    };
  });
}

function gruppenSchluessel(b: BescheidRow, g: Gruppieren): string {
  if (g === "entscheidung") return b.entscheidung;
  if (g === "bearbeitende") return b.ausgestellt_von ?? "(unbekannt)";
  if (g === "monat") {
    const d = new Date(b.ausgestellt_am);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return "all";
}

function gruppenTitel(key: string, g: Gruppieren): string {
  if (g === "entscheidung") return ENTSCHEIDUNGS_LABELS[key]?.text ?? key;
  if (g === "monat") {
    const [year, month] = key.split("-");
    return `${["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][+month - 1]} ${year}`;
  }
  return key;
}

/**
 * Manueller Trigger-Block für UE2.
 *
 * Drei Buttons → POST /api/bescheid (im Backend identisch zum KI-Flow,
 * inkl. Halluzinations-Validator `validiere_oder_abbrechen`). Der Block
 * ist immer sichtbar wenn `onCreateManual` gesetzt ist — auch wenn schon
 * Bescheide existieren (Korrektur-Bescheid bleibt möglich).
 */
function ManuellerBescheidBlock({
  onCreate, busy, existieren,
}: {
  onCreate: (e: ManuelleEntscheidung) => Promise<void>;
  busy: boolean;
  existieren: boolean;
}) {
  return (
    <div className="border border-slate-200 rounded p-3 space-y-2 bg-slate-50/50">
      <p className="text-sm font-medium flex items-center gap-1.5">
        <FilePlus2 className="h-3.5 w-3.5 text-slate-500" />
        Bescheid manuell erstellen
        {existieren && (
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-normal">
            (Korrektur)
          </span>
        )}
      </p>
      <p className="text-xs text-slate-500 leading-relaxed">
        Entscheidung wählen — der Bescheid wird im Hintergrund als PDF gerendert.
        Halluzinations-Schutz greift identisch zum KI-Flow (zitierte §§ werden
        gegen <code>apl.ahp_norm_statements</code> validiert).
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => void onCreate("bewilligen")}
        >
          ✓ Bewilligen
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void onCreate("rueckfrage")}
        >
          ↩ Rückfrage
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void onCreate("ablehnen")}
        >
          ✖ Ablehnen
        </Button>
      </div>
      {busy && (
        <p className="text-xs text-slate-500">Bescheid wird erstellt …</p>
      )}
    </div>
  );
}

function vergleich(s: Sortieren): (a: BescheidRow, b: BescheidRow) => number {
  if (s === "datum_desc") return (a, b) => +new Date(b.ausgestellt_am) - +new Date(a.ausgestellt_am);
  if (s === "datum_asc")  return (a, b) => +new Date(a.ausgestellt_am) - +new Date(b.ausgestellt_am);
  if (s === "summe_desc") return (a, b) => (b.bewilligte_summe_euro ?? 0) - (a.bewilligte_summe_euro ?? 0);
  // entscheidung: bewilligt → abgelehnt → rueckfrage, dann nach Datum DESC
  const ord = ["bewilligt", "abgelehnt", "rueckfrage"];
  return (a, b) => {
    const d = ord.indexOf(a.entscheidung) - ord.indexOf(b.entscheidung);
    return d !== 0 ? d : +new Date(b.ausgestellt_am) - +new Date(a.ausgestellt_am);
  };
}
