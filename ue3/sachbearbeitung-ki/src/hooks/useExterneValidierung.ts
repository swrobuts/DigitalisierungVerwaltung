import { useCallback, useState } from "react";

const PRUEFUNG_SERVICE = "https://pruefung.butscher.cloud";

/**
 * Response-Schema POST /api/antrag/{id}/validiere-extern.
 *
 * Backend liefert pro Validierungsdimension (Adresse, Träger, Einrichtung
 * etc.) einen Befund mit eigenen Quellen + Konfidenz. Halluzinations-
 * Schutz: `parse_fehler=true` bedeutet, dass Perplexity etwas
 * zurückgeliefert hat, das wir nicht sicher parsen konnten — UI muss
 * das als „nicht verlässlich" kennzeichnen.
 */
export type ExterneValidierungBefundArt =
  | "neutral"
  | "kritisch"
  | "fehler"
  | "info";

export interface ExterneValidierungBefund {
  name: string;
  titel: string;
  art: ExterneValidierungBefundArt;
  konfidenz: number;
  kommentar: string;
  quellen: string[];
  details?: Record<string, unknown>;
  parse_fehler?: boolean;
}

export interface ExterneValidierungSummary {
  kritisch: number;
  neutral: number;
  fehler: number;
}

export interface ExterneValidierungErgebnis {
  befunde: ExterneValidierungBefund[];
  summary: ExterneValidierungSummary;
  geprueft_am: string; // wird vom Hook gesetzt, Backend liefert es (noch) nicht
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
      const raw = await res.json();
      // Defensive: Backend könnte Felder weglassen — wir reichern nichts
      // an, was die KI nicht geliefert hat, aber fallen sauber zurück,
      // damit das UI nicht crasht.
      setData({
        befunde: Array.isArray(raw?.befunde) ? raw.befunde : [],
        summary: {
          kritisch: Number(raw?.summary?.kritisch ?? 0),
          neutral: Number(raw?.summary?.neutral ?? 0),
          fehler: Number(raw?.summary?.fehler ?? 0),
        },
        geprueft_am: new Date().toISOString(),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [antragId]);

  return { data, running, error, validieren };
}
