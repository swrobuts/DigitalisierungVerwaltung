/**
 * Liest die Liste der bisher im System auftauchenden Sachbearbeiter:innen
 * (DISTINCT geaendert_von aus antrag_history). Wird für die Zweitprüfer-
 * Auswahl als Vorschlagsliste genutzt — der User kann aber auch eine
 * beliebige Email tippen.
 *
 * Quick-Fix für Demo: keine echte User-Tabelle. In Production sollte das
 * aus auth.users oder einer mandanten-spezifischen sachbearbeiter-Tabelle
 * kommen.
 */
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useBekannteBearbeiter(): { emails: string[]; loading: boolean } {
  const [emails, setEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void load();
    async function load() {
      // Wir holen die jüngsten 500 antrag_history-Zeilen und extrahieren
      // distinct Werte. Reicht für Demo; bei echtem Volume würde man das
      // server-seitig aggregieren (View oder RPC).
      const { data, error } = await supabase
        .from("antrag_history")
        .select("geaendert_von")
        .order("geaendert_am", { ascending: false })
        .limit(500);
      if (cancelled) return;
      setLoading(false);
      if (error || !data) return;
      const unique = Array.from(new Set(
        data
          .map((d) => d.geaendert_von as string | null)
          .filter((v): v is string => !!v && v.includes("@")),
      )).sort();
      setEmails(unique);
    }
    return () => { cancelled = true; };
  }, []);

  return { emails, loading };
}
