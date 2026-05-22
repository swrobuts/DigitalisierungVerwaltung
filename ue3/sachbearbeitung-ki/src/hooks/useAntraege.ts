import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Status } from "../lib/workflow";

export interface AntragRow {
  id: string;
  antragsnummer: string;
  haushaltsjahr: number;
  name: string;
  traeger: string;
  submitted_at: string;
  status: Status;
  submitted_language: string;
  betriebskosten_vorjahr_euro: number;
  personalkosten_vorjahr_euro: number;
  miete_jahr_euro: number;
  /** Beantragter Zuschuss (kann von Vorjahres-Aufwand abweichen). NULL =
   * noch nicht beziffert. */
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
          "id, antragsnummer, haushaltsjahr, name, traeger, submitted_at, status, submitted_language, betriebskosten_vorjahr_euro, personalkosten_vorjahr_euro, miete_jahr_euro, geforderte_foerdersumme_euro",
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
