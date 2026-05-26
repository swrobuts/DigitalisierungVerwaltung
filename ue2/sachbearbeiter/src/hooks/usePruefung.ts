/**
 * UE2-Stub für usePruefung — KI-Konformitätsprüfung gibt es in UE2 nicht.
 *
 * Existiert nur, weil ZweitpruefungsCard (1:1 aus UE3 gespiegelt) den Hook
 * importiert. Bei `withKi={false}` benötigt die Card die Werte nicht — der
 * Stub liefert konsistent `latest: null`. Typen sind identisch zu UE3, damit
 * spätere Konsolidierung in ein shared package trivial bleibt.
 *
 * KEINE echte Pruefprotokoll-Logik in UE2 — wer KI-Konformitätsprüfung will,
 * geht über UE3 (sachbearbeitung-ki).
 */

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
    llm_usage?: {
      total_input_tokens: number;
      total_output_tokens: number;
      cost_usd: number;
    };
  };
}

/** Stub — liefert immer `latest: null`. UE2 hat keine KI-Konformitätsprüfung. */
export function usePruefung(_antragId: string | undefined) {
  return {
    latest: null as PruefprotokollRow | null,
    loading: false,
    running: false,
    error: null as string | null,
    pruefen: async () => ({ error: "Keine KI-Prüfung in UE2" }),
    downloadPdf: async () => null as string | null,
    reload: async () => {},
  };
}
