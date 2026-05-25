/**
 * UE2: Magic-Link-Auth + Daten-Zugriff über @dv/data-layer.
 *
 * Wir erstellen den Supabase-Client genau einmal (Auth-Persistenz,
 * Schema `apl` aus Migration 060-067) und reichen ihn an
 * @dv/data-layer weiter, damit dort `getSupabase()` exakt dieses
 * Singleton liefert.
 */
import { createClient } from "@supabase/supabase-js";
import { setSupabaseClient } from "@dv/data-layer";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  throw new Error(
    "VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY müssen in .env stehen",
  );
}

export const supabase = createClient(URL, KEY, {
  db: { schema: "apl" },
  auth: {
    persistSession: true,
    storageKey: "amt.auth",
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// data-layer auf denselben Client umbiegen. `as never`-Cast, weil
// @supabase/supabase-js in UE2 und im @dv/data-layer-Workspace
// leicht unterschiedliche Sub-Versionen resolvet — Laufzeit identisch.
setSupabaseClient(supabase as never);

export const AUTH_REDIRECT =
  import.meta.env.VITE_AUTH_REDIRECT ??
  `${window.location.origin}/auth/callback`;
