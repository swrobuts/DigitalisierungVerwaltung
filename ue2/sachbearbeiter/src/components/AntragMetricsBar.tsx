/**
 * KPI-Streifen für AntragDetail — zeigt Prozess-Metriken auf einen Blick.
 *
 * Fokus: Prozess-Indikatoren, nicht Personen-Indikatoren. Keiner der Werte
 * lässt Rückschlüsse auf einzelne Sachbearbeiter:innen zu. Es geht um die
 * Frage 'läuft der Antrag gut?', nicht 'arbeitet die Person gut?'.
 *
 * Metriken:
 *  - Tage seit Einreichung
 *  - Aktive Bearbeitungszeit (Tage in 'in_pruefung'-artigen Status)
 *  - Status-Wechsel (Workflow-Komplexität)
 *  - KI-Prüfungen (Anzahl Pruefprotokoll-Einträge)
 *  - Bescheide (Anzahl — >1 bedeutet nachträgliche Korrektur)
 */
import { useEffect, useState } from "react";
import { Calendar, Clock, GitBranch, Sparkles, FileText } from "lucide-react";
import type { Antrag, AntragHistory } from "@dv/data-layer";
import { supabase } from "../lib/supabase";

interface Props {
  antrag: Antrag;
  history: AntragHistory[];
  bescheideCount: number;
}

export function AntragMetricsBar({ antrag, history, bescheideCount }: Props) {
  const [kiLaeufe, setKiLaeufe] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("pruefprotokoll")
      .select("id", { count: "exact", head: true })
      .eq("antrag_id", antrag.id)
      .then(({ count }) => {
        if (!cancelled) setKiLaeufe(count ?? 0);
      });
    return () => { cancelled = true; };
  }, [antrag.id]);

  const tageSeitEinreichung = differenzInTagen(new Date(antrag.submitted_at), new Date());
  const aktivTage = berechneAktiveBearbeitung(antrag, history);
  const statusWechsel = history.length;

  // Heuristische Färbung: was ist 'normal', was ist 'auffällig'?
  // Für Verwaltung sind 14 Tage bis Bescheid ein guter Richtwert.
  const tageEinreichungTon = tageSeitEinreichung > 30
    ? "warn" : tageSeitEinreichung > 14
    ? "info" : "neutral";
  const aktivTon = aktivTage !== null && aktivTage > 21
    ? "warn" : "neutral";
  const bescheideTon = bescheideCount > 1 ? "info" : "neutral";

  return (
    <div className="bg-white border border-slate-200 rounded-sm shadow-sm px-6 lg:px-10 py-3 mt-2">
      <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-500 font-medium mb-2">
        <span>Prozess-Metriken</span>
        <span className="text-[10px] normal-case tracking-normal text-slate-400">
          Prozess-Sicht — nicht zur Personalbewertung
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <MetricTile
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="Seit Einreichung"
          wert={`${tageSeitEinreichung}`}
          einheit={tageSeitEinreichung === 1 ? "Tag" : "Tage"}
          tone={tageEinreichungTon}
          tooltip={`Eingegangen am ${formatDate(antrag.submitted_at)}`}
        />
        <MetricTile
          icon={<Clock className="h-3.5 w-3.5" />}
          label={istEntschieden(antrag.status) ? "Durchlaufzeit" : "In Bearbeitung"}
          wert={aktivTage !== null ? `${aktivTage}` : "—"}
          einheit={aktivTage === 1 ? "Tag" : "Tage"}
          tone={aktivTon}
          tooltip={
            istEntschieden(antrag.status)
              ? "Tage von Eingang bis Entscheidung"
              : "Tage seit erstem 'In Prüfung'"
          }
        />
        <MetricTile
          icon={<GitBranch className="h-3.5 w-3.5" />}
          label="Status-Wechsel"
          wert={`${statusWechsel}`}
          einheit={statusWechsel === 1 ? "Übergang" : "Übergänge"}
          tone="neutral"
          tooltip="Anzahl der Status-Übergänge im Workflow"
        />
        <MetricTile
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="KI-Prüfungen"
          wert={kiLaeufe !== null ? `${kiLaeufe}` : "…"}
          einheit={kiLaeufe === 1 ? "Lauf" : "Läufe"}
          tone="neutral"
          tooltip="Anzahl der KI-Konformitätsprüfungen (inkl. Zweitprüfung)"
        />
        <MetricTile
          icon={<FileText className="h-3.5 w-3.5" />}
          label="Bescheide"
          wert={`${bescheideCount}`}
          einheit={bescheideCount === 1 ? "Bescheid" : "Bescheide"}
          tone={bescheideTon}
          tooltip={bescheideCount > 1
            ? "Mehrere Bescheide deuten auf nachträgliche Korrektur hin"
            : undefined}
        />
      </div>
    </div>
  );
}

type Tone = "neutral" | "info" | "warn";

const TONE_CLASSES: Record<Tone, { box: string; wert: string; label: string }> = {
  neutral: {
    box: "bg-slate-50 border-slate-200",
    wert: "text-slate-900",
    label: "text-slate-500",
  },
  info: {
    box: "bg-sky-50 border-sky-200",
    wert: "text-sky-900",
    label: "text-sky-700",
  },
  warn: {
    box: "bg-amber-50 border-amber-200",
    wert: "text-amber-900",
    label: "text-amber-700",
  },
};

function MetricTile({
  icon, label, wert, einheit, tone, tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  wert: string;
  einheit: string;
  tone: Tone;
  tooltip?: string;
}) {
  const cls = TONE_CLASSES[tone];
  return (
    <div
      className={`border rounded-sm px-3 py-1.5 ${cls.box}`}
      title={tooltip}
    >
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium ${cls.label}`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className={`text-xl font-semibold tabular-nums ${cls.wert}`}>{wert}</span>
        <span className={`text-[11px] ${cls.label}`}>{einheit}</span>
      </div>
    </div>
  );
}

// ── Berechnungs-Helfer ─────────────────────────────────────────────

function differenzInTagen(a: Date, b: Date): number {
  const ms = Math.abs(b.getTime() - a.getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function istEntschieden(status: string): boolean {
  return status === "bewilligt" || status === "abgelehnt";
}

/**
 * Aktive Bearbeitungszeit: wenn entschieden, vom Eingang bis zur Entscheidung;
 * sonst vom ersten Übergang in 'in_pruefung' bis heute. So zeigt der Wert
 * im laufenden Fall die Wartezeit, im abgeschlossenen Fall die Total-Latenz.
 */
function berechneAktiveBearbeitung(antrag: Antrag, history: AntragHistory[]): number | null {
  if (history.length === 0) return null;
  const start = new Date(antrag.submitted_at);
  if (istEntschieden(antrag.status)) {
    // Erste Entscheidung in der History suchen
    const entscheidung = history.find(
      (h) => h.nach_status === "bewilligt" || h.nach_status === "abgelehnt",
    );
    if (entscheidung) {
      return differenzInTagen(start, new Date(entscheidung.geaendert_am));
    }
  }
  return differenzInTagen(start, new Date());
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}
