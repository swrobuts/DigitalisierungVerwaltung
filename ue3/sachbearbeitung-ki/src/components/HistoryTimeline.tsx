import { useEffect, useState } from "react";
import { ArrowRight, FileSearch, Scroll } from "lucide-react";
import { supabase } from "../lib/supabase";
import { formatDateTime } from "../lib/format";
import { STATUS_LABELS, type Status } from "../lib/workflow";
import type { HistoryRow } from "../hooks/useAntrag";

/**
 * Vereinheitlichter Antrags-Verlauf: zieht Events aus DREI Quellen
 * (Status-Wechsel, KI-Prüfungen, Bescheide) und sortiert sie nach Zeit.
 * Sachbearbeiter sieht damit lückenlos was am Antrag passiert ist.
 */

interface VerlaufEvent {
  id: string;
  ts: string;
  kind: "status" | "pruefung" | "bescheid";
  /** Headline-Text — was ist passiert */
  headline: string;
  /** Wer hat es ausgelöst (E-Mail oder "system") */
  actor: string;
  /** Optionaler Detail-Text (Kommentar, Anzahl Befunde, …) */
  detail?: string;
}

export function HistoryTimeline({ history }: { history: HistoryRow[] }) {
  const [extraEvents, setExtraEvents] = useState<VerlaufEvent[]>([]);

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
    const antragId = history[0]?.id; // dummy; eigentliche Antrag-ID aus history-Eintrag ableiten
    // Wir brauchen die antrag_id — sie steckt nicht in HistoryRow,
    // also aus history (von_status null = Initial-Eintrag mit antrag_id).
    // Workaround: wir extrahieren über erste Query.
    void fetchExtra(history);

    async function fetchExtra(rows: HistoryRow[]) {
      // antrag_id ist NICHT in HistoryRow — wir müssen sie aus dem URL holen
      // oder aus den Rows. Da history ohne antrag_id kommt, ziehen wir aus der
      // ersten Status-Row via API:
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

  const all: VerlaufEvent[] = [...statusEvents, ...extraEvents].sort(
    (a, b) => b.ts.localeCompare(a.ts),
  );

  if (all.length === 0) {
    return <p className="text-slate-500 text-sm">Keine Verlauf-Einträge.</p>;
  }

  return (
    <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
      {all.map((ev) => (
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
            <span className="font-medium">{ev.headline}</span>
          </p>
          <p className="text-xs text-slate-500">
            {formatDateTime(ev.ts)} · {ev.actor}
          </p>
          {ev.detail && (
            <p className="text-xs text-slate-700 mt-1 italic">{ev.detail}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
