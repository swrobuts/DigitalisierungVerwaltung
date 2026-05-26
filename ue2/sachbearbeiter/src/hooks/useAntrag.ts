import { useCallback, useEffect, useState } from "react";
import {
  getAntragBundle,
  changeStatus as dlChangeStatus,
  type Antrag,
  type Anlage,
  type AntragHistory,
  type FbIProjekt,
  type FbIiEhrenamt,
  type FbIiiVarianteRow,
  type FbIvFreitext,
  type FbIiHelfer,
  type StatusEnum,
} from "@dv/data-layer";

export interface AntragBundle {
  antrag: Antrag;
  anlagen: Anlage[];
  history: AntragHistory[];
  fb_i?: FbIProjekt | null;
  fb_ii?: FbIiEhrenamt | null;
  fb_ii_helfer?: FbIiHelfer[];
  fb_iii?: FbIiiVarianteRow | null;
  fb_iv?: FbIvFreitext | null;
}

/**
 * Lädt einen kompletten Antrag inklusive FB-Detail-Tabellen, Anlagen
 * und History in EINEM PostgREST-Call (Embed via FK).
 *
 * Vorher: 3 sequenzielle Wellen (getAntrag → [anlagen, history] →
 * fb_detail) ≈ 1.8s. Jetzt: 1 Call ≈ 600ms.
 */
export function useAntrag(id: string | undefined) {
  const [bundle, setBundle] = useState<AntragBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const row = await getAntragBundle(id);
      if (!row) {
        setError(`Antrag ${id} nicht gefunden`);
        setBundle(null);
        return;
      }
      const {
        fb_i_projekt,
        fb_ii_ehrenamt,
        fb_ii_helfer,
        fb_iii_variante,
        fb_iv_freitext,
        anlagen,
        antrag_history,
        ...antrag
      } = row;

      const next: AntragBundle = {
        antrag: antrag as Antrag,
        anlagen,
        history: antrag_history,
      };
      switch (antrag.foerderbereich) {
        case "I":
          next.fb_i = fb_i_projekt;
          break;
        case "II":
          next.fb_ii = fb_ii_ehrenamt;
          next.fb_ii_helfer = fb_ii_helfer;
          break;
        case "III":
          next.fb_iii = fb_iii_variante;
          break;
        case "IV":
          next.fb_iv = fb_iv_freitext;
          break;
      }
      setBundle(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function changeStatus(
    nach: StatusEnum,
    kommentar?: string,
  ): Promise<{ error: string | null }> {
    if (!bundle) return { error: "Kein Antrag geladen" };
    try {
      await dlChangeStatus(bundle.antrag.id, nach, kommentar);
      await reload();
      return { error: null };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  return { bundle, loading, error, reload, changeStatus };
}
