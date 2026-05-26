import { useCallback, useState } from "react";

const PRUEFUNG_SERVICE = "https://pruefung.butscher.cloud";

export interface ExterneValidierungErgebnis {
  recherche_summary: string;
  gefundene_quellen: Array<{ url: string; titel: string; relevanz: string }>;
  warnungen: string[];
  geprueft_am: string;
}

export function useExterneValidierung(antragId: string | undefined) {
  const [data, setData] = useState<ExterneValidierungErgebnis | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validieren = useCallback(async () => {
    if (!antragId) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(
        `${PRUEFUNG_SERVICE}/api/antrag/${antragId}/validiere-extern`,
        { method: "POST" },
      );
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [antragId]);

  return { data, running, error, validieren };
}
