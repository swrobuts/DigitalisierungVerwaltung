import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";

/**
 * Manuelle Sachbearbeitungs-Vermerke pro §-Abschnitt eines Antrags
 * (Migration 057 — Tabelle apl2.manuelle_pruefung).
 *
 * Bewusst klein gehalten: ein einziger SELECT pro Antrags-Öffnung,
 * danach pro Save ein UPSERT mit onConflict='antrag_id,paragraph'.
 * Der State wird optimistic geupdated; bei Fehler rollen wir
 * automatisch zurück und setzen einen Error-String, den der Caller
 * anzeigen kann.
 *
 * Provider liegt auf AntragDetail-Ebene, alle SektionPruefung-
 * Instanzen teilen sich denselben Cache — kein N+1-Load.
 */

export type PruefStatus = "offen" | "ok" | "fraglich" | "fehlt";

export interface PruefEintrag {
  status: PruefStatus;
  kommentar: string | null;
  geprueft_am: string | null;
  geprueft_von: string | null;
}

type PruefMap = Record<string, PruefEintrag>;

interface ManuellePruefungContextValue {
  loading: boolean;
  error: string | null;
  get: (paragraph: string) => PruefEintrag;
  save: (
    paragraph: string,
    status: PruefStatus,
    kommentar: string | null,
  ) => Promise<{ error: string | null }>;
}

const DEFAULT_ENTRY: PruefEintrag = {
  status: "offen",
  kommentar: null,
  geprueft_am: null,
  geprueft_von: null,
};

const ManuellePruefungContext =
  createContext<ManuellePruefungContextValue | null>(null);

interface RowFromDB {
  paragraph: string;
  status: PruefStatus;
  kommentar: string | null;
  geprueft_am: string | null;
  geprueft_von: string | null;
}

/**
 * Hook-Variante für Stellen, an denen man den Provider nicht braucht
 * (z.B. Tests, programmatischer Zugriff). Lädt selbst.
 */
export function useManuellePruefung(antragId: string | undefined) {
  const [map, setMap] = useState<PruefMap>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!antragId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error: dbErr } = await supabase
        .from("manuelle_pruefung")
        .select("paragraph,status,kommentar,geprueft_am,geprueft_von")
        .eq("antrag_id", antragId);
      if (cancelled) return;
      if (dbErr) {
        setError(dbErr.message);
        setMap({});
      } else {
        const next: PruefMap = {};
        for (const row of (data ?? []) as RowFromDB[]) {
          next[row.paragraph] = {
            status: row.status,
            kommentar: row.kommentar,
            geprueft_am: row.geprueft_am,
            geprueft_von: row.geprueft_von,
          };
        }
        setMap(next);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [antragId]);

  const get = useCallback(
    (paragraph: string): PruefEintrag => map[paragraph] ?? DEFAULT_ENTRY,
    [map],
  );

  const save = useCallback(
    async (
      paragraph: string,
      status: PruefStatus,
      kommentar: string | null,
    ): Promise<{ error: string | null }> => {
      if (!antragId) return { error: "Kein Antrag geladen" };
      const previous = map[paragraph];
      // Optimistic update
      const optimistic: PruefEintrag = {
        status,
        kommentar: kommentar && kommentar.trim().length > 0 ? kommentar : null,
        geprueft_am: new Date().toISOString(),
        geprueft_von: previous?.geprueft_von ?? null,
      };
      setMap((prev) => ({ ...prev, [paragraph]: optimistic }));

      const { data, error: dbErr } = await supabase
        .from("manuelle_pruefung")
        .upsert(
          {
            antrag_id: antragId,
            paragraph,
            status,
            kommentar: optimistic.kommentar,
          },
          { onConflict: "antrag_id,paragraph" },
        )
        .select("paragraph,status,kommentar,geprueft_am,geprueft_von")
        .single();

      if (dbErr) {
        // Rollback
        setMap((prev) => {
          const copy = { ...prev };
          if (previous) copy[paragraph] = previous;
          else delete copy[paragraph];
          return copy;
        });
        setError(dbErr.message);
        return { error: dbErr.message };
      }

      if (data) {
        const row = data as RowFromDB;
        setMap((prev) => ({
          ...prev,
          [paragraph]: {
            status: row.status,
            kommentar: row.kommentar,
            geprueft_am: row.geprueft_am,
            geprueft_von: row.geprueft_von,
          },
        }));
      }
      setError(null);
      return { error: null };
    },
    [antragId, map],
  );

  return { map, loading, error, get, save };
}

interface ProviderProps {
  antragId: string;
  children: ReactNode;
}

export function ManuellePruefungProvider({ antragId, children }: ProviderProps) {
  const { loading, error, get, save } = useManuellePruefung(antragId);
  const value = useMemo<ManuellePruefungContextValue>(
    () => ({ loading, error, get, save }),
    [loading, error, get, save],
  );
  return createElement(
    ManuellePruefungContext.Provider,
    { value },
    children,
  );
}

export function useManuellePruefungContext(): ManuellePruefungContextValue {
  const ctx = useContext(ManuellePruefungContext);
  if (!ctx) {
    throw new Error(
      "useManuellePruefungContext: kein <ManuellePruefungProvider> im Tree.",
    );
  }
  return ctx;
}
