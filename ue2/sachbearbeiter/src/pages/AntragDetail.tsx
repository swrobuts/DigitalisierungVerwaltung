/**
 * UE2 AntragDetail — Parität zu UE3, ohne KI-Cards (Pre-Hard-Cut-Layout).
 *
 * Layout spiegelt UE3 1:1:
 *  1. Schmaler Top-Header (Inbox-Link, Antragsnummer, FB-Badge, Status-
 *     Badge, Durchlaufzeit-Ampel, UE2-Marker statt KI-Variante).
 *  2. Bearbeitungsstand-Stepper (volle Breite, sticky).
 *  3. DemoDatenBanner (conditional).
 *  4. Zweispaltiges Grid:
 *     - Article (links): AntragMetricsBar + weißer Container
 *       (AntragHeader + §-Sektionen + Footer). + Verlauf.
 *     - Aside (rechts): BescheideListe (mit manueller Erstellung als
 *       Haupt-Aktion), ZweitpruefungsCard (withKi={false}),
 *       Workflow-Status-Wechsel, VorjahresVergleich.
 *
 * Unterschied zu UE3:
 *  - KEINE PruefungsCard (KI-Konformitätsprüfung)
 *  - KEINE ExterneValidierungCard (externe AHP-Validierung)
 *  - ZweitpruefungsCard mit `withKi={false}` (Mensch-Zweitprüfung only)
 *  - BescheideListe mit `onCreateManual` → POST /api/bescheid (selber
 *    Backend-Endpoint + selber Halluzinations-Validator wie UE3).
 *
 * Halluzinations-Schutz: Wenn der Backend-Validator (422) eine erfundene
 * §-Referenz im gerenderten Bescheid-Text findet, wird die Erstellung
 * abgewiesen und der UI-Fehler im `bescheidError`-State angezeigt.
 */
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAntrag } from "../hooks/useAntrag";
import { useBescheide, type BescheidRow } from "../hooks/useBescheide";
import { useSession } from "../hooks/useSession";
import {
  ManuellePruefungProvider,
  useManuellePruefung,
} from "../hooks/useManuellePruefung";
import { DemoDatenBanner } from "../components/DemoDatenBanner";
import { StatusBadge } from "../components/StatusBadge";
import { FbBadge } from "../components/FbBadge";
import { HistoryTimeline } from "../components/HistoryTimeline";
import { AnlageDownload } from "../components/AnlageDownload";
import { SektionPruefung } from "../components/SektionPruefung";
import { BescheideListe } from "../components/BescheideListe";
import { VorjahresVergleich } from "../components/VorjahresVergleich";
import { ZweitpruefungsCard } from "../components/ZweitpruefungsCard";
import {
  AntragViewer,
  Bearbeitungsstand,
  AntragHeader,
  DocSection,
  FieldGrid,
  DocField,
} from "@dv/antrag-renderer";
import { allowedTransitions, STATUS_LABELS, type Status } from "../lib/workflow";
import {
  formatDateTime,
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

/** Mapping Entscheidung → Folge-Status (für den automatischen Workflow-
 *  Übergang nach erfolgreicher Bescheid-Erstellung). */
const ENTSCHEIDUNG_TO_STATUS: Record<string, Status> = {
  bewilligen: "bewilligt",
  ablehnen: "abgelehnt",
  rueckfrage: "rueckfrage",
};

export function AntragDetail() {
  const { id } = useParams<{ id: string }>();
  const { bundle, loading, error, changeStatus } = useAntrag(id);
  const { session } = useSession();
  const {
    bescheide,
    error: bescheidError,
    creating: bescheidCreating,
    erstelleBescheid,
    downloadBescheidPdf,
    downloadBescheidDocx,
    loeschBescheid,
  } = useBescheide(id);
  // Parallele Lade-Instanz der manuellen Sektions-Prüfungen für den
  // Bescheid-Vier-Augen-Kontext (UE2). Der <ManuellePruefungProvider>
  // weiter unten im Tree hält eine eigene Instanz für die SektionPruefung-
  // Komponenten — das ist redundant beim ersten Render (ein zusätzlicher
  // SELECT), aber simpel: handleCreateManualBescheid liegt außerhalb des
  // Provider-Trees und braucht einen direkten Zugriff auf listAll().
  const { listAll: listAllManuellePruefung } = useManuellePruefung(id);
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

  /**
   * Manueller Bescheid-Flow für UE2.
   *
   * Backend-Pfad ist identisch zum KI-Flow (POST /api/bescheid). Der
   * Halluzinations-Validator (`validiere_oder_abbrechen`) läuft auch
   * hier — wenn er greift, kommt 422 zurück und useBescheide setzt
   * den `error`-State (sichtbar als rote Box in der BescheideListe).
   *
   * Nach Erfolg: Antrags-Status passend zur Entscheidung weiterschalten,
   * damit der Workflow konsistent bleibt (Bescheid bewilligt → Antrag
   * bewilligt). Wenn der Status-Wechsel laut Workflow nicht erlaubt
   * ist (z.B. weil eine Zweitprüfung noch offen ist), wird er übersprungen
   * — der Sachbearbeiter sieht den Bescheid trotzdem und kann manuell
   * weiterklicken.
   */
  async function handleCreateManualBescheid(
    entscheidung: "bewilligen" | "ablehnen" | "rueckfrage",
  ) {
    const dbEntscheidung =
      entscheidung === "bewilligen" ? "bewilligt"
      : entscheidung === "ablehnen" ? "abgelehnt"
      : "rueckfrage";
    // Vier-Augen-Kontext: alle bereits geprüften §-Sektionen mitgeben,
    // damit der Bescheid die Sachbearbeiter-Bewertungen sichtbar macht.
    const manuelleKontext = listAllManuellePruefung();
    const res = await erstelleBescheid({
      entscheidung: dbEntscheidung,
      ausgestellt_von: session?.user?.email ?? null,
      bearbeiter_kommentar: `Bescheid manuell erstellt (${entscheidung}).`,
      manuelle_pruefung_kontext: manuelleKontext.length > 0
        ? manuelleKontext
        : undefined,
    });
    if (res?.error) return; // Fehler steht bereits in bescheidError
    const target = ENTSCHEIDUNG_TO_STATUS[entscheidung];
    if (target && allowedTransitions(antrag.status).includes(target)) {
      await changeStatus(target, `Bescheid manuell ${entscheidung}`);
    }
  }

  return (
    <ManuellePruefungProvider antragId={antrag.id}>
      <div className="min-h-screen bg-slate-100">
        <header className="bg-white border-b border-slate-200 relative sticky top-0 z-30">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-wue-rot" />
          <div className="w-full px-4 lg:px-8 py-4 flex items-center gap-3 flex-wrap">
            <Link
              to="/inbox"
              className="text-sm text-slate-500 flex items-center gap-1 hover:text-wue-rot"
            >
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
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-600 font-semibold uppercase">
              Manuelle Variante (UE2)
            </span>
          </div>
        </header>

        {/* Bearbeitungsstand-Stepper — sticky direkt unter dem schmalen Header */}
        <div className="px-4 lg:px-8 pt-4 sticky top-[3.5rem] lg:top-[4rem] z-20">
          <Bearbeitungsstand status={antrag.status} sticky={false} />
        </div>

        <DemoDatenBanner />

        <main className="w-full px-4 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <article className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-slate-200 shadow-sm rounded overflow-hidden">
              <AntragHeader
                antrag={antrag}
                fbI={bundle.fb_i}
                fbIii={bundle.fb_iii}
                fbIv={bundle.fb_iv}
                statusBadge={<StatusBadge status={antrag.status} />}
              />

              {/* §-Sektionen */}
              <div className="px-10 lg:px-14 py-10 space-y-0">
                <DocSection
                  num="§ 1"
                  title="Antragsteller / Träger"
                  actions={<SektionPruefung antragId={antrag.id} paragraph="antragsteller" />}
                >
                  <FieldGrid>
                    <DocField label="Träger" className="sm:col-span-2">
                      {antrag.dachverband || antrag.einrichtung}
                    </DocField>
                    <DocField label="Ansprechpartner/in" className="sm:col-span-2">
                      {antrag.ansprechpartner}
                    </DocField>
                    <DocField label="Telefon / Handy">
                      <a
                        href={`tel:${(antrag.telefon ?? "").replace(/\s+/g, "")}`}
                        className="text-slate-800 hover:text-slate-900 underline decoration-slate-300 hover:decoration-slate-600 underline-offset-2"
                      >
                        {antrag.telefon}
                      </a>
                    </DocField>
                    <DocField label="E-Mail">
                      <a
                        href={`mailto:${antrag.email}`}
                        className="text-slate-800 hover:text-slate-900 underline decoration-slate-300 hover:decoration-slate-600 underline-offset-2 break-all"
                      >
                        {antrag.email}
                      </a>
                    </DocField>
                    {antrag.homepage && (
                      <DocField label="Homepage" className="sm:col-span-2">
                        <a
                          href={antrag.homepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-800 hover:text-slate-900 underline decoration-slate-300 hover:decoration-slate-600 underline-offset-2"
                        >
                          {antrag.homepage}
                        </a>
                      </DocField>
                    )}
                  </FieldGrid>
                </DocSection>

                <DocSection
                  num="§ 2"
                  title="Bankverbindung"
                  actions={<SektionPruefung antragId={antrag.id} paragraph="bank" />}
                >
                  <FieldGrid>
                    <DocField label="Bankname" className="sm:col-span-2">
                      {antrag.bankname}
                    </DocField>
                    <DocField label="IBAN" className="sm:col-span-2">
                      <span className="font-mono text-[15px] tracking-wide text-slate-900">
                        {antrag.iban}
                      </span>
                    </DocField>
                    <DocField label="BIC">
                      {antrag.bic ? (
                        <span className="font-mono text-slate-700">{antrag.bic}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </DocField>
                  </FieldGrid>
                </DocSection>

                {/* § 3+: FB-spezifische Sektionen aus dem Renderer-Schema. */}
                <AntragViewer
                  fb={bundle.antrag.foerderbereich}
                  fbI={bundle.fb_i}
                  fbIi={bundle.fb_ii}
                  fbIiHelfer={bundle.fb_ii_helfer}
                  fbIii={bundle.fb_iii}
                  fbIv={bundle.fb_iv}
                  paragraphStart={3}
                />

                <DocSection
                  num="§"
                  title={`Anlagen (${anlagen.length})`}
                  subtitle="Mit dem Antrag eingereichte Belege"
                  actions={<SektionPruefung antragId={antrag.id} paragraph="anlagen" />}
                >
                  {anlagen.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">Keine Anlagen.</p>
                  ) : (
                    <div className="space-y-2">
                      {anlagen.map((a) => (
                        <AnlageDownload key={a.id} anlage={a} />
                      ))}
                    </div>
                  )}
                </DocSection>
              </div>

              {/* Submission-Footer — Eingangsstempel-Look */}
              <div className="bg-slate-50 border-t-2 border-slate-200 px-10 lg:px-14 py-5">
                <div className="flex flex-wrap items-baseline justify-between gap-4 text-xs">
                  <div className="text-slate-500">
                    <span className="font-semibold uppercase tracking-wider">Eingegangen</span>
                    <span className="ml-2 text-slate-700">
                      {formatDateTime(antrag.submitted_at)}
                    </span>
                    <span className="ml-3 text-slate-400">·</span>
                    <span className="ml-3">
                      Sprache <span className="text-slate-700">{antrag.submitted_language.toUpperCase()}</span>
                    </span>
                    <span className="ml-3 text-slate-400">·</span>
                    <span className="ml-3 font-semibold uppercase tracking-wider">Haushaltsjahr</span>
                    <span className="ml-2 text-slate-700 tabular-nums">{antrag.haushaltsjahr}</span>
                  </div>
                  <div className="text-slate-400 text-[11px] font-mono">
                    Elektronische Einreichung — keine Unterschrift erforderlich
                  </div>
                </div>
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

          <aside className="space-y-4 lg:sticky lg:top-[6.5rem] lg:self-start">
            <BescheideListe
              bescheide={bescheide}
              onOpen={handleOpenBescheidPdf}
              onOpenDocx={handleOpenBescheidDocx}
              onDelete={handleDeleteBescheid}
              error={bescheidError}
              onCreateManual={handleCreateManualBescheid}
              creatingManual={bescheidCreating}
            />

            <ZweitpruefungsCard
              antragId={id!}
              antragStatus={antrag.status}
              withKi={false}
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
                          <DialogDescription>
                            Optionaler Kommentar (im Audit-Trail sichtbar).
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
