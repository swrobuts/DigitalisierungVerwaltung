import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function AuthCallback() {
  const navigate = useNavigate();
  const [diag, setDiag] = useState("Verarbeite Magic-Link …");

  useEffect(() => {
    let done = false;

    function finish(target: string) {
      if (done) return;
      done = true;
      navigate(target, { replace: true });
    }

    // 1. Erst auf SIGNED_IN-Event hören (Hash-Parsing-Race-Condition vermeiden)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setDiag(`Auth-Event: ${event}`);
      if (session) finish("/inbox");
    });

    // 2. Direkt getSession() als Fallback (falls Session schon da war)
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setDiag(`Fehler: ${error.message}`);
      if (data.session) finish("/inbox");
    });

    // 3. Safety-Timeout 6 s: wenn nichts ankommt, zurück zu /login mit error
    const t = setTimeout(() => {
      if (!done) {
        const hash = window.location.hash;
        finish(`/login?error=callback_timeout&hash=${hash.length > 0 ? "yes" : "no"}`);
      }
    }, 6000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center text-slate-500">
        <p>{diag}</p>
        <p className="mt-2 text-xs text-slate-400">amt.butscher.cloud · Sachbearbeitung APL2</p>
      </div>
    </div>
  );
}
