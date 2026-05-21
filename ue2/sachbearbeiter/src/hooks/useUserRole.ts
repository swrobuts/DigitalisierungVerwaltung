import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useSession } from "./useSession";

/**
 * Rolle des aktuellen Users (aus apl2.allow_email).
 *
 * Drei-States-Modell verhindert eine Race-Condition zwischen "Session
 * fertig geladen" und "Rolle fertig gefetched":
 *   - rolle === undefined → noch in Klärung (loading=true)
 *   - rolle === null      → kein Allowlist-Match (allowed=false)
 *   - rolle === string    → erlaubt (allowed=true)
 *
 * Frühere Variante mit zwei States (loading + rolle) hatte einen Render-
 * Frame, in dem session bereits da war (sessionLoading=false), die
 * allow_email-Query aber noch lief (local loading war true) → kombiniertes
 * loading ergab false → AuthGuard navigierte zu /login, BEVOR die Rolle
 * fertig war. Symptom: Magic-Link-Wiederanmeldung "zuckt nur" und
 * landet auf Login zurück.
 */
export function useUserRole(): {
  rolle: string | null;
  loading: boolean;
  allowed: boolean;
} {
  const { session, loading: sessionLoading } = useSession();
  const [rolle, setRolle] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    // Warten bis Session-Status geklärt ist
    if (sessionLoading) return;
    // Keine Session → klare Antwort: kein Allowlist-Match
    if (!session?.user?.email) {
      setRolle(null);
      return;
    }
    // Session da → allow_email-Lookup
    // Wichtig: rolle erstmal auf undefined zurücksetzen, falls session
    // gewechselt hat (z.B. Logout → Login-with-different-email).
    setRolle(undefined);
    let cancelled = false;
    supabase
      .from("allow_email")
      .select("rolle")
      .eq("email", session.user.email)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setRolle((data?.rolle as string | undefined) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionLoading, session?.user?.email]);

  return {
    rolle: rolle ?? null,
    loading: sessionLoading || rolle === undefined,
    allowed: typeof rolle === "string",
  };
}
