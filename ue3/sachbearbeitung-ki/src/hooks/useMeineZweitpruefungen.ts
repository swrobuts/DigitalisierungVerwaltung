/**
 * Lädt die Liste der Anträge, bei denen die/der aktuell eingeloggte
 * Nutzer:in als Zweitprüfer:in zugewiesen ist und noch nicht
 * abgeschlossen hat. Wird in der Inbox als Banner/Filter angezeigt.
 */
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useSession } from "./useSession";

export interface ZuweisungEintrag {
  pruefung_id: string;
  antrag_id: string;
  antragsnummer: string;
  traeger: string;
  zugewiesen_am: string;
}

export function useMeineZweitpruefungen() {
  const { session } = useSession();
  const email = session?.user?.email ?? null;
  const [eintraege, setEintraege] = useState<ZuweisungEintrag[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!email) {
      setEintraege([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    void load();
    async function load() {
      // JOIN über die Antrags-Tabelle, um Antragsnummer + Träger
      // mitzuziehen. PostgREST embedded resource via select().
      const { data, error } = await supabase
        .from("pruefungen")
        .select("id, antrag_id, angelegt_am, antraege:antrag_id(antragsnummer, traeger)")
        .eq("rolle", "zweitpruefung")
        .eq("pruefer_typ", "mensch")
        .eq("pruefer_id", email)
        .is("abgeschlossen_am", null);
      if (cancelled) return;
      setLoading(false);
      if (error || !data) return;
      setEintraege(
        data.map((r) => {
          // PostgREST liefert embedded resource als Array (auch bei 1:1
          // FK). Wir nehmen das erste (und in der Regel einzige) Element.
          const embed = (r as { antraege?: Array<{ antragsnummer: string; traeger: string }> | { antragsnummer: string; traeger: string } }).antraege;
          const a = Array.isArray(embed) ? embed[0] : embed;
          return {
            pruefung_id: r.id as string,
            antrag_id: r.antrag_id as string,
            antragsnummer: a?.antragsnummer ?? "—",
            traeger: a?.traeger ?? "—",
            zugewiesen_am: r.angelegt_am as string,
          };
        }),
      );
    }
    return () => { cancelled = true; };
  }, [email]);

  return { eintraege, loading };
}
