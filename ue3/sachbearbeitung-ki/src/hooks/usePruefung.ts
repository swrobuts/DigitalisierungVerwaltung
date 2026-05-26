/**
 * Konformitäts-Prüfung für EINEN Antrag.
 *
 * - `latest`: letztes apl.pruefprotokoll für diesen Antrag (oder null).
 * - `pruefen(email)`: triggert POST /api/pruefen → schreibt neues pruefprotokoll.
 * - `downloadPdf()`: liefert signed URL für das Protokoll-PDF aus Storage.
 *
 * Unterschied zu usePruefungen (PLURAL): das ist die Vier-Augen-Bewertung,
 * usePruefung (SINGULAR) ist die KI-Konformitäts-Prüfung selbst.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const PRUEFUNG_SERVICE = "https://pruefung.butscher.cloud";

export interface PruefBefund {
  schwere: "verstoss" | "hinweis";
  layer: "A" | "B" | "C";
  feld?: string;
  beschreibung: string;
  zitat?: string;
  section_path?: string;
  paragraph_ref?: string;
  konfidenz?: number;
}

export interface PruefEmpfehlung {
  aktion: "bewilligen" | "rueckfrage" | "ablehnen";
  begruendung: string;
  nicht_heilbare_verstoesse: string[];
  heilbare_verstoesse: string[];
}

export interface PruefprotokollRow {
  id: string;
  antrag_id: string;
  geprueft_am: string;
  geprueft_von: string | null;
  doctree_version: string | null;
  duration_ms: number | null;
  pdf_storage_path: string | null;
  ergebnis_jsonb: {
    befunde: PruefBefund[];
    empfehlung?: PruefEmpfehlung;
    doctree_version?: string;
    llm_usage?: { total_input_tokens: number; total_output_tokens: number; cost_usd: number };
  };
}

export function usePruefung(antragId: string | undefined) {
  const [latest, setLatest] = useState<PruefprotokollRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!antragId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("pruefprotokoll")
      .select("*")
      .eq("antrag_id", antragId)
      .order("geprueft_am", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLoading(false);
    if (error) setError(error.message);
    else setLatest(data as PruefprotokollRow | null);
  }, [antragId]);

  useEffect(() => { void reload(); }, [reload]);

  const pruefen = useCallback(
    async (geprueft_von: string) => {
      if (!antragId) return { error: "Kein Antrag" };
      setRunning(true);
      setError(null);
      try {
        const res = await fetch(`${PRUEFUNG_SERVICE}/api/pruefen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ antrag_id: antragId, geprueft_von }),
        });
        if (!res.ok) {
          const txt = await res.text();
          setError(`Prüfung fehlgeschlagen: ${res.status} ${txt}`);
          return { error: txt };
        }
        const result = await res.json();
        await reload();
        return { result };
      } finally {
        setRunning(false);
      }
    },
    [antragId, reload],
  );

  const downloadPdf = useCallback(async (): Promise<string | null> => {
    if (!latest?.pdf_storage_path) return null;
    const { data, error } = await supabase.storage
      .from("pruefprotokolle")
      .createSignedUrl(latest.pdf_storage_path, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }, [latest]);

  return { latest, loading, running, error, pruefen, downloadPdf, reload };
}
