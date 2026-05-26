/**
 * UE3 AntragDetail — Vollrestoration nach apl2→apl-Hard-Cut.
 *
 * Layout:
 *  1. Sticky Header mit Inbox-Link, Antragsnummer, FB-Badge, Status-Badge,
 *     Durchlaufzeit-Ampel, KI-Variante-Marker.
 *  2. Bearbeitungsstand-Stepper (volle Breite).
 *  3. DemoDatenBanner (conditional, volle Breite).
 *  4. Zweispaltiges Grid:
 *     - Article (links, lg:col-span-2): AntragMetricsBar + AntragViewer
 *       (Antragsteller, Bank, FB-Detail via Schema-Renderer) + Anlagen +
 *       HistoryTimeline.
 *     - Aside (rechts, lg:col-span-1): PruefungsCard (KI-Konformität mit
 *       Empfehlung + Befunden + AHP-Wortlaut), BescheideListe (PDF/DOCX),
 *       Workflow-Status-Buttons, VorjahresVergleich.
 *
 * ZweitpruefungsCard + ExterneValidierungCard folgen in Etappe E.
 */
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAntrag } from "../hooks/useAntrag";
import { useBescheide, type BescheidRow } from "../hooks/useBescheide";
import { ManuellePruefungProvider } from "../hooks/useManuellePruefung";
import { DemoDatenBanner } from "../components/DemoDatenBanner";
import { StatusBadge } from "../components/StatusBadge";
import { FbBadge } from "../components/FbBadge";
import { HistoryTimeline } from "../components/HistoryTimeline";
import { AnlageDownload } from "../components/AnlageDownload";
import { SektionPruefung } from "../components/SektionPruefung";
import { Bearbeitungsstand } from "../components/Bearbeitungsstand";
import { AntragMetricsBar } from "../components/AntragMetricsBar";
import { PruefungsCard } from "../components/PruefungsCard";
import { BescheideListe } from "../components/BescheideListe";
import { VorjahresVergleich } from "../components/VorjahresVergleich";
import { AntragViewer } from "@dv/antrag-renderer";
import { allowedTransitions, STATUS_LABELS, type Status } from "../lib/workflow";
import {
  formatDateTime,
  formatAdresse,
  formatDurchlaufzeit,
  durchlaufzeitAmpel,
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
    error: bescheidError,
    downloadBescheidPdf,
    downloadBescheidDocx,
    loeschBescheid,
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

  async function handleOpenBescheidPdf(b: BescheidRow) {
    if (!b.pdf_storage_path) {
      alert("Für diesen Bescheid liegt keine PDF im Storage.");
      return;
    }
    const url = await downloadBescheidPdf(b.pdf_storage_path);
    if (url) window.open(url, "_blank", "noopener");
  }

  async function handleOpenBescheidDocx(b: BescheidRow) {
    const url = await downloadBescheidDocx(b.id);
    if (url) window.open(url, "_blank", "noopener");
  }

  async function handleDeleteBescheid(b: BescheidRow) {
    if (!window.confirm(`Bescheid „${b.entscheidung}" wirklich löschen?`)) return;
    await loeschBescheid(b.id, b.pdf_storage_path);
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

        <div className="px-4 lg:px-8 pt-4">
          <Bearbeitungsstand
            status={antrag.status}
            entscheidung={
              antrag.status === "bewilligt" || antrag.status === "abgelehnt"
                ? STATUS_LABELS[antrag.status]
                : undefined
            }
          />
        </div>

        <DemoDatenBanner />

        <main className="w-full px-4 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <article className="lg:col-span-2 space-y-4">
            <AntragMetricsBar
              antrag={antrag}
              history={history}
              bescheideCount={bescheide.length}
            />

            <div className="bg-white border border-slate-200 shadow-sm rounded overflow-hidden">
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
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Verlauf</CardTitle>
              </CardHeader>
              <CardContent>
                <HistoryTimeline history={history} />
              </CardContent>
            </Card>
          </article>

          <aside className="space-y-4 lg:sticky lg:top-[5rem] lg:self-start">
            <PruefungsCard
              antragId={id!}
              onApplyEmpfehlung={(aktion) => {
                const target: Status =
                  aktion === "bewilligen"
                    ? "bewilligt"
                    : aktion === "ablehnen"
                    ? "abgelehnt"
                    : "rueckfrage";
                setConfirmTo(target);
              }}
            />

            <BescheideListe
              bescheide={bescheide}
              onOpen={handleOpenBescheidPdf}
              onOpenDocx={handleOpenBescheidDocx}
              onDelete={handleDeleteBescheid}
              error={bescheidError}
            />

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

            <VorjahresVergleich antragId={id!} />
          </aside>
        </main>
      </div>
    </ManuellePruefungProvider>
  );
}

function FbDispatcher({ bundle }: { bundle: NonNullable<ReturnType<typeof useAntrag>["bundle"]> }) {
  // Anzeige kommt vollständig aus @dv/antrag-renderer — keine FB-spezifische
  // Render-Logik mehr im Frontend. Single Source of Truth in
  // packages/antrag-renderer/src/schemas/*. Wenn ein Feld in der DB fehlt,
  // schlägt der field-coverage.test.ts in CI an, bevor es deployed wird.
  return (
    <AntragViewer
      fb={bundle.antrag.foerderbereich}
      fbI={bundle.fb_i}
      fbIi={bundle.fb_ii}
      fbIiHelfer={bundle.fb_ii_helfer}
      fbIii={bundle.fb_iii}
      fbIv={bundle.fb_iv}
    />
  );
}
