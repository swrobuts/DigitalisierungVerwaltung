import { useEffect, useState, useRef, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase, AUTH_REDIRECT } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { useUserRole } from "../hooks/useUserRole";

interface DiagRow {
  key: string;
  ok: boolean | null;
  text: string;
  detail?: string;
}

/**
 * Login-Seite mit fest verdrahteter Diagnose-Sektion.
 *
 * Hintergrund (Sa. 2026-05-30): nach 5 Stunden Hin-und-Her am Login
 * mit fünf verschiedenen Backend-Schichten (Pool/CORS/RLS/Container-
 * Down/Schema-Cache) tappten wir oft im Dunkeln, weil der Callback
 * still zu /login zurück-redirected hat. Diese Diagnose-Karte
 * läuft beim Mount IMMER und zeigt für jede Schicht den Live-Status:
 *
 *   1. Origin + Auth-Redirect-URL — sehen wir die richtige Domain?
 *   2. URL-Hash/Query — kam ein Error vom Callback-Redirect rein?
 *   3. localStorage „amt.auth" — gibt's eine Session?
 *   4. getSession() vom Supabase-Client
 *   5. allow_email-Lookup für die aktuelle User-E-Mail (sonst RLS-Bug)
 *
 * Wenn der Anmeldebildschirm das nächste Mal überraschend auftaucht,
 * sieht der Sachbearbeiter sofort an welchem Punkt es klemmt — kein
 * Screenshot-Hin-und-Her, kein Browser-Console-Geraten.
 */
export function Login() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [diag, setDiag] = useState<DiagRow[]>([]);
  const [diagBusy, setDiagBusy] = useState(false);
  const [searchParams] = useSearchParams();
  const ranOnceRef = useRef(false);
  const { allowed, loading } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && allowed) navigate("/inbox", { replace: true });
  }, [loading, allowed, navigate]);

  // Diagnose beim Mount laufen lassen (auch wenn loading noch true ist).
  useEffect(() => {
    if (ranOnceRef.current) return;
    ranOnceRef.current = true;
    void runDiagnose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runDiagnose() {
    setDiagBusy(true);
    const rows: DiagRow[] = [];

    // 1. Origin / Redirect-URL
    rows.push({
      key: "origin",
      ok: true,
      text: `Origin: ${window.location.origin}`,
      detail: `Magic-Link-Redirect zielt auf: ${AUTH_REDIRECT}`,
    });

    // 2. URL-Parameter — falls vom Callback ein Fehler hierher
    //    zurückgegeben wurde, ist das der erste Lese-Ort.
    const urlErr = searchParams.get("error");
    const urlHash = window.location.hash;
    if (urlErr) {
      rows.push({
        key: "url-error",
        ok: false,
        text: `URL trägt einen Fehler von der Callback-Seite: ${urlErr}`,
        detail: `Query: ${window.location.search} · Hash: ${urlHash.slice(0, 80)}`,
      });
    } else if (urlHash && urlHash.includes("error")) {
      rows.push({
        key: "url-hash-error",
        ok: false,
        text: `GoTrue hat einen Fehler im URL-Fragment zurückgegeben`,
        detail: urlHash.slice(0, 200),
      });
    } else {
      rows.push({
        key: "url-clean",
        ok: true,
        text: "URL enthält keinen Fehler",
        detail: urlHash ? `Hash: ${urlHash.slice(0, 80)}` : "kein Hash",
      });
    }

    // 3. localStorage — supabase-js speichert hier die Session
    let lsRaw = "";
    try {
      lsRaw = localStorage.getItem("amt.auth") ?? "";
    } catch {
      /* private mode */
    }
    if (!lsRaw) {
      rows.push({
        key: "localStorage",
        ok: false,
        text: "Keine Session im localStorage (amt.auth fehlt)",
        detail:
          "Wenn du gerade auf einen Magic-Link geklickt hast, hätte hier ein Token landen müssen — er kam aber nicht an oder wurde nicht persistiert.",
      });
    } else {
      let preview = lsRaw.slice(0, 80);
      try {
        const parsed = JSON.parse(lsRaw);
        const exp = parsed?.expires_at
          ? new Date(parsed.expires_at * 1000).toISOString()
          : "?";
        preview = `user=${parsed?.user?.email ?? "?"} · expires=${exp}`;
      } catch {
        preview = `${preview}…`;
      }
      rows.push({
        key: "localStorage",
        ok: true,
        text: "Session im localStorage vorhanden",
        detail: preview,
      });
    }

    // 4. supabase.auth.getSession() — der Client-State
    const tGet = performance.now();
    const { data: sess, error: sessErr } = await supabase.auth.getSession();
    const dtGet = Math.round(performance.now() - tGet);
    if (sessErr) {
      rows.push({
        key: "getSession",
        ok: false,
        text: `getSession() fehlgeschlagen (${dtGet} ms)`,
        detail: sessErr.message,
      });
    } else if (!sess.session) {
      rows.push({
        key: "getSession",
        ok: null,
        text: `Keine aktive Session (${dtGet} ms)`,
        detail: "Nichts Aktives → das Magic-Link-Flow wurde noch nicht durchlaufen oder die Session ist abgelaufen.",
      });
    } else {
      rows.push({
        key: "getSession",
        ok: true,
        text: `Aktive Session: ${sess.session.user.email} (${dtGet} ms)`,
        detail: `expires_at=${new Date(sess.session.expires_at! * 1000).toISOString()}`,
      });
    }

    // 5. allow_email-Lookup — nur sinnvoll wenn wir eine E-Mail haben
    const emailToCheck = sess.session?.user.email ?? null;
    if (!emailToCheck) {
      rows.push({
        key: "allow_email",
        ok: null,
        text: "allow_email-Lookup übersprungen (keine Session-E-Mail)",
      });
    } else {
      const tAllow = performance.now();
      const { data: roleData, error: roleErr } = await supabase
        .from("allow_email")
        .select("rolle")
        .eq("email", emailToCheck)
        .maybeSingle();
      const dtAllow = Math.round(performance.now() - tAllow);
      if (roleErr) {
        rows.push({
          key: "allow_email",
          ok: false,
          text: `allow_email-Lookup fehlgeschlagen (${dtAllow} ms)`,
          detail: `${roleErr.message} · code=${roleErr.code ?? "?"} · hint=${roleErr.hint ?? "?"}`,
        });
      } else if (!roleData?.rolle) {
        rows.push({
          key: "allow_email",
          ok: false,
          text: `E-Mail nicht freigeschaltet (${dtAllow} ms)`,
          detail: `${emailToCheck} steht nicht in apl.allow_email`,
        });
      } else {
        rows.push({
          key: "allow_email",
          ok: true,
          text: `Berechtigt als „${roleData.rolle}" (${dtAllow} ms)`,
        });
      }
    }

    setDiag(rows);
    setDiagBusy(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: AUTH_REDIRECT },
      });
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[Login] signInWithOtp error:", error);
        const status = (error as { status?: number }).status;
        const code = (error as { code?: string }).code;
        const name = (error as { name?: string }).name;
        const rawMsg = error.message?.trim();
        const hasUsefulMsg = rawMsg && rawMsg !== "{}" && rawMsg !== "[]";

        let humanMsg: string;
        if (hasUsefulMsg) humanMsg = rawMsg;
        else if (status === 429)
          humanMsg = "Zu viele Anfragen. Bitte einen Moment warten.";
        else if (!status)
          humanMsg = "Auth-Server nicht erreichbar (kein HTTP-Status).";
        else humanMsg = `Auth-Fehler (HTTP ${status}) — leerer Body.`;

        const tags = [code, name, status ? `HTTP ${status}` : null]
          .filter(Boolean)
          .join(" · ");
        setErr(tags ? `${humanMsg} [${tags}]` : humanMsg);
      } else {
        setMsg("Magic-Link verschickt. Bitte E-Mail-Posteingang prüfen.");
      }
    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      console.error("[Login] unexpected:", e);
      setErr(
        e instanceof Error ? `Unerwarteter Fehler: ${e.message}` : `Unerwarteter Fehler: ${String(e)}`,
      );
    } finally {
      setBusy(false);
      // Diagnose erneut laufen lassen — nach Klick auf „anfordern" könnte
      // sich der Status geändert haben (z.B. URL-Error hereinkommen).
      void runDiagnose();
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-slate-50 p-4 gap-4 pt-8">
      {/* DIAGNOSE-CARD — IMMER sichtbar, vor allem anderen */}
      <Card className="w-full max-w-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Login-Diagnose</CardTitle>
          <button
            type="button"
            onClick={() => void runDiagnose()}
            disabled={diagBusy}
            className="text-xs text-wue-rot hover:underline disabled:opacity-50"
          >
            {diagBusy ? "Prüfe …" : "Neu prüfen"}
          </button>
        </CardHeader>
        <CardContent>
          {diag.length === 0 && (
            <p className="text-sm text-slate-500">Lade …</p>
          )}
          <ol className="space-y-2.5">
            {diag.map((s) => (
              <li key={s.key} className="flex items-start gap-3 text-sm">
                <span className="shrink-0 mt-0.5 w-5">
                  {s.ok === null && <span className="text-slate-400">○</span>}
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
                        ? "text-rose-700 font-medium break-words"
                        : s.ok === true
                          ? "text-slate-800 break-words"
                          : "text-slate-600 break-words"
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
          <p className="mt-4 text-[11px] text-slate-400">
            Diese Diagnose läuft auch beim Anmelden mit. Bei einem Bug bitte
            einen Screenshot dieser Karte schicken — daran sieht man sofort,
            welche Schicht klemmt.
          </p>
        </CardContent>
      </Card>

      {/* LOGIN-FORM */}
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Sachbearbeiter-Login</CardTitle>
          <p className="text-sm text-slate-500">Stadt Würzburg · APL 2</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Dienst-E-Mail (@thws.de)</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Wird gesendet …" : "Magic-Link anfordern"}
            </Button>
            {msg && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {msg}
              </div>
            )}
            {err && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 space-y-1">
                <p className="break-words">{err}</p>
                <p className="text-[11px] text-rose-700/70">
                  Vollständige Diagnose-Karte oben + Browser-Konsole (F12).
                </p>
              </div>
            )}
          </form>
          <p className="mt-6 text-xs text-slate-500">
            Nur freigeschaltete E-Mail-Adressen können einloggen. Kontakt:
            robert.butscher@thws.de.
          </p>
          {loading && (
            <p className="mt-3 text-xs text-slate-400">Prüfe bestehende Anmeldung …</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
