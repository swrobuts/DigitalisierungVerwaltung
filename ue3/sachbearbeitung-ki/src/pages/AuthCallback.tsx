import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

/**
 * Magic-Link-Callback mit echter Diagnose statt blindem Timeout.
 *
 * Frühere Variante: 6-s-Timeout → silent redirect /login?error=callback_timeout.
 * Wenn man den Fehler nicht sieht, kann man ihn auch nicht fixen — daher
 * zeigen wir jetzt im UI selbst, was bei jedem Schritt passiert ist:
 *   - Hash-Fragment vorhanden?
 *   - Tokens parsbar?
 *   - setSession() erfolgreich?
 *   - getUser() erfolgreich? (das war historisch der 504-Punkt)
 *   - allow_email-Lookup? (würde sonst direkt wieder zu /login werfen)
 *
 * Bei Erfolg leiten wir nach kurzer Bestätigung weiter — bei Fehler
 * bleibt die Seite stehen mit copy-paste-fertiger Diagnose.
 */
export function AuthCallback() {
  const navigate = useNavigate();
  const [steps, setSteps] = useState<Array<{ ok: boolean | null; text: string; detail?: string }>>([
    { ok: null, text: "Magic-Link wird verarbeitet …" },
  ]);
  const [done, setDone] = useState<"success" | "error" | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return; // StrictMode double-invoke schützen
    ranRef.current = true;

    function add(ok: boolean | null, text: string, detail?: string) {
      setSteps((s) => [...s, { ok, text, detail }]);
    }
    function replaceLast(ok: boolean | null, text: string, detail?: string) {
      setSteps((s) => [...s.slice(0, -1), { ok, text, detail }]);
    }

    (async () => {
      // 1. Hash-Fragment analysieren
      const hash = window.location.hash || "";
      const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const hashError = hashParams.get("error_description") || hashParams.get("error");

      if (hashError) {
        replaceLast(false, "GoTrue lehnte den Magic-Link ab", hashError);
        setDone("error");
        return;
      }
      if (!accessToken || !refreshToken) {
        replaceLast(
          false,
          "URL-Hash enthält keinen access_token",
          `hash="${hash.slice(0, 120)}" — vermutlich Domain-Mismatch zwischen Mail-Link und aktueller URL.`,
        );
        setDone("error");
        return;
      }
      replaceLast(true, "URL-Hash mit Tokens gefunden", `access_token: ${accessToken.slice(0, 24)}…`);

      // 2. Session in supabase-js setzen (statt auf detectSessionInUrl zu vertrauen)
      add(null, "Session wird gesetzt …");
      const t0 = performance.now();
      const setRes = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      const dt = Math.round(performance.now() - t0);
      if (setRes.error) {
        replaceLast(
          false,
          `setSession fehlgeschlagen (${dt} ms)`,
          `${setRes.error.message || "(leere Message)"} · code=${(setRes.error as { code?: string }).code ?? "?"} · status=${(setRes.error as { status?: number }).status ?? "?"}`,
        );
        setDone("error");
        return;
      }
      replaceLast(
        true,
        `Session gesetzt (${dt} ms)`,
        `user=${setRes.data.session?.user.email ?? "?"}`,
      );

      // 3. allow_email-Lookup — das ist der zweite häufige Stolperstein
      add(null, "Berechtigung wird geprüft …");
      const t1 = performance.now();
      const email = setRes.data.session?.user.email;
      if (!email) {
        replaceLast(false, "Session enthält keine E-Mail", "Sehr ungewöhnlich.");
        setDone("error");
        return;
      }
      const { data: roleData, error: roleErr } = await supabase
        .from("allow_email")
        .select("rolle")
        .eq("email", email)
        .maybeSingle();
      const dt2 = Math.round(performance.now() - t1);
      if (roleErr) {
        replaceLast(
          false,
          `allow_email-Lookup fehlgeschlagen (${dt2} ms)`,
          `${roleErr.message} · code=${roleErr.code ?? "?"}`,
        );
        setDone("error");
        return;
      }
      if (!roleData?.rolle) {
        replaceLast(
          false,
          `E-Mail nicht freigeschaltet (${dt2} ms)`,
          `${email} steht nicht in apl.allow_email — Eintrag fehlt.`,
        );
        setDone("error");
        return;
      }
      replaceLast(true, `Berechtigt als „${roleData.rolle}" (${dt2} ms)`);

      add(true, "Alles gut — Weiterleitung zur Inbox …");
      setDone("success");
      setTimeout(() => navigate("/inbox", { replace: true }), 600);
    })().catch((e) => {
      replaceLast(false, "Unerwarteter Fehler im Callback", String(e));
      setDone("error");
    });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-xl w-full bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h1 className="text-lg font-bold text-slate-800">
          Magic-Link-Anmeldung
        </h1>
        <ol className="space-y-2.5">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="shrink-0 mt-0.5 w-5">
                {s.ok === null && (
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-300 animate-pulse" />
                )}
                {s.ok === true && (
                  <span className="text-emerald-600 font-bold">✓</span>
                )}
                {s.ok === false && (
                  <span className="text-rose-600 font-bold">✗</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={
                    s.ok === false
                      ? "text-rose-700 font-medium"
                      : s.ok === true
                        ? "text-slate-800"
                        : "text-slate-600"
                  }
                >
                  {s.text}
                </div>
                {s.detail && (
                  <div className="mt-0.5 text-[11px] text-slate-500 font-mono break-all">
                    {s.detail}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
        {done === "error" && (
          <div className="pt-4 mt-2 border-t border-slate-200 space-y-2 text-xs text-slate-500">
            <p>
              Bitte schick mir einen Screenshot dieser Seite — dann sehe ich
              genau, welcher Schritt schiefging.
            </p>
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="text-wue-rot hover:underline"
            >
              Zurück zum Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
