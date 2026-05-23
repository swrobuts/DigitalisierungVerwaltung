import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type StatementType =
  | "hoechstgrenze"  // Förderhöchstgrenze (AHP-Begriff)
  | "frist"
  | "verbot"
  | "verpflichtung"
  | "pflichtfeld"
  | "staffel"
  | "qualitativ";

export type StatementStatus = "pending" | "kuratiert" | "verworfen";

export interface NormStatement {
  id: string;
  doctree_version: string;
  section_path: string;
  section_title: string | null;
  statement: string;
  statement_type: StatementType;
  applicable_to: Record<string, unknown>;
  maschinell_pruefbar: boolean;
  ontologie_rule_id: string | null;
  status: StatementStatus;
  extracted_by: string | null;
  extracted_at: string;
  kuratiert_von: string | null;
  kuratiert_am: string | null;
  kuratierungs_kommentar: string | null;
}

export function useNormStatements() {
  const [statements, setStatements] = useState<NormStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ahp_norm_statements")
      .select("*")
      .order("section_path")
      .order("statement_type");
    setLoading(false);
    if (error) {
      setError(error.message);
      setStatements([]);
    } else {
      setStatements((data ?? []) as NormStatement[]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Lifecycle-Übergang: pending → kuratiert oder pending → verworfen. */
  const updateStatus = useCallback(
    async (
      id: string,
      status: StatementStatus,
      kommentar?: string,
      kuratierender?: string,
    ) => {
      const { error } = await supabase
        .from("ahp_norm_statements")
        .update({
          status,
          kuratiert_von: kuratierender ?? null,
          kuratiert_am: new Date().toISOString(),
          kuratierungs_kommentar: kommentar ?? null,
        })
        .eq("id", id);
      if (error) {
        setError(error.message);
        return { error: error.message };
      }
      await reload();
      return {};
    },
    [reload],
  );

  return { statements, loading, error, reload, updateStatus };
}
