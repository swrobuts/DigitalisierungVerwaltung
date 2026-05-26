/**
 * UE3: identisch zu UE2 — Magic-Link-Auth + @dv/data-layer-Singleton,
 * Schema `apl`.
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
    // Self-hosted GoTrue default ist Implicit-Flow (Magic-Link-Redirect
    // liefert #access_token=... im URL-Fragment). supabase-js default ist
    // PKCE und würde ?code=... erwarten → Mismatch → callback_timeout.
    flowType: "implicit",
    persistSession: true,
    storageKey: "amt.auth",
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

setSupabaseClient(supabase as never);

// Auth-Redirect IMMER aus der aktuellen Browser-Origin ableiten.
// Hardcoding via VITE_AUTH_REDIRECT führt zu Cross-Domain-Bug:
// Wer auf ki.butscher.cloud einloggt, würde sonst auf amt-ki.butscher.cloud
// landen — anderer Origin, anderer localStorage, Session unerreichbar.
// Die App ist auf mehreren Hostnames erreichbar (amt-ki + ki) — Origin
// ist die einzig korrekte Quelle.
export const AUTH_REDIRECT = `${window.location.origin}/auth/callback`;
