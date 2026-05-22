import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  throw new Error(
    "VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY müssen in .env stehen",
  );
}

export const supabase = createClient(URL, KEY, {
  db: { schema: "apl2" },
  auth: {
    persistSession: true,
    storageKey: "amt.auth",
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const AUTH_REDIRECT =
  import.meta.env.VITE_AUTH_REDIRECT ??
  `${window.location.origin}/auth/callback`;
