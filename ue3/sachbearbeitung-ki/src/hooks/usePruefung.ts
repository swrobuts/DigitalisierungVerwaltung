import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const N8N_PRUEFUNG_URL = "https://n8n.butscher.cloud/webhook/apl2-pruefung";

export interface PruefBefund {
  schwere: "verstoss" | "hinweis";
  layer: "A" | "B" | "C";
  feld?: string | null;
  beschreibung: string;
  zitat?: string | null;
  section_path?: string | null;
  paragraph_ref?: string | null;
  konfidenz?: number | null;
}

export interface PruefEmpfehlung {
  aktion: "bewilligen" | "rueckfrage" | "ablehnen";
  begruendung: string;
  heilbare_verstoesse: string[];
  nicht_heilbare_verstoesse: string[];
}

export interface PruefProtokoll {
  id: string;
  antrag_id: string;
  geprueft_am: string;
  ergebnis_jsonb: {
    befunde: PruefBefund[];
    doctree_version: string | null;
    duration_ms: number | null;
    empfehlung?: PruefEmpfehlung;
  };
  pdf_storage_path: string | null;
  duration_ms: number | null;
}

export function usePruefung(antragId: string | undefined) {
  const [latest, setLatest] = useState<PruefProtokoll | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!antragId) return;
    const { data, error } = await supabase
      .from("pruefprotokoll")
      .select("*")
      .eq("antrag_id", antragId)
      .order("geprueft_am", { ascending: false })
      .limit(1);
    if (error) setError(error.message);
    else setLatest((data?.[0] as PruefProtokoll) ?? null);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [antragId]);

  async function pruefen(geprueftVon: string) {
    if (!antragId) return;
    setRunning(true);
    setError(null);
    try {
      const r = await fetch(N8N_PRUEFUNG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ antrag_id: antragId, geprueft_von: geprueftVon }),
      });
      if (!r.ok) throw new Error(`n8n-Webhook: ${r.status} ${await r.text()}`);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function downloadPdf(): Promise<string | null> {
    if (!latest?.pdf_storage_path) return null;
    const { data } = await supabase.storage
      .from("pruefprotokolle")
      .createSignedUrl(latest.pdf_storage_path, 3600);
    return data?.signedUrl ?? null;
  }

  return { latest, running, error, pruefen, downloadPdf, reload };
}
