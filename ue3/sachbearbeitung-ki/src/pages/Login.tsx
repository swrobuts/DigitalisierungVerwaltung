import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, AUTH_REDIRECT } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { useUserRole } from "../hooks/useUserRole";

export function Login() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { allowed, loading } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && allowed) navigate("/inbox", { replace: true });
  }, [loading, allowed, navigate]);

  // Bis useUserRole entschieden hat, nichts rendern (verhindert Form-Flicker
  // wenn alte Session noch geprüft wird).
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Prüfe Anmeldung …</p>
      </div>
    );
  }

  // Wenn allowed (während navigate-Effect läuft), kurz nichts anzeigen
  if (allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Bereits angemeldet — leite weiter …</p>
      </div>
    );
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
        // GoTrue antwortet bei manchen Fehlern mit leerem Body — supabase-js
        // füllt `message` dann mit dem stringifizierten Body, also „{}".
        // Das ist eine grottige UX („Sachbearbeiter starrt auf rote {}").
        // Wir loggen das volle Objekt in die Console + zeigen so viel
        // Diagnose wie möglich an.
        // eslint-disable-next-line no-console
        console.error("[Login] signInWithOtp error:", error);
        const status = (error as { status?: number }).status;
        const code = (error as { code?: string }).code;
        const name = (error as { name?: string }).name;
        const rawMsg = error.message?.trim();
        const hasUsefulMsg = rawMsg && rawMsg !== "{}" && rawMsg !== "[]";

        let humanMsg: string;
        if (hasUsefulMsg) {
          humanMsg = rawMsg;
        } else if (status === 429) {
          humanMsg =
            "Zu viele Anfragen. Bitte warten Sie einen Moment und versuchen Sie es erneut.";
        } else if (status === 0 || !status) {
          humanMsg =
            "Auth-Server nicht erreichbar (kein HTTP-Status). Netzwerk oder Service down — bitte später erneut versuchen.";
        } else {
          humanMsg = `Auth-Fehler (HTTP ${status}) — leerer Body. Bitte später erneut versuchen.`;
        }
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
        e instanceof Error
          ? `Unerwarteter Fehler: ${e.message}`
          : `Unerwarteter Fehler: ${String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="w-full max-w-md">
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
            {msg && <p className="text-sm text-emerald-700">{msg}</p>}
            {err && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 space-y-1">
                <p className="break-words">{err}</p>
                <p className="text-[11px] text-rose-700/70">
                  Vollständige Diagnose in der Browser-Konsole (F12).
                </p>
              </div>
            )}
          </form>
          <p className="mt-6 text-xs text-slate-500">
            Nur freigeschaltete E-Mail-Adressen können einloggen. Kontakt:
            robert.butscher@thws.de.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
