import { useState, type ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAntrag } from "../hooks/useAntrag";
import { StatusBadge } from "../components/StatusBadge";
import { HistoryTimeline } from "../components/HistoryTimeline";
import { AnlageDownload } from "../components/AnlageDownload";
import { allowedTransitions, STATUS_LABELS, type Status } from "../lib/workflow";
import { formatEuro, formatDateTime, formatAdresse } from "../lib/format";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";

export function AntragDetail() {
  const { id } = useParams<{ id: string }>();
  const { antrag, anlagen, history, loading, error, changeStatus } =
    useAntrag(id);
  const [confirmTo, setConfirmTo] = useState<Status | null>(null);
  const [kommentar, setKommentar] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="p-8 text-slate-500">Lade …</div>;
  if (error || !antrag)
    return (
      <div className="p-8 text-rose-700">
        Fehler: {error ?? "Antrag nicht gefunden"}
      </div>
    );

  const folgeStatus = allowedTransitions(antrag.status);

  async function handleStatusChange() {
    if (!confirmTo) return;
    setBusy(true);
    const result = await changeStatus(confirmTo, kommentar);
    setBusy(false);
    if (result.error) alert("Fehler: " + result.error);
    setConfirmTo(null);
    setKommentar("");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link
            to="/inbox"
            className="text-sm text-slate-500 flex items-center gap-1 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Inbox
          </Link>
          <span className="text-slate-300">·</span>
          <h1 className="text-lg font-bold font-mono">{antrag.antragsnummer}</h1>
          <StatusBadge status={antrag.status} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Antragsdaten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label="Einrichtung">{antrag.name}</Field>
            <Field label="Träger">{antrag.traeger}</Field>
            <Field label="Anschrift">
              {formatAdresse(antrag.strasse, antrag.hausnummer, antrag.plz, antrag.ort)}
            </Field>
            <Field label="Bankverbindung">
              {antrag.bankverbindung} · IBAN{" "}
              <span className="font-mono">{antrag.iban}</span>
              {antrag.bic && (
                <>
                  {" "}
                  · BIC <span className="font-mono">{antrag.bic}</span>
                </>
              )}
            </Field>
            <Field label="Ansprechpartner/in">
              {antrag.ansprechpartner} · {antrag.telefon} ·{" "}
              <a className="text-blue-600 underline" href={`mailto:${antrag.email}`}>
                {antrag.email}
              </a>
            </Field>
            <Field label="Haushaltsjahr">{antrag.haushaltsjahr}</Field>
            <Field label="Betriebskosten Vorjahr">
              {formatEuro(antrag.betriebskosten_vorjahr_euro)}
            </Field>
            <Field label="Personalkosten Vorjahr">
              {formatEuro(antrag.personalkosten_vorjahr_euro)}
            </Field>
            <Field label="Räume vorhanden / unentgeltlich">
              {antrag.raeume_vorhanden} / {antrag.raeume_unentgeltlich}
              {antrag.monatliche_miete_euro > 0 && (
                <> · Miete {formatEuro(antrag.monatliche_miete_euro)}</>
              )}
            </Field>
            <Field label="Eingegangen am">
              {formatDateTime(antrag.submitted_at)} · Sprache{" "}
              {antrag.submitted_language.toUpperCase()}
            </Field>
            <Field label="IP / User-Agent">
              {antrag.ip_address ?? "—"} ·{" "}
              <span className="text-xs text-slate-500">{antrag.user_agent ?? "—"}</span>
            </Field>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Aktionen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {folgeStatus.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Status ist ein Endstatus — keine weiteren Übergänge.
                </p>
              ) : (
                folgeStatus.map((s) => (
                  <Dialog
                    key={s}
                    open={confirmTo === s}
                    onOpenChange={(open) => !open && setConfirmTo(null)}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => setConfirmTo(s)}
                      >
                        → {STATUS_LABELS[s]}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          Status auf „{STATUS_LABELS[s]}" setzen?
                        </DialogTitle>
                        <DialogDescription>
                          Optional kannst du einen Kommentar hinterlassen (im
                          Audit-Trail sichtbar).
                        </DialogDescription>
                      </DialogHeader>
                      <Textarea
                        placeholder="Kommentar (optional) …"
                        value={kommentar}
                        onChange={(e) => setKommentar(e.target.value)}
                      />
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setConfirmTo(null)}
                          disabled={busy}
                        >
                          Abbrechen
                        </Button>
                        <Button onClick={handleStatusChange} disabled={busy}>
                          {busy
                            ? "Wird gespeichert …"
                            : `Auf "${STATUS_LABELS[s]}" setzen`}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Anlagen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {anlagen.length === 0 ? (
                <p className="text-sm text-slate-500">Keine Anlagen.</p>
              ) : (
                anlagen.map((a) => <AnlageDownload key={a.id} anlage={a} />)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verlauf</CardTitle>
            </CardHeader>
            <CardContent>
              <HistoryTimeline history={history} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-2">
      <div className="text-slate-500">{label}</div>
      <div>{children}</div>
    </div>
  );
}
