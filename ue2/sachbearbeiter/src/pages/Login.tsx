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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: AUTH_REDIRECT },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setMsg("Magic-Link verschickt. Bitte E-Mail-Posteingang prüfen.");
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
            {err && <p className="text-sm text-rose-700">{err}</p>}
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
