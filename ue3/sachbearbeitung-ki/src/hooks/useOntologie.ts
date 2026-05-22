import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/** Eine Ontologie-Regel wie in apl2.ontologie_rules gespeichert.
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
}

export function useOntologie(planId: string = "APL2"): {
  rules: OntologieRule[];
  loading: boolean;
  error: string | null;
} {
  const [rules, setRules] = useState<OntologieRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("ontologie_rules")
      .select("*")
      .eq("plan_id", planId)
      .order("schwere")
      .order("rule_name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setRules([]);
        } else {
          setRules((data ?? []) as OntologieRule[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  return { rules, loading, error };
}
