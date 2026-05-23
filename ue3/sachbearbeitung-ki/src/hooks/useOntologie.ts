import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const PRUEFUNG_SERVICE = "https://pruefung.butscher.cloud";

/** Eine Regelkatalog-Regel wie in apl2.ontologie_rules gespeichert.
 * Spiegelt 1:1 die DB-Spalten — Transparenz hängt davon ab, dass das
 * Frontend exakt das anzeigt, was die Engine prüft. */
export interface OntologieRule {
  id: string;
  plan_id: string;
  rule_name: string;
  beschreibung: string | null;
  /** JSON-Logic-Ausdruck. Wird vom Server gegen die abgeleiteten Antrag-Facts
   * evaluiert. Für die UI-Anzeige formatiert renderbar. */
  condition_jsonb: unknown;
  fehler_msg_de: string;
  schwere: "verstoss" | "hinweis";
  paragraph_ref: string | null;
  aktiv: boolean;
  created_at: string;
  /** Audit-Spalten (Migration 041) — wann/wer hat zuletzt die Aktiv-
   *  Flag verändert, mit Begründung. Sind initial null. */
  geaendert_am: string | null;
  geaendert_von: string | null;
  aenderungsgrund: string | null;
}

export function useOntologie(planId: string = "APL2"): {
  rules: OntologieRule[];
  loading: boolean;
  error: string | null;
  toggle: (id: string, aktiv: boolean, email: string, grund: string) => Promise<{ error?: string }>;
  reload: () => Promise<void>;
} {
  const [rules, setRules] = useState<OntologieRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase
      .from("ontologie_rules")
      .select("*")
      .eq("plan_id", planId)
      .order("schwere")
      .order("rule_name");
    setLoading(false);
    if (e) {
      setError(e.message);
      setRules([]);
    } else {
      setError(null);
      setRules((data ?? []) as OntologieRule[]);
    }
  }, [planId]);

  useEffect(() => { void reload(); }, [reload]);

  /** Aktiv-Flag einer Regel umschalten (Stufe-A-Edit). Läuft über
   *  pruefung-service mit Service-Role und schreibt die Audit-Spalten
   *  geaendert_am, geaendert_von, aenderungsgrund. */
  const toggle = useCallback(
    async (id: string, aktiv: boolean, email: string, grund: string) => {
      try {
        const res = await fetch(`${PRUEFUNG_SERVICE}/api/regelkatalog/${id}/toggle`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aktiv, geaendert_von: email, aenderungsgrund: grund }),
        });
        if (!res.ok) {
          const txt = await res.text();
          return { error: `${res.status}: ${txt}` };
        }
        await reload();
        return {};
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    [reload],
  );

  return { rules, loading, error, toggle, reload };
}
