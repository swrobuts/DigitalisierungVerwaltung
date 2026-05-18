import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Status } from "../lib/workflow";

export interface AntragFull {
  id: string;
  antragsnummer: string;
  haushaltsjahr: number;
  name: string;
  traeger: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  bankverbindung: string;
  iban: string;
  bic: string | null;
  ansprechpartner: string;
  telefon: string;
  email: string;
  betriebskosten_vorjahr_euro: number;
  personalkosten_vorjahr_euro: number;
  raeume_vorhanden: "ja" | "nein";
  raeume_unentgeltlich: "ja" | "nein";
  monatliche_miete_euro: number;
  antragsdatum: string;
  submitted_language: string;
  submitted_at: string;
  user_agent: string | null;
  ip_address: string | null;
  status: Status;
}

export interface AnlageRow {
  id: string;
  typ: string;
  dateiname: string;
  groesse_bytes: number;
  mime_type: string;
  storage_path: string;
  uploaded_at: string;
}

export interface HistoryRow {
  id: string;
  von_status: Status | null;
  nach_status: Status;
  geaendert_von: string;
  geaendert_am: string;
  kommentar: string | null;
}

export function useAntrag(id: string | undefined) {
  const [antrag, setAntrag] = useState<AntragFull | null>(null);
  const [anlagen, setAnlagen] = useState<AnlageRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!id) return;
    setLoading(true);
    const [a, an, h] = await Promise.all([
      supabase.from("antraege").select("*").eq("id", id).single(),
      supabase.from("anlagen").select("*").eq("antrag_id", id).order("uploaded_at"),
      supabase
        .from("antrag_history")
        .select("*")
        .eq("antrag_id", id)
        .order("geaendert_am", { ascending: false }),
    ]);
    if (a.error) setError(a.error.message);
    else setAntrag(a.data as AntragFull);
    setAnlagen(((an.data as AnlageRow[]) ?? []));
    setHistory(((h.data as HistoryRow[]) ?? []));
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function changeStatus(
    neuerStatus: Status,
    kommentar: string,
  ): Promise<{ error: string | null }> {
    if (!antrag) return { error: "Kein Antrag geladen" };
    const { error } = await supabase
      .from("antraege")
      .update({ status: neuerStatus })
      .eq("id", antrag.id);
    if (error) return { error: error.message };

    if (kommentar.trim().length > 0) {
      const latest = await supabase
        .from("antrag_history")
        .select("id")
        .eq("antrag_id", antrag.id)
        .eq("nach_status", neuerStatus)
        .order("geaendert_am", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest.data?.id) {
        await supabase
          .from("antrag_history")
          .update({ kommentar })
          .eq("id", latest.data.id);
      }
    }
    await reload();
    return { error: null };
  }

  return { antrag, anlagen, history, loading, error, changeStatus, reload };
}
