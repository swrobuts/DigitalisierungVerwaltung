import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// `any` als Schema-Generic — die Wrapper-Funktionen typisieren ihre
// Rückgabewerte selbst (db-types.ts), das hier reicht für den Singleton.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: SupabaseClient<any, any, any> | null = null;

export interface SupabaseConfig {
  url?: string;
  key?: string;
  schema?: string;
}

/**
 * Singleton-Wrapper um den Supabase-Client.
 *
 * - Default-Schema: `apl` (alle aktuellen Migrationen 060-067).
 *   Overridebar via `config.schema` für Tests + Edge Functions, die ggf.
 *   gegen andere Schemas (z.B. `public`, `storage`) arbeiten.
 * - Credential-Quellen (in dieser Priorität):
 *     1. explizit übergeben (`config.url` / `config.key`)
 *     2. Vite-Env (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`)
 *     3. Node-Env  (`SUPABASE_URL` / `SUPABASE_ANON_KEY`)
 *
 * `import.meta.env` existiert nur unter Vite — in Node-Kontexten (Tests,
 * Edge Functions) ist der Zugriff geschützt durch try/catch.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabase(config: SupabaseConfig = {}): SupabaseClient<any, any, any> {
  if (_client) return _client;

  let viteEnv: Record<string, string | undefined> = {};
  try {
    viteEnv =
      (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  } catch {
    // im Node-Kontext (Tests, Edge Functions): import.meta.env nicht verfügbar
  }

  const url    = config.url    ?? viteEnv.VITE_SUPABASE_URL      ?? process.env.SUPABASE_URL;
  const key    = config.key    ?? viteEnv.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  const schema = config.schema ?? "apl";

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL + SUPABASE_ANON_KEY müssen gesetzt sein " +
        "(entweder VITE_-Vars oder process.env)",
    );
  }

  // Cast nötig, weil das Schema-Generic auf Compile-Zeit fix ist und wir
  // hier dynamisch overriden — die Wrapper-Funktionen typisieren selbst.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _client = createClient(url, key, { db: { schema } }) as SupabaseClient<any, any, any>;
  return _client;
}

/** Reset für Tests, damit Konfig zwischen Suites nicht leakt. */
export function resetSupabaseClient(): void {
  _client = null;
}
