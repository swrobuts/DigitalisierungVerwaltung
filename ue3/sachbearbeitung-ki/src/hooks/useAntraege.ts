import { useEffect, useState } from "react";
import { listAntraege, type AntragInbox, type FoerderbereichId } from "@dv/data-layer";

/**
 * Inbox-Hook: liest View `apl.antrag_inbox` über @dv/data-layer.
 * Optional FB-Filter; das Frontend filtert weiter (Suche, Status etc).
 */
export function useAntraege(opts: { foerderbereich?: FoerderbereichId } = {}): {
  antraege: AntragInbox[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [antraege, setAntraege] = useState<AntragInbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Watchdog: wenn Supabase/PostgREST überlastet ist, hängt der Request
  // 30-60s ohne Lebenszeichen. Wir setzen einen weichen 12-s-Watchdog —
  // läuft der ab, zeigt die UI eine konkrete Fehlermeldung statt
  // unsichtbar ewig zu spinnern. Der eigentliche Request läuft im
  // Hintergrund weiter (kein abort, weil supabase-js .from() kein
  // sauberes AbortSignal-Interface bietet) und wird beim Erfolg
  // immer noch angewandt — der User hat dann die Wahl, manuell
  // neu zu laden.
  async function load() {
    setLoading(true);
    const t0 = performance.now();
    const watchdog = window.setTimeout(() => {
      setError(
        "Daten laden dauert ungewöhnlich lange (>12 s). " +
        "Vermutlich ist Supabase / PostgREST gerade überlastet. " +
        "Versuche es gleich noch einmal — falls das wiederholt auftritt, " +
        "auf der VPS bitte `docker ps` und `docker logs supabase-rest` prüfen.",
      );
      setLoading(false);
    }, 12000);
    try {
      const data = await listAntraege(opts);
      window.clearTimeout(watchdog);
      // eslint-disable-next-line no-console
      console.info(
        `[useAntraege] ${data.length} Anträge in ${Math.round(performance.now() - t0)} ms geladen`,
      );
      setAntraege(data);
      setError(null);
    } catch (e) {
      window.clearTimeout(watchdog);
      // eslint-disable-next-line no-console
      console.error("[useAntraege] load failed:", e);
      setError((e as Error).message || String(e));
    } finally {
      window.clearTimeout(watchdog);
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.foerderbereich]);

  return { antraege, loading, error, reload: load };
}
