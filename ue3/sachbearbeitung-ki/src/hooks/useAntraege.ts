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

  async function load() {
    setLoading(true);
    try {
      const data = await listAntraege(opts);
      setAntraege(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.foerderbereich]);

  return { antraege, loading, error, reload: load };
}
