import { useCallback, useEffect, useState } from "react";
import {
  getAntrag,
  changeStatus as dlChangeStatus,
  listAnlagen,
  listHistory,
  listHelfer,
  getFbIProjekt,
  getFbIiEhrenamt,
  getFbIiiVariante,
  getFbIvFreitext,
  type Antrag,
  type Anlage,
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
  history: Array<Awaited<ReturnType<typeof listHistory>>[number]>;
  fb_i?: FbIProjekt | null;
  fb_ii?: FbIiEhrenamt | null;
  fb_ii_helfer?: FbIiHelfer[];
  fb_iii?: FbIiiVarianteRow | null;
  fb_iv?: FbIvFreitext | null;
}

/**
 * Lädt einen kompletten Antrag inklusive FB-spezifischer 1:1-Detail-
 * Tabelle (Dispatcher auf `antrag.foerderbereich`). Helferliste nur
 * für FB II — andere FBs sparen sich den Round-Trip.
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
      const antrag = await getAntrag(id);
      if (!antrag) {
        setError(`Antrag ${id} nicht gefunden`);
        setBundle(null);
        return;
      }
      const [anlagen, history] = await Promise.all([
        listAnlagen(id),
        listHistory(id),
      ]);
      const next: AntragBundle = { antrag, anlagen, history };
      switch (antrag.foerderbereich) {
        case "I":
          next.fb_i = await getFbIProjekt(id);
          break;
        case "II":
          next.fb_ii = await getFbIiEhrenamt(id);
          next.fb_ii_helfer = await listHelfer(id);
          break;
        case "III":
          next.fb_iii = await getFbIiiVariante(id);
          break;
        case "IV":
          next.fb_iv = await getFbIvFreitext(id);
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
