import { useCallback, useEffect, useState } from "react";

const PRUEFUNG_SERVICE = "https://pruefung.butscher.cloud";

export interface VorjahresVergleichErgebnis {
  hat_vorjahr: boolean;
  vorjahr_antragsnummer?: string;
  vorjahr_bewilligt_euro?: number;
  vorjahr_entscheidung?: string;
  delta_bewilligung_pct?: number;
  abweichende_felder?: Array<{ feld: string; vorjahr: unknown; jetzt: unknown }>;
}

export function useVergleichVorjahr(antragId: string | undefined) {
  const [data, setData] = useState<VorjahresVergleichErgebnis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!antragId) return;
    setLoading(true);
    try {
      const res = await fetch(`${PRUEFUNG_SERVICE}/api/antrag/${antragId}/vergleich-vorjahr`);
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [antragId]);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, reload: load };
}
