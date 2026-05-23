import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Status } from "../lib/workflow";

/** Felder, die für die Inbox-Übersicht benötigt werden. Bewusst KEINE
 * Bemessungs-Detailfelder (anzahl_teilnehmer, stadtbewohner_anteil,
 * anzahl_treffen_jahr, Belege/Miete) — diese werden vom UE1-Antrags-
 * formular aktuell nicht erhoben (Migration 029 hat sie nur fürs
 * Schema vorbereitet) und/oder sind für Förderbereich III gem. AHP
 * gar keine Bemessungsgrundlage. Sie werden weiterhin im AntragDetail
 * gezeigt, wo sie als reine Antrags-Eigenschaften ihren Platz haben. */
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
          "id, antragsnummer, haushaltsjahr, name, traeger, submitted_at, status, submitted_language, geforderte_foerdersumme_euro",
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
