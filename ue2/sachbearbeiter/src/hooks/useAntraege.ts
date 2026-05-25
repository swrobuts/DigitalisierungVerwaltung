import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Status } from "../lib/workflow";

/** UE2-Antrag-Zeile für die Inbox.
 *
 * Datenmodell synchron zu UE3 gehalten, weil beide Systeme auf demselben
 * UE1-Antragsformular aufsetzen — die Sachbearbeitenden sollen in beiden
 * Inboxen denselben Daten-Horizont sehen, auch wenn UE2 keine KI-Features
 * hat. Was UE2 NICHT braucht (Risiko-Score, Zweitprüfungs-Banner, …)
 * bleibt aus dem Hook draußen.
 */
export interface AntragRow {
  id: string;
  antragsnummer: string;
  haushaltsjahr: number;
  name: string;
  traeger: string;
  submitted_at: string;
  status: Status;
  submitted_language: string;
  /** Beantragter Zuschuss (max. 10.000 € gem. AHP 2.3 Pkt. 2). NULL =
   *  noch nicht beziffert. */
  geforderte_foerdersumme_euro: number | null;
  /** AHP-Bemessungsgrößen (Vorjahr) — werden vom UE1-Formular Step 4
   *  abgefragt. NULL = noch nicht eingegeben. */
  anzahl_teilnehmer: number | null;
  /** 0…1 — Auszahlungs-Anteilsfaktor (Würzburger Stadtbewohner). */
  stadtbewohner_anteil: number | null;
  anzahl_treffen_jahr: number | null;
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
          "id, antragsnummer, haushaltsjahr, name, traeger, submitted_at, status, submitted_language, geforderte_foerdersumme_euro, anzahl_teilnehmer, stadtbewohner_anteil, anzahl_treffen_jahr, entschieden_am, entscheidungs_typ, durchlaufzeit_tage",
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
