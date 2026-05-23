import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/** Eintrag aus apl2.bescheide. */
export interface BescheidRow {
  id: string;
  antrag_id: string;
  entscheidung: "bewilligt" | "abgelehnt" | "rueckfrage";
  bewilligte_summe_euro: number | null;
  bearbeiter_kommentar: string | null;
  ausgestellt_von: string | null;
  ausgestellt_am: string;
  pdf_storage_path: string | null;
  doctree_version: string | null;
}

/**
 * Lädt alle Bescheide eines Antrags + bietet Funktionen zum Erstellen
 * eines neuen Bescheids (über pruefung-service).
 */
export function useBescheide(antragId: string | undefined) {
  const [bescheide, setBescheide] = useState<BescheidRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    if (!antragId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("bescheide")
      .select("*")
      .eq("antrag_id", antragId)
      .order("ausgestellt_am", { ascending: false });
    setLoading(false);
    if (error) setError(error.message);
    else setBescheide((data ?? []) as BescheidRow[]);
  }, [antragId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Ruft pruefung-service POST /api/bescheid auf. Erwartet, dass das
   * letzte Prüfprotokoll existiert (sonst leere Begründung). */
  const erstelleBescheid = useCallback(
    async (params: {
      entscheidung: "bewilligt" | "abgelehnt" | "rueckfrage";
      bewilligte_summe_euro?: number | null;
      bearbeiter_kommentar?: string | null;
      ausgestellt_von?: string | null;
    }) => {
      if (!antragId) return { error: "Kein Antrag" };
      setCreating(true);
      setError(null);
      try {
        const res = await fetch("https://pruefung.butscher.cloud/api/bescheid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            antrag_id: antragId,
            entscheidung: params.entscheidung,
            bewilligte_summe_euro: params.bewilligte_summe_euro ?? null,
            bearbeiter_kommentar: params.bearbeiter_kommentar ?? null,
            ausgestellt_von: params.ausgestellt_von ?? null,
          }),
        });
        if (!res.ok) {
          const txt = await res.text();
          setError(`Bescheid-Erstellung fehlgeschlagen: ${res.status} ${txt}`);
          return { error: txt };
        }
        const result = await res.json();
        await reload();
        return { result };
      } finally {
        setCreating(false);
      }
    },
    [antragId, reload],
  );

  /** Holt eine kurzlebige Signed-URL für das Bescheid-PDF aus dem Storage. */
  const downloadBescheidPdf = useCallback(async (path: string) => {
    const { data, error } = await supabase.storage
      .from("bescheide")
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      setError(`Download fehlgeschlagen: ${error?.message ?? "kein Link"}`);
      return null;
    }
    return data.signedUrl;
  }, []);

  /** DOCX-Variante zum editierbaren Weiterverarbeiten — wird on-demand
   * vom pruefung-service gerendert. */
  const downloadBescheidDocx = useCallback(
    async (bescheidId: string) => {
      const res = await fetch(
        `https://pruefung.butscher.cloud/api/bescheid/${bescheidId}/docx`,
        { method: "GET" },
      );
      if (!res.ok) {
        setError(`DOCX-Download fehlgeschlagen: ${res.status}`);
        return null;
      }
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
    [],
  );

  /** Bescheid löschen — entfernt DB-Eintrag (CASCADE löscht Storage-Object
   * NICHT automatisch, also separat). Nur zulässig, wenn der Bescheid noch
   * nicht verschickt wurde (in unserem Demo: jederzeit). */
  const loeschBescheid = useCallback(
    async (id: string, pdfStoragePath: string | null) => {
      if (pdfStoragePath) {
        await supabase.storage.from("bescheide").remove([pdfStoragePath]);
      }
      const { error } = await supabase.from("bescheide").delete().eq("id", id);
      if (error) {
        setError(`Löschen fehlgeschlagen: ${error.message}`);
        return { error: error.message };
      }
      await reload();
      return {};
    },
    [reload],
  );

  return {
    bescheide, loading, error, creating,
    erstelleBescheid, downloadBescheidPdf, downloadBescheidDocx,
    loeschBescheid, reload,
  };
}
