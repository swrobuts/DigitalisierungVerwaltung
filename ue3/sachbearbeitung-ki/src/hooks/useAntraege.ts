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
  /** Beantragter Zuschuss. Wird gegen die AHP-Förderhöchstgrenze
   *  (2.3.2 Begegnungszentren: 10.000 €/Jahr) geprüft. NULL = noch
   *  nicht beziffert. */
  geforderte_foerdersumme_euro: number | null;
  /** Bemessungsgrößen gem. AHP 2.3 Förderbereich III, Pkt. 2
   * (Begegnungszentren). Die Förderung ist Pauschalzuschuss bis 10.000 €,
   * gewichtet nach Teilnehmer:innen-Anteil und Veranstaltungs-Aktivität;
   * Personal-/Miet-/Betriebskosten sind hier KEINE Bemessungsgrundlage
   * (3.8: „Belege sind nur auf Anfrage einzureichen"). Die Inbox zeigt
   * deshalb diese drei Felder statt der Aufwand-Eigenangaben. */
  anzahl_teilnehmer: number | null;
  /** Anteil Stadtbewohner:innen an Gesamt-Teilnehmer:innen des Vorjahres
   *  (0…1). Bestimmt den prozentualen Auszahlungsanteil. */
  stadtbewohner_anteil: number | null;
  anzahl_treffen_jahr: number | null;
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
          "id, antragsnummer, haushaltsjahr, name, traeger, submitted_at, status, submitted_language, geforderte_foerdersumme_euro, anzahl_teilnehmer, stadtbewohner_anteil, anzahl_treffen_jahr",
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
