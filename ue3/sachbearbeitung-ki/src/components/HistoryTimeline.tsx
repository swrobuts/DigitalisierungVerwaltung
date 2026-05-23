import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, FileSearch, Scroll, Search, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { formatDateTime } from "../lib/format";
import { STATUS_LABELS, type Status } from "../lib/workflow";
import type { HistoryRow } from "../hooks/useAntrag";

/**
 * Vereinheitlichter Antrags-Verlauf: zieht Events aus DREI Quellen
 * (Status-Wechsel, KI-Prüfungen, Bescheide) und sortiert sie nach Zeit.
 *
 * UI-Features:
 *  - Volltextsuche über Headline + Actor + Detail
 *  - Filter-Pills pro Art (Status / Prüfung / Bescheid)
 *  - Sortier-Toggle (neueste / älteste zuerst)
 *  - Tages-Gruppierung mit dünner Datum-Trennlinie (immer aktiv, hilft
 *    bei langem Trace die zeitliche Struktur zu erkennen)
 */

type EventKind = "status" | "pruefung" | "bescheid";

interface VerlaufEvent {
  id: string;
  ts: string;
  kind: EventKind;
  /** Headline-Text — was ist passiert */
  headline: string;
  /** Wer hat es ausgelöst (E-Mail oder "system") */
  actor: string;
  /** Optionaler Detail-Text (Kommentar, Anzahl Befunde, …) */
  detail?: string;
}

const KIND_LABELS: Record<EventKind, string> = {
  status: "Status",
  pruefung: "Prüfung",
  bescheid: "Bescheid",
};

export function HistoryTimeline({ history }: { history: HistoryRow[] }) {
  const [extraEvents, setExtraEvents] = useState<VerlaufEvent[]>([]);
  const [search, setSearch] = useState("");
  const [activeKinds, setActiveKinds] = useState<Set<EventKind>>(
    new Set(["status", "pruefung", "bescheid"]),
  );
  const [order, setOrder] = useState<"desc" | "asc">("desc");

  // Status-Events aus history-Prop
  const statusEvents: VerlaufEvent[] = history.map((h) => ({
    id: `status-${h.id}`,
    ts: h.geaendert_am,
    kind: "status",
    headline: h.von_status
      ? `${STATUS_LABELS[h.von_status as Status]} → ${STATUS_LABELS[h.nach_status as Status]}`
      : `Eingang → ${STATUS_LABELS[h.nach_status as Status]}`,
    actor: h.geaendert_von,
    detail: h.kommentar ?? undefined,
  }));

  // Prüfungen + Bescheide lazy nachladen
  useEffect(() => {
    if (history.length === 0) return;
    void fetchExtra(history);

    async function fetchExtra(rows: HistoryRow[]) {
      const initial = await supabase
        .from("antrag_history")
        .select("antrag_id")
        .eq("id", rows[0].id)
        .single();
      const antrag_id = initial.data?.antrag_id;
      if (!antrag_id) return;

      const [pruefungen, bescheide] = await Promise.all([
        supabase
          .from("pruefprotokoll")
          .select("id,geprueft_am,geprueft_von,duration_ms,ergebnis_jsonb")
          .eq("antrag_id", antrag_id)
          .order("geprueft_am", { ascending: false }),
        supabase
          .from("bescheide")
          .select("id,entscheidung,ausgestellt_am,ausgestellt_von,bewilligte_summe_euro")
          .eq("antrag_id", antrag_id)
          .order("ausgestellt_am", { ascending: false }),
      ]);

      const events: VerlaufEvent[] = [];

      for (const p of pruefungen.data ?? []) {
        const befunde = (p.ergebnis_jsonb?.befunde ?? []) as Array<{ schwere: string }>;
        const v = befunde.filter((b) => b.schwere === "verstoss").length;
        const h = befunde.filter((b) => b.schwere === "hinweis").length;
        events.push({
          id: `pruef-${p.id}`,
          ts: p.geprueft_am,
          kind: "pruefung",
          headline: "KI-Konformitätsprüfung durchgeführt",
          actor: p.geprueft_von ?? "system",
          detail: `${v} Verstöße · ${h} Hinweise · ${p.duration_ms ?? "—"} ms`,
        });
      }

      for (const b of bescheide.data ?? []) {
        const label =
          b.entscheidung === "bewilligt" ? "Bewilligungsbescheid" :
          b.entscheidung === "abgelehnt" ? "Ablehnungsbescheid" :
          "Rückfragebescheid";
        events.push({
          id: `besch-${b.id}`,
          ts: b.ausgestellt_am,
          kind: "bescheid",
          headline: `${label} ausgestellt`,
          actor: b.ausgestellt_von ?? "system",
          detail:
            b.bewilligte_summe_euro != null
              ? `bewilligte Summe: ${Number(b.bewilligte_summe_euro).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`
              : undefined,
        });
      }
      setExtraEvents(events);
    }
  }, [history]);

  // Gesamtliste + Counts pro Art (für die Filter-Pills)
  const all: VerlaufEvent[] = useMemo(
    () => [...statusEvents, ...extraEvents],
    [statusEvents, extraEvents],
  );
  const totalByKind = useMemo(() => {
    const m: Record<EventKind, number> = { status: 0, pruefung: 0, bescheid: 0 };
    for (const e of all) m[e.kind]++;
    return m;
  }, [all]);

  // Suche + Filter + Sortierung in einem Schritt
  const visible: VerlaufEvent[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = all.filter((e) => {
      if (!activeKinds.has(e.kind)) return false;
      if (!q) return true;
      const hay = `${e.headline} ${e.actor} ${e.detail ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
    filtered.sort((a, b) =>
      order === "desc" ? b.ts.localeCompare(a.ts) : a.ts.localeCompare(b.ts),
    );
    return filtered;
  }, [all, activeKinds, search, order]);

  // Tages-Gruppierung — pro Tag eine Trennzeile vor dem ersten Event
  const grouped = useMemo(() => {
    const out: Array<{ tag: string; events: VerlaufEvent[] }> = [];
    for (const ev of visible) {
      const tag = ev.ts.slice(0, 10); // YYYY-MM-DD
      const lastGroup = out[out.length - 1];
      if (lastGroup && lastGroup.tag === tag) {
        lastGroup.events.push(ev);
      } else {
        out.push({ tag, events: [ev] });
      }
    }
    return out;
  }, [visible]);

  function toggleKind(kind: EventKind) {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  if (all.length === 0) {
    return <p className="text-slate-500 text-sm">Keine Verlauf-Einträge.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Toolbar: Suche · Filter · Sortier-Toggle */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Im Verlauf suchen …"
            className="w-full text-sm border border-slate-200 rounded pl-7 pr-7 py-1.5 focus:outline-none focus:border-wue-rot"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              title="Suche zurücksetzen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {(Object.keys(KIND_LABELS) as EventKind[]).map((k) => (
              <KindPill
                key={k}
                kind={k}
                label={KIND_LABELS[k]}
                count={totalByKind[k]}
                active={activeKinds.has(k)}
                onToggle={() => toggleKind(k)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))}
            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded px-2 py-1"
            title={order === "desc" ? "Älteste zuerst zeigen" : "Neueste zuerst zeigen"}
          >
            {order === "desc" ? (
              <><ArrowDown className="h-3 w-3" /> Neueste zuerst</>
            ) : (
              <><ArrowUp className="h-3 w-3" /> Älteste zuerst</>
            )}
          </button>
        </div>
        {visible.length !== all.length && (
          <p className="text-[11px] text-slate-500">
            Zeige {visible.length} von {all.length} Einträgen
          </p>
        )}
      </div>

      {/* Gruppierte Timeline */}
      {visible.length === 0 ? (
        <p className="text-xs text-slate-500 italic">
          Kein Eintrag passt zu Suche/Filter.
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.tag}>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1.5">
                {formatTag(g.tag)}
              </div>
              <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
                {g.events.map((ev) => (
                  <li key={ev.id} className="relative">
                    <span
                      className={
                        "absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full flex items-center justify-center " +
                        (ev.kind === "status"
                          ? "bg-slate-700"
                          : ev.kind === "pruefung"
                            ? "bg-slate-400 ring-2 ring-amber-100"
                            : "bg-wue-rot")
                      }
                      aria-hidden="true"
                    />
                    <p className="text-sm flex items-center gap-1.5">
                      {ev.kind === "status" ? (
                        <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                      ) : ev.kind === "pruefung" ? (
                        <FileSearch className="h-3.5 w-3.5 text-amber-700" />
                      ) : (
                        <Scroll className="h-3.5 w-3.5 text-wue-rot" />
                      )}
                      <span className="font-medium">
                        <Highlight text={ev.headline} needle={search} />
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(ev.ts)} ·{" "}
                      <Highlight text={ev.actor} needle={search} />
                    </p>
                    {ev.detail && (
                      <p className="text-xs text-slate-700 mt-1 italic">
                        <Highlight text={ev.detail} needle={search} />
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KindPill({
  kind, label, count, active, onToggle,
}: {
  kind: EventKind;
  label: string;
  count: number;
  active: boolean;
  onToggle: () => void;
}) {
  // Farben pro Art passend zum Punkt in der Timeline
  const palette: Record<EventKind, { on: string; off: string }> = {
    status: {
      on: "bg-slate-800 text-white border-slate-800",
      off: "text-slate-700 border-slate-300 hover:bg-slate-100",
    },
    pruefung: {
      on: "bg-amber-600 text-white border-amber-600",
      off: "text-amber-800 border-amber-300 hover:bg-amber-50",
    },
    bescheid: {
      on: "bg-wue-rot text-white border-wue-rot",
      off: "text-wue-rot border-wue-rot/30 hover:bg-wue-rot-soft",
    },
  };
  const cls = active ? palette[kind].on : palette[kind].off;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={count === 0}
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border tabular-nums disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
      title={active ? `${label} ausblenden` : `${label} einblenden`}
    >
      <span>{label}</span>
      <span className="text-[10px] opacity-70">{count}</span>
    </button>
  );
}

/** Hebt im Text die Suchstelle hervor. */
function Highlight({ text, needle }: { text: string; needle: string }) {
  const n = needle.trim();
  if (!n) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(n.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-slate-900 rounded px-0.5">
        {text.slice(idx, idx + n.length)}
      </mark>
      {text.slice(idx + n.length)}
    </>
  );
}

function formatTag(yyyymmdd: string): string {
  const d = new Date(yyyymmdd + "T00:00:00");
  const heute = new Date();
  const gestern = new Date();
  gestern.setDate(heute.getDate() - 1);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
  if (isSameDay(d, heute)) return "Heute";
  if (isSameDay(d, gestern)) return "Gestern";
  return d.toLocaleDateString("de-DE", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}
