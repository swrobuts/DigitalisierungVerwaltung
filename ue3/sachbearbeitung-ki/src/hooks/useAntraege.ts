import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Status } from "../lib/workflow";

/** Felder für die Inbox-Übersicht.
 *
 * Bewusst NICHT enthalten: Aufwand/Belege/Miete (betriebskosten_*,
 * personalkosten_*, miete_jahr_euro) — für Förderbereich III gem.
 * AHP 2.3 keine Bemessungsgrundlage. Sie werden weiterhin im
 * AntragDetail gezeigt, wo sie als reine Antrags-Eigenschaften
 * ihren Platz haben. */
export interface AntragRow {
  id: string;
  antragsnummer: string;
  haushaltsjahr: number;
  name: string;
  traeger: string;
  submitted_at: string;
  status: Status;
  submitted_language: string;
  /** Beantragter Zuschuss. Wird gegen die AHP-Förderhöchstgrenze
   *  (2.3.2 Begegnungszentren: 10.000 €/Jahr) geprüft. NULL = noch
   *  nicht beziffert. */
  geforderte_foerdersumme_euro: number | null;
  /** Migration 029 — Förderbereich-Klassifikation. */
  foerderbereich:
    | "aufbau_niedrigschwellige_angebote"
    | "buergerschaftliches_engagement"
    | "mehrgenerationenhaeuser"
    | "begegnungszentren"
    | "bildungstraeger"
    | "seniorenkreise"
    | "quartiersmanagement_altenarbeit"
    | "struktur_schwerpunktfoerderung"
    | null;
  /** Migration 058: Durchlaufzeit aus apl2.antrag_history.
   *  entschieden_am: erster Statuswechsel zu bewilligt/abgelehnt; NULL solange offen.
   *  entscheidungs_typ: 'bewilligt' | 'abgelehnt' | NULL (= offen).
   *  durchlaufzeit_tage: ganze Tage zwischen submitted_at und entschieden_am
   *    (bei offenen Antraegen zwischen submitted_at und now()). */
  entschieden_am: string | null;
  entscheidungs_typ: "bewilligt" | "abgelehnt" | null;
  durchlaufzeit_tage: number;
}

export function useAntraege(): {
  antraege: AntragRow[];
  loading: boolean;
  error: string | null;
} {
  const [antraege, setAntraege] = useState<AntragRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data, error } = await supabase
        .from("antrag_mit_summen")
        .select(
          "id, antragsnummer, haushaltsjahr, name, traeger, submitted_at, status, submitted_language, geforderte_foerdersumme_euro, foerderbereich, entschieden_am, entscheidungs_typ, durchlaufzeit_tage",
        )
        .order("submitted_at", { ascending: false });
      if (!mounted) return;
      if (error) setError(error.message);
      else setAntraege((data ?? []) as AntragRow[]);
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel("antraege-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "apl2", table: "antraege" },
        () => {
          load();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { antraege, loading, error };
}
