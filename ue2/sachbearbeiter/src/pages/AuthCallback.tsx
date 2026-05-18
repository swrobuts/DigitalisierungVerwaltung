import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/inbox", { replace: true });
      else navigate("/login?error=auth_failed", { replace: true });
    });
  }, [navigate]);

  return <div className="p-8 text-slate-500">Logge ein …</div>;
}
