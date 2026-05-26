import { useCallback, useEffect, useState } from "react";

const PRUEFUNG_SERVICE = "https://pruefung.butscher.cloud";

/** Eine konkrete Änderung zwischen Vorjahres- und aktuellem Antrag. */
export interface VorjahresAenderung {
  feld: string;
  label: string;
  art: "numerisch" | "strukturell";
  format?: "euro" | "int" | "pct";
  alt: unknown;
  neu: unknown;
  pct_veraenderung?: number | null;
  schwere: "kritisch" | "auffaellig" | "unauffaellig";
  /** Optional: konkrete rechtliche/finanzielle Konsequenz, wenn die
   *  Änderung über die reine Heuristik hinausgeht (z.B. Anteil drückt
   *  Auszahlung unter geforderte Summe). */
  konsequenz?: string;
}

/** Response-Form von pruefung-service GET /api/antrag/{id}/vergleich-vorjahr.
 *  `vorjahr=null` bedeutet: kein passender Antrag desselben Trägers im
 *  Haushaltsjahr davor gefunden (Erstantrag oder Trägername abweichend). */
export interface VorjahresVergleichErgebnis {
  vorjahr: { id: string; haushaltsjahr: number; traeger: string } | null;
  aktuell_hj?: number;
  gesucht_hj?: number;
  aenderungen: VorjahresAenderung[];
  anzahl_kritisch?: number;
  anzahl_auffaellig?: number;
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
