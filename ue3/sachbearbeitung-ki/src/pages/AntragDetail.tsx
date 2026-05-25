/**
 * UE3 AntragDetail — wie UE2, plus KI-Sidebar mit Bescheid-Generierung.
 *
 * Bescheid-Button postet an https://pruefung.butscher.cloud/api/bescheid.
 * Backend macht die FB-Plugin-Subsumtion + Hard-Fail-Quellen-Validator.
 * 422 → wir zeigen den Fehler prominent ("KI hat erfundene Paragraphen
 * produziert — Sachbearbeiter, bitte manuell prüfen").
 */
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, FileSignature } from "lucide-react";
import { useAntrag } from "../hooks/useAntrag";
import { useBescheide } from "../hooks/useBescheide";
import { ManuellePruefungProvider } from "../hooks/useManuellePruefung";
import { DemoDatenBanner } from "../components/DemoDatenBanner";
import { StatusBadge } from "../components/StatusBadge";
import { FbBadge } from "../components/FbBadge";
import { HistoryTimeline } from "../components/HistoryTimeline";
import { AnlageDownload } from "../components/AnlageDownload";
import { SektionPruefung } from "../components/SektionPruefung";
import { FbIBlock, FbIiBlock, FbIiiBlock, FbIvBlock } from "../components/FbBlocks";
import { allowedTransitions, STATUS_LABELS, type Status } from "../lib/workflow";
import {
  formatDateTime,
  formatAdresse,
  formatDurchlaufzeit,
  durchlaufzeitAmpel,
  formatEuro,
  type DurchlaufzeitAmpel,
} from "../lib/format";
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

const AMPEL_BG: Record<DurchlaufzeitAmpel, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-slate-400",
};

export function AntragDetail() {
  const { id } = useParams<{ id: string }>();
  const { bundle, loading, error, changeStatus } = useAntrag(id);
  const {
    bescheide,
    creating: bescheidCreating,
    error: bescheidError,
    erstelleBescheid,
  } = useBescheide(id);
  const [confirmTo, setConfirmTo] = useState<Status | null>(null);
  const [kommentar, setKommentar] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="p-8 text-slate-500">Lade …</div>;
  if (error || !bundle)
    return (
      <div className="p-8 text-rose-700">
        Fehler: {error ?? "Antrag nicht gefunden"}
      </div>
    );

  const { antrag, anlagen, history } = bundle;
  const folgeStatus = allowedTransitions(antrag.status);
  const entschieden = ["bewilligt", "abgelehnt"].includes(antrag.status);
  const durchlauf =
    history.length > 0
      ? Math.max(
          0,
          Math.floor(
            ((entschieden ? new Date(history[0].geaendert_am).getTime() : Date.now()) -
              new Date(antrag.submitted_at).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : 0;
  const ampel = durchlaufzeitAmpel(durchlauf, entschieden);

  async function handleStatusChange() {
    if (!confirmTo) return;
    setBusy(true);
    const res = await changeStatus(confirmTo, kommentar);
    setBusy(false);
    if (res.error) alert("Fehler: " + res.error);
    setConfirmTo(null);
    setKommentar("");
  }

  async function handleBescheid(entscheidung: "bewilligt" | "abgelehnt" | "rueckfrage") {
    await erstelleBescheid({ entscheidung });
  }

  return (
    <ManuellePruefungProvider antragId={antrag.id}>
      <div className="min-h-screen bg-slate-100">
        <header className="bg-white border-b border-slate-200 relative sticky top-0 z-30">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-wue-rot" />
          <div className="w-full px-4 lg:px-8 py-4 flex items-center gap-3 flex-wrap">
            <Link to="/inbox" className="text-sm text-slate-500 flex items-center gap-1 hover:text-wue-rot">
              <ArrowLeft className="h-4 w-4" /> Inbox
            </Link>
            <span className="text-slate-300">·</span>
            <h1 className="text-lg font-bold font-mono">{antrag.antragsnummer ?? "—"}</h1>
            <FbBadge fb={antrag.foerderbereich} />
            <StatusBadge status={antrag.status} />
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <span
                className={`inline-block h-2 w-2 rounded-full ${AMPEL_BG[ampel]}`}
                aria-hidden="true"
              />
              {formatDurchlaufzeit(durchlauf, entschieden)}
            </span>
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold uppercase">
              KI-Variante (UE3)
            </span>
          </div>
        </header>

        <DemoDatenBanner />

        <main className="w-full px-4 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <article className="lg:col-span-2 bg-white border border-slate-200 shadow-sm rounded overflow-hidden">
            <div className="bg-wue-rot text-white px-8 py-3">
              <div className="font-semibold tracking-[0.2em] text-sm">STADT WÜRZBURG</div>
              <div className="text-xs opacity-90">Sozialreferat · Beratungsstelle für Senioren</div>
            </div>

            <div className="px-8 py-6 space-y-8">
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                    Antragsteller
                  </h2>
                  <SektionPruefung antragId={antrag.id} paragraph="antragsteller" />
                </div>
                <div className="text-base font-bold">{antrag.einrichtung}</div>
                {antrag.dachverband && (
                  <div className="text-sm text-slate-700">{antrag.dachverband}</div>
                )}
                <div className="text-sm text-slate-600 mt-1">
                  {formatAdresse(antrag.strasse, antrag.hausnummer ?? "", antrag.plz, antrag.ort)}
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                  <div>
                    <div className="text-xs uppercase text-slate-500">Ansprechpartner</div>
                    <div>{antrag.ansprechpartner}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-slate-500">Telefon</div>
                    <a href={`tel:${antrag.telefon}`} className="text-slate-900">
                      {antrag.telefon}
                    </a>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs uppercase text-slate-500">E-Mail</div>
                    <a href={`mailto:${antrag.email}`} className="text-slate-900">
                      {antrag.email}
                    </a>
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                    Bankverbindung
                  </h2>
                  <SektionPruefung antragId={antrag.id} paragraph="bank" />
                </div>
                <div className="text-sm">
                  <div>{antrag.bankname}</div>
                  <div className="font-mono mt-1">{antrag.iban}</div>
                  <div className="font-mono text-slate-600 text-xs">{antrag.bic}</div>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                    Förderbereich-Detail
                  </h2>
                  <SektionPruefung antragId={antrag.id} paragraph="fb_detail" />
                </div>
                <FbDispatcher bundle={bundle} />
              </section>

              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                    Anlagen ({anlagen.length})
                  </h2>
                  <SektionPruefung antragId={antrag.id} paragraph="anlagen" />
                </div>
                {anlagen.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">Keine Anlagen.</p>
                ) : (
                  <div className="space-y-2">
                    {anlagen.map((a) => (
                      <AnlageDownload key={a.id} anlage={a} />
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="bg-slate-50 border-t border-slate-200 px-8 py-3 text-xs text-slate-500">
              Eingegangen {formatDateTime(antrag.submitted_at)} · Sprache{" "}
              {antrag.submitted_language.toUpperCase()} · Haushaltsjahr {antrag.haushaltsjahr}
            </div>
          </article>

          <aside className="space-y-4 lg:sticky lg:top-[5rem] lg:self-start">
            <Card className="border-emerald-300">
              <CardHeader className="bg-emerald-50">
                <CardTitle className="flex items-center gap-2 text-emerald-900">
                  <FileSignature className="h-4 w-4" />
                  KI-Bescheid (UE3)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-3">
                <p className="text-xs text-slate-600">
                  Bescheid wird vom FB-Plugin generiert (Subsumtion durch Claude,
                  Hard-Fail-Validator gegen ahp_norm_statements).
                </p>
                <Button
                  className="w-full"
                  onClick={() => handleBescheid("bewilligt")}
                  disabled={bescheidCreating}
                >
                  {bescheidCreating ? "Generiere …" : "→ Bescheid erzeugen (bewilligt)"}
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 text-xs"
                    onClick={() => handleBescheid("abgelehnt")}
                    disabled={bescheidCreating}
                  >
                    abgelehnt
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-xs"
                    onClick={() => handleBescheid("rueckfrage")}
                    disabled={bescheidCreating}
                  >
                    Rückfrage
                  </Button>
                </div>
                {bescheidError && (
                  <div className="mt-2 p-2 bg-rose-50 border border-rose-300 rounded text-xs text-rose-800 whitespace-pre-wrap">
                    <strong>KI hat erfundene Paragraphen produziert</strong> — Sachbearbeiter, bitte manuell prüfen.
                    <br />
                    <span className="font-mono text-[10px]">{bescheidError}</span>
                  </div>
                )}
                {bescheide.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200 space-y-1.5">
                    <div className="text-xs uppercase text-slate-500">Vorhandene Bescheide</div>
                    {bescheide.map((b) => (
                      <div
                        key={b.id}
                        className="text-xs flex items-center justify-between border border-slate-200 rounded px-2 py-1"
                      >
                        <span>
                          <span className="font-semibold">{b.entscheidung}</span>
                          {b.bewilligte_summe_euro != null && (
                            <span className="ml-1 text-slate-600">
                              · {formatEuro(b.bewilligte_summe_euro)}
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {formatDateTime(b.ausgestellt_am)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Workflow · Status-Wechsel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {folgeStatus.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Status ist Endstatus — keine weiteren Übergänge.
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
                          <DialogDescription>Optionaler Kommentar.</DialogDescription>
                        </DialogHeader>
                        <Textarea
                          placeholder="Kommentar (optional) …"
                          value={kommentar}
                          onChange={(e) => setKommentar(e.target.value)}
                        />
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setConfirmTo(null)} disabled={busy}>
                            Abbrechen
                          </Button>
                          <Button onClick={handleStatusChange} disabled={busy}>
                            {busy ? "Speichere …" : `Auf "${STATUS_LABELS[s]}" setzen`}
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
                <CardTitle>Verlauf</CardTitle>
              </CardHeader>
              <CardContent>
                <HistoryTimeline history={history} />
              </CardContent>
            </Card>
          </aside>
        </main>
      </div>
    </ManuellePruefungProvider>
  );
}

function FbDispatcher({ bundle }: { bundle: NonNullable<ReturnType<typeof useAntrag>["bundle"]> }) {
  const { antrag } = bundle;
  switch (antrag.foerderbereich) {
    case "I":
      return <FbIBlock data={bundle.fb_i} />;
    case "II":
      return <FbIiBlock data={bundle.fb_ii} helfer={bundle.fb_ii_helfer} />;
    case "III":
      return <FbIiiBlock data={bundle.fb_iii} />;
    case "IV":
      return <FbIvBlock data={bundle.fb_iv} />;
  }
}
