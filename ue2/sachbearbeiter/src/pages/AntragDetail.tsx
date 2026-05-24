import { useState, type ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAntrag } from "../hooks/useAntrag";
import { StatusBadge } from "../components/StatusBadge";
import { HistoryTimeline } from "../components/HistoryTimeline";
import { AnlageDownload } from "../components/AnlageDownload";
import { allowedTransitions, STATUS_LABELS, type Status } from "../lib/workflow";
import { formatEuro, formatDateTime, formatDate, formatAdresse } from "../lib/format";
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
  const { antrag, anlagen, belegpositionen, oeffnungszeiten, history, loading, error, changeStatus } =
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
          <span
            className="ml-auto text-[11px] text-slate-500 italic"
            title="APL 2 ist nur das Aktenzeichen — die geltende Rechtsgrundlage ist die AHP-Förderrichtlinie Stadt Würzburg (Stand 2025-03-27)."
          >
            Aktenzeichen APL 2 — Rechtsgrundlage: AHP-Förderrichtlinie 2025-03-27
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Antragsdaten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {/* Labels und Reihenfolge PDF-konform (Final-Sweep 2026-05-24).
                Ansprechpartner-Block aufgeteilt (Telefon und E-Mail eigene
                Felder); Räume aufgeteilt mit PDF-Wortlaut; Miete als
                separates Feld unter Räume. */}
            <Field label="Name der Einrichtung">{antrag.name}</Field>
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
            <Field label="Ansprechpartner/in">{antrag.ansprechpartner}</Field>
            <Field label="Telefon / Handy">{antrag.telefon}</Field>
            <Field label="E-Mail">
              <a className="text-blue-600 underline" href={`mailto:${antrag.email}`}>
                {antrag.email}
              </a>
            </Field>
            <Field label="Haushaltsjahr">{antrag.haushaltsjahr}</Field>
            <Field label="Nachgewiesene Höhe der Betriebskosten des Vorjahres">
              {formatEuro(antrag.betriebskosten_vorjahr_euro)}
            </Field>
            <Field label="Nachgewiesene Höhe der Personalkosten des Vorjahres">
              {formatEuro(antrag.personalkosten_vorjahr_euro)}
            </Field>
            <Field label="Vorhandene Räumlichkeiten des Trägers">
              {antrag.raeume_vorhanden}
            </Field>
            <Field label="Unentgeltlich bereitgestellte Räume anderer Träger">
              {antrag.raeume_unentgeltlich}
            </Field>
            {antrag.miete_jahr_euro > 0 && (
              <Field label="Monatliche Mietzahlung">
                {formatEuro(antrag.miete_jahr_euro / 12)}
                {" (≙ Jahressumme "}{formatEuro(antrag.miete_jahr_euro)}{")"}
              </Field>
            )}
            <Field label="Antragsdatum (Bürger)">
              <span title="Datum, das der Bürger im Antragsformular angegeben hat (Würzburg, …)">
                Würzburg, {formatDate(antrag.antragsdatum)}
              </span>
            </Field>
            <Field label="Eingegangen am">
              {formatDateTime(antrag.submitted_at)} · Sprache{" "}
              {antrag.submitted_language.toUpperCase()}
              <div className="text-[11px] text-slate-500 mt-0.5">
                Antragsdatum lt. Bürger: {formatDate(antrag.antragsdatum)} ·
                Eingegangen im System: {formatDateTime(antrag.submitted_at)}
              </div>
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
              <CardTitle>Belegpositionen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {belegpositionen.length === 0 ? (
                <p className="text-slate-500">Keine Belegpositionen.</p>
              ) : (
                (["betriebskosten", "personalkosten", "miete"] as const).map((typ) => {
                  const items = belegpositionen.filter((b) => b.belegtyp === typ);
                  if (items.length === 0) return null;
                  const summe = items.reduce((s, b) => s + Number(b.betrag_euro), 0);
                  return (
                    <div key={typ} className="border-b border-slate-100 pb-2">
                      <p className="font-medium capitalize mb-1">{typ}</p>
                      {items.map((b) => (
                        <div key={b.id} className="flex justify-between text-xs">
                          <span>{b.bezeichnung}</span>
                          <span>{formatEuro(Number(b.betrag_euro))}</span>
                        </div>
                      ))}
                      <div className="flex justify-between mt-1 font-semibold text-xs">
                        <span>Summe</span>
                        <span>{formatEuro(summe)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Öffnungszeiten</CardTitle>
            </CardHeader>
            <CardContent>
              {oeffnungszeiten.length === 0 ? (
                <p className="text-sm text-slate-500">Kein Wochenplan hinterlegt.</p>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {(["mo", "di", "mi", "do", "fr", "sa", "so"] as const).map((tag) => {
                      const eintrag = oeffnungszeiten.find((o) => o.wochentag === tag);
                      const label = { mo: "Mo", di: "Di", mi: "Mi", do: "Do", fr: "Fr", sa: "Sa", so: "So" }[tag];
                      return (
                        <tr key={tag}>
                          <td className="font-medium pr-2">{label}</td>
                          <td className="pr-2">{eintrag?.oeffnungszeit ?? "—"}</td>
                          <td>{eintrag?.angebot ?? ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
