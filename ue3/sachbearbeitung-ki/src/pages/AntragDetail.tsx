import { Fragment, useState, type ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, FileText, Trash2 } from "lucide-react";
import { useAntrag, type AnlageRow, type AntragFull } from "../hooks/useAntrag";
import { useBescheide, type BescheidRow } from "../hooks/useBescheide";
import { usePruefung } from "../hooks/usePruefung";
import { useSession } from "../hooks/useSession";
import { StatusBadge } from "../components/StatusBadge";
import { HistoryTimeline } from "../components/HistoryTimeline";
import { AnlageDownload } from "../components/AnlageDownload";
import { allowedTransitions, isReverseTransition, STATUS_LABELS, type Status } from "../lib/workflow";
import { formatEuro, formatDateTime, formatDate, formatAdresse } from "../lib/format";
import { supabase } from "../lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PruefungsCard } from "../components/PruefungsCard";
import { ZweitpruefungsCard } from "../components/ZweitpruefungsCard";
import { BescheideListe } from "../components/BescheideListe";
import { VorjahresVergleich } from "../components/VorjahresVergleich";
import { AntragMetricsBar } from "../components/AntragMetricsBar";
import { ExterneValidierungCard } from "../components/ExterneValidierungCard";
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

// ════════════════════════════════════════════════════════════════════
// AntragDetail — Akte mit dokumentartiger Anmutung
// Links: Antragsformular als „bedrucktes Papier" (Briefkopf · Titelblock ·
//   § 1-6 · Submission-Footer)
// Rechts: Werkzeug-Sidebar (Aktionen · KI-Prüfung · Verlauf)
// ════════════════════════════════════════════════════════════════════

export function AntragDetail() {
  const { id } = useParams<{ id: string }>();
  // WICHTIG: alle Hooks unconditionally aufrufen — Rules of Hooks (React #310).
  // Early returns für loading/error dürfen ERST NACH allen Hook-Calls kommen.
  const {
    antrag, anlagen, belegpositionen, oeffnungszeiten, history,
    loading, error, changeStatus, reload,
  } = useAntrag(id);
  const { session } = useSession();
  const {
    bescheide, creating: bescheidCreating, error: bescheidError,
    erstelleBescheid, downloadBescheidPdf, downloadBescheidDocx, loeschBescheid,
  } = useBescheide(antrag?.id);
  const { latest: letztePruefung } = usePruefung(antrag?.id);
  const [confirmTo, setConfirmTo] = useState<Status | null>(null);
  const [kommentar, setKommentar] = useState("");
  const [busy, setBusy] = useState(false);
  const [bewilligteSumme, setBewilligteSumme] = useState<string>("");
  // Manuell aktivierter Workflow ohne vorherige KI-Prüfung
  const [manuellOhneKi, setManuellOhneKi] = useState(false);

  if (loading) return <div className="p-8 text-slate-500">Lade …</div>;
  if (error || !antrag)
    return (
      <div className="p-8 text-rose-700">
        Fehler: {error ?? "Antrag nicht gefunden"}
      </div>
    );

  const folgeStatus = allowedTransitions(antrag.status);
  const sachbearbeiterEmail = session?.user?.email ?? null;
  const istEntscheidungsStatus = (s: Status) =>
    s === "bewilligt" || s === "abgelehnt" || s === "rueckfrage";

  async function handleStatusChange() {
    if (!confirmTo) return;
    const reverse = antrag ? isReverseTransition(antrag.status, confirmTo) : false;
    // Reverse-Übergänge verlangen einen Pflicht-Kommentar (Audit-Trail)
    if (reverse && !kommentar.trim()) {
      alert("Korrektur-Übergänge benötigen einen Kommentar.");
      return;
    }
    setBusy(true);
    const result = await changeStatus(confirmTo, kommentar);
    if (result.error) {
      alert("Fehler: " + result.error);
      setBusy(false);
      return;
    }
    // Bei Vorwärts-Entscheidung: zusätzlich Bescheid-PDF erstellen.
    // Bei Reverse-Übergang: KEIN Bescheid (es ist eine Aufhebung).
    if (!reverse && istEntscheidungsStatus(confirmTo)) {
      const summe =
        confirmTo === "bewilligt" && bewilligteSumme.trim()
          ? Number(bewilligteSumme.replace(",", "."))
          : null;
      await erstelleBescheid({
        entscheidung: confirmTo,
        bewilligte_summe_euro: Number.isFinite(summe ?? NaN) ? summe : null,
        bearbeiter_kommentar: kommentar || null,
        ausgestellt_von: sachbearbeiterEmail,
      });
    }
    setBusy(false);
    setConfirmTo(null);
    setKommentar("");
    setBewilligteSumme("");
  }

  async function openBescheidPdf(path: string) {
    const url = await downloadBescheidPdf(path);
    if (url) window.open(url, "_blank", "noopener");
    else alert("Bescheid-PDF nicht abrufbar.");
  }

  /** Direkt aus der KI-Empfehlung den passenden Workflow-Dialog öffnen.
   * Mapped aktion → Status, dann setzt confirmTo, was den existierenden
   * Bestätigungs-Dialog (mit Kommentar + ggf. Summe) öffnet. */
  function applyEmpfehlung(aktion: "bewilligen" | "rueckfrage" | "ablehnen") {
    const targetStatus: Status =
      aktion === "bewilligen" ? "bewilligt" :
      aktion === "ablehnen"   ? "abgelehnt" :
      "rueckfrage";
    setConfirmTo(targetStatus);
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 relative sticky top-0 z-30">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-wue-rot" />
        <div className="w-full px-4 lg:px-8 py-4 flex items-center gap-3">
          <Link
            to="/inbox"
            className="text-sm text-slate-500 flex items-center gap-1 hover:text-wue-rot"
          >
            <ArrowLeft className="h-4 w-4" /> Inbox
          </Link>
          <span className="text-slate-300">·</span>
          <h1 className="text-lg font-bold font-mono">{antrag.antragsnummer}</h1>
          <StatusBadge status={antrag.status} />
        </div>
      </header>

      {/* Prozess-Indikator: zeigt, wo der Antrag im Workflow steht
          + KPI-Streifen mit Bearbeitungsmetriken (Tage seit Einreichung,
          aktive Bearbeitung, KI-Läufe etc.). Bewusst Prozess- statt
          Personen-Sicht. */}
      <div className="w-full px-4 lg:px-8 pt-6">
        <StatusFlow status={antrag.status} />
        <AntragMetricsBar
          antrag={antrag}
          history={history}
          bescheideCount={bescheide.length}
        />
      </div>

      <main className="w-full px-4 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* ═══════════════════ DOKUMENT (LINKS) ═══════════════════ */}
        <article className="lg:col-span-2 bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
          {/* Briefkopf */}
          <div className="bg-wue-rot text-white px-10 lg:px-14 py-3 flex flex-wrap items-baseline justify-between gap-2">
            <div className="font-semibold tracking-[0.2em] text-sm">STADT WÜRZBURG</div>
            <div className="text-xs opacity-90 tracking-wide">
              Sozialreferat · Beratungsstelle für Senioren
            </div>
          </div>

          {/* Titelblock — Antrags-Klassifikation als Kategorie-Label, Einrichtungs-
              name als visueller Anker (nicht der Antragstyp). */}
          <div className="px-10 lg:px-14 pt-8 pb-6 border-b border-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-medium">
                  Förderantrag · Altentagesstätten APL 2
                </div>
                <div
                  className="text-[10.5px] text-slate-400 italic mt-0.5 leading-tight max-w-[60ch]"
                  title="APL 2 ist nur das Aktenzeichen — die geltende Rechtsgrundlage ist die AHP-Förderrichtlinie der Stadt Würzburg (Stand 2025-03-27). Der ursprüngliche Altenhilfeplan wurde aufgehoben."
                >
                  Aktenzeichen — Rechtsgrundlage:
                  AHP-Förderrichtlinie Stadt Würzburg (Stand 2025-03-27)
                </div>
                <h1 className="text-xl font-semibold text-slate-700 mt-1.5">
                  Betriebs- und Personalkostenzuschuss
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Haushaltsjahr{" "}
                  <span className="font-semibold text-slate-800 tabular-nums">{antrag.haushaltsjahr}</span>
                  <span className="mx-2 text-slate-300">·</span>
                  Würzburg, <span className="text-slate-800">{formatDate(antrag.antragsdatum)}</span>
                  <span
                    className="text-[10.5px] text-slate-400 italic ml-1"
                    title="Antragsdatum aus dem Antragsformular (Bürger-Angabe). Eingangsdatum im System siehe Footer."
                  >
                    (Antragsdatum lt. Bürger)
                  </span>
                </p>
              </div>
              <div className="text-right shrink-0 text-xs">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Aktenzeichen</div>
                <div className="font-mono text-sm font-semibold text-slate-900 mt-0.5">
                  {antrag.antragsnummer}
                </div>
                <div className="mt-2">
                  <StatusBadge status={antrag.status} />
                </div>
              </div>
            </div>

            {/* Einrichtungs-Block — DAS ist der visuelle Anker */}
            <div className="mt-7 border-l-[3px] border-wue-rot pl-5">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                Einrichtung
              </div>
              <div className="text-[22px] font-bold text-slate-900 mt-0.5 leading-tight">
                {antrag.name}
              </div>
              <div className="text-sm text-slate-700 mt-0.5">{antrag.traeger}</div>
              <div className="text-sm text-slate-600 mt-1">
                {formatAdresse(antrag.strasse, antrag.hausnummer, antrag.plz, antrag.ort)}
              </div>
            </div>

            {/* Antrags-Summary: Beantragte Summe + Förderbereich + Bezug zur
                AHP-Förderhöchstgrenze auf einen Blick. */}
            <AntragSummaryStrip antrag={antrag} onChanged={reload} />
          </div>

          {/* §§ Abschnitte */}
          <div className="px-10 lg:px-14 py-10 space-y-12">
            {/* Vorjahres-Vergleich — direkt oberhalb der §-Abschnitte,
                damit Auffälligkeiten gegenüber Vorjahr sofort kontextualisieren. */}
            <VorjahresVergleich antragId={antrag.id} />

            <DocSection num="§ 1" title="Antragsteller / Träger">
              <FieldGrid>
                <DocField label="Trägerverein / Organisation" className="sm:col-span-2">
                  {antrag.traeger}
                </DocField>
                <DocField label="Ansprechpartner/in" className="sm:col-span-2">
                  {antrag.ansprechpartner}
                </DocField>
                <DocField label="Telefon">
                  <a
                    href={`tel:${antrag.telefon.replace(/\s+/g, "")}`}
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
              </FieldGrid>
            </DocSection>

            <DocSection num="§ 2" title="Räumlichkeiten">
              <FieldGrid>
                {/* Seit Migration 048 (Voll-Sync zum PDF, 2026-05-24) sind beide
                    Räume-Felder wieder Pflicht — direkter Render ohne NULL-Fallback. */}
                <DocField label="Räume vorhanden">
                  <YesNo value={antrag.raeume_vorhanden} />
                </DocField>
                <DocField label="Räume unentgeltlich überlassen">
                  <YesNo value={antrag.raeume_unentgeltlich} />
                </DocField>
                <DocField label="Anschrift Einrichtung" className="sm:col-span-2">
                  {formatAdresse(antrag.strasse, antrag.hausnummer, antrag.plz, antrag.ort)}
                </DocField>
                {antrag.miete_jahr_euro > 0 && (
                  <DocField label="Jahresmiete (Eigenangabe)" className="sm:col-span-2">
                    <span className="text-slate-700 tabular-nums">
                      {formatEuro(antrag.miete_jahr_euro)}
                    </span>
                    <span className="block text-[11px] text-slate-500 italic mt-0.5">
                      Vom Antragsteller mitgeteilt — für Förderbereich III
                      keine prüfungsrelevante Bemessung (siehe § 5).
                    </span>
                  </DocField>
                )}
              </FieldGrid>
            </DocSection>

            <DocSection num="§ 3" title="Bankverbindung">
              <FieldGrid>
                <DocField label="Kreditinstitut" className="sm:col-span-2">
                  {antrag.bankverbindung}
                </DocField>
                <DocField label="IBAN" className="sm:col-span-2">
                  <span className="font-mono text-[15px] tracking-wide text-slate-900">
                    {formatIban(antrag.iban)}
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

            <DocSection
              num="§ 4"
              title="Förderbereich & beantragte Förderung"
              subtitle="Förderbereich, Förderhöchstgrenze und beantragte Summe"
            >
              <FoerderblockKomplett antrag={antrag} onChanged={reload} />
            </DocSection>

            <DocSection
              num="§ 4a"
              title="Bemessungsgrundlage Vorjahr"
              subtitle="Stadt-Anteil bestimmt die Auszahlung; Teilnehmer + Veranstaltungen gewichten die Zuwendung (AHP 2.3 Pkt. 2)"
            >
              <BemessungsblockVorjahr antrag={antrag} />
            </DocSection>

            <DocSection
              num="§ 5"
              title="Kostenpositionen (vom Antragsteller mitgeteilt)"
              subtitle="Tätigkeitsnachweis; für Förderbereich III gem. AHP 3.8 nur auf Anfrage einzureichen — keine Bemessungsgrundlage"
            >
              <KostenTabelle
                items={belegpositionen}
                pauschalHinweis={antrag.foerderbereich !== "struktur_schwerpunktfoerderung"}
              />
            </DocSection>

            <DocSection num="§ 6" title="Wochenplan / Öffnungszeiten">
              <Wochenplan zeiten={oeffnungszeiten} />
            </DocSection>

            <DocSection
              num="§ 7"
              title="Anlagen"
              subtitle="Mit dem Antrag eingereichte Belege"
            >
              <AnlagenListe anlagen={anlagen} />
            </DocSection>
          </div>

          {/* Submission-Footer (wie Eingangsstempel) */}
          <div className="bg-slate-50 border-t-2 border-slate-200 px-10 lg:px-14 py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-4 text-xs">
              <div className="text-slate-500">
                <span className="font-semibold uppercase tracking-wider">Antragsdatum lt. Bürger</span>
                <span className="ml-2 text-slate-700">
                  {formatDate(antrag.antragsdatum)}
                </span>
                <span className="ml-3 text-slate-400">·</span>
                <span className="ml-3 font-semibold uppercase tracking-wider">Eingegangen</span>
                <span className="ml-2 text-slate-700">
                  {formatDateTime(antrag.submitted_at)}
                </span>
                <span className="ml-3 text-slate-400">·</span>
                <span className="ml-3">
                  Sprache <span className="text-slate-700">{antrag.submitted_language.toUpperCase()}</span>
                </span>
                {antrag.ip_address && (
                  <>
                    <span className="ml-3 text-slate-400">·</span>
                    <span className="ml-3 font-mono">{antrag.ip_address}</span>
                  </>
                )}
              </div>
              <div className="text-slate-400 text-[11px] font-mono">
                Elektronische Einreichung — keine Unterschrift erforderlich
              </div>
            </div>
            {antrag.user_agent && (
              <div className="mt-1 truncate text-[11px] text-slate-400" title={antrag.user_agent}>
                {antrag.user_agent}
              </div>
            )}
          </div>
        </article>

        {/* ═══════════════════ WERKZEUG-SIDEBAR (RECHTS) ═══════════════════
            Sticky-positioniert, damit Aktionen + KI-Prüfung beim Scrollen
            des Dokuments sichtbar bleiben. Eigener Scroll-Container, falls
            der Inhalt höher als der Viewport wird (z.B. viele Befunde). */}
        <aside className="space-y-4 lg:sticky lg:top-[5.25rem] lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
          {/* KI-Prüfung zuerst: primäres Werkzeug zur Diagnose.
              Workflow/Status-Wechsel kommt erst NACH der Diagnose. */}
          <PruefungsCard
            antragId={antrag.id}
            onApplyEmpfehlung={applyEmpfehlung}
            onManuellStarten={() => setManuellOhneKi(true)}
          />

          {/* Externe Validierung (Layer D) — Realitäts-Check gegen
              öffentliche Web-Quellen. Wird auf Knopfdruck getriggert,
              weil API-Latenz und -Kosten anfallen. */}
          <ExterneValidierungCard antragId={antrag.id} />

          {(letztePruefung || manuellOhneKi) && (
          <Card>
            <CardHeader>
              <CardTitle>Workflow · Status-Wechsel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {folgeStatus.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Keine Übergänge verfügbar.
                </p>
              ) : (
                folgeStatus.map((s) => {
                  const reverse = isReverseTransition(antrag.status, s);
                  return (
                  <Dialog
                    key={s}
                    open={confirmTo === s}
                    onOpenChange={(open) => !open && setConfirmTo(null)}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className={
                          reverse
                            ? "w-full justify-start text-slate-500 hover:text-slate-900 border-dashed"
                            : "w-full justify-start"
                        }
                        onClick={() => setConfirmTo(s)}
                        title={
                          reverse
                            ? "Korrektur-Übergang (Audit-Eintrag mit Pflicht-Kommentar)"
                            : undefined
                        }
                      >
                        {reverse ? "↶" : "→"} {STATUS_LABELS[s]}
                        {reverse && (
                          <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-400">
                            Korrektur
                          </span>
                        )}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {reverse
                            ? `Status zurücksetzen auf „${STATUS_LABELS[s]}"?`
                            : `Status auf „${STATUS_LABELS[s]}" setzen?`}
                        </DialogTitle>
                        <DialogDescription>
                          {reverse
                            ? "Korrektur-Übergang: bisherige Entscheidung wird aufgehoben. Bitte Grund im Kommentar dokumentieren (Pflicht, Audit-Trail)."
                            : istEntscheidungsStatus(s)
                              ? "Erzeugt zusätzlich automatisch einen PDF-Bescheid mit der regelbasierten Begründung aus der letzten KI-Prüfung."
                              : "Optional kannst du einen Kommentar hinterlassen (im Audit-Trail sichtbar)."}
                        </DialogDescription>
                      </DialogHeader>
                      {s === "bewilligt" && (() => {
                        // Cap dynamisch aus foerderbereichMeta lesen, damit das
                        // Label nicht hartcodiert auf BZ (10.000 €) zeigt, wenn
                        // der Antrag z.B. ein Seniorenkreis (Cap 2.000 €) ist.
                        const fbMeta = foerderbereichMeta(antrag.foerderbereich);
                        const capLabel =
                          !antrag.foerderbereich
                            ? "Förderbereich noch nicht zugeordnet — bitte zuerst klassifizieren"
                            : fbMeta && fbMeta.hoechstgrenze !== null
                              ? `${fbMeta.ahpPath} Förderhöchstgrenze: ${formatEuro(fbMeta.hoechstgrenze)}`
                              : fbMeta
                                ? `${fbMeta.ahpPath} · keine feste Förderhöchstgrenze (Einzelfall)`
                                : "Förderhöchstgrenze nicht bestimmbar";
                        return (
                          <div className="space-y-1">
                            <label
                              htmlFor="bewilligte-summe"
                              className="text-[11px] uppercase tracking-wider text-slate-500 font-medium"
                            >
                              Bewilligte Fördersumme (€) · {capLabel}
                            </label>
                            <Input
                              id="bewilligte-summe"
                              placeholder="z.B. 8500.00"
                              value={bewilligteSumme}
                              onChange={(e) => setBewilligteSumme(e.target.value)}
                            />
                          </div>
                        );
                      })()}
                      <Textarea
                        placeholder={
                          istEntscheidungsStatus(s)
                            ? "Anmerkung für den Bescheid (wird im PDF mitgedruckt) …"
                            : "Kommentar (optional) …"
                        }
                        value={kommentar}
                        onChange={(e) => setKommentar(e.target.value)}
                      />
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setConfirmTo(null)}
                          disabled={busy || bescheidCreating}
                        >
                          Abbrechen
                        </Button>
                        <Button
                          onClick={handleStatusChange}
                          disabled={busy || bescheidCreating}
                        >
                          {busy || bescheidCreating
                            ? istEntscheidungsStatus(s)
                              ? "Status + Bescheid …"
                              : "Wird gespeichert …"
                            : istEntscheidungsStatus(s)
                              ? `${STATUS_LABELS[s]} + Bescheid erstellen`
                              : `Auf "${STATUS_LABELS[s]}" setzen`}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  );
                })
              )}
            </CardContent>
          </Card>
          )}

          <BescheideListe
            bescheide={bescheide}
            error={bescheidError}
            onOpen={(b) => b.pdf_storage_path && openBescheidPdf(b.pdf_storage_path)}
            onOpenDocx={async (b) => {
              const url = await downloadBescheidDocx(b.id);
              if (url) {
                const a = document.createElement("a");
                a.href = url;
                a.download = `bescheid_${b.id}.docx`;
                a.click();
                URL.revokeObjectURL(url);
              }
            }}
            onDelete={async (b) => {
              if (!confirm("Bescheid wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
              await loeschBescheid(b.id, b.pdf_storage_path);
            }}
          />

          {/* Zweitprüfung — erscheint nach Erstprüfung oder wenn Status
              zweitpruefung_* ist (Pflichtfall). */}
          {(letztePruefung || antrag.status?.startsWith("zweitpruefung_")) && (
            <ZweitpruefungsCard
              antragId={antrag.id}
              letzteErstpruefung={letztePruefung}
              zweitpruefungPflicht={
                antrag.status?.startsWith("zweitpruefung_") ||
                istZweitpruefungPflichtig(letztePruefung)
              }
              pflichtgrund={pflichtgrund(letztePruefung, antrag.status)}
            />
          )}

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
  );
}

// ─────────────────────────────────────────────────────────────────────
// Dokument-Helfer
// ─────────────────────────────────────────────────────────────────────

/** Nummerierter Akten-Abschnitt im Stil eines Verwaltungs-Formulars.
 * Klick auf die Überschrift klappt den Inhalt ein/aus — Sachbearbeiter
 * kann irrelevante Abschnitte zusammenfalten ohne sie zu verlieren. */
function DocSection({
  num, title, subtitle, children, defaultOpen = true,
}: {
  num: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 mb-4 group text-left"
        aria-expanded={open}
      >
        <ChevronDown
          className={
            "h-4 w-4 text-slate-400 group-hover:text-wue-rot transition-transform shrink-0 " +
            (open ? "" : "-rotate-90")
          }
          aria-hidden="true"
        />
        <span className="text-slate-400 font-semibold text-base tabular-nums">{num}</span>
        <h2 className="text-[15px] font-semibold text-slate-900 tracking-tight group-hover:text-wue-rot transition-colors">
          {title}
        </h2>
        {subtitle && <span className="text-xs text-slate-500">— {subtitle}</span>}
      </button>
      {open && <div className="ml-[3.75rem]">{children}</div>}
    </section>
  );
}

/** Zwei-Spalten-Feldraster für klassische Antragsdaten. */
function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5">
      {children}
    </div>
  );
}

/** Formularfeld mit Label oben und Wert auf gestrichelter Schreiblinie unten. */
function DocField({
  label, children, className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium mb-1">
        {label}
      </div>
      <div className="text-[15px] text-slate-900 pb-1 border-b border-dotted border-slate-300 min-h-[1.6rem]">
        {children}
      </div>
    </div>
  );
}

/** „ja"/„nein"-Darstellung im klassischen Formular-Checkboxen-Stil. */
function YesNo({ value }: { value: string }) {
  const isYes = value === "ja";
  return (
    <span className="inline-flex items-center gap-5 text-[15px]">
      <YesNoBox checked={isYes} label="ja" />
      <YesNoBox checked={!isYes} label="nein" />
    </span>
  );
}

function YesNoBox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={
          checked
            ? "inline-flex items-center justify-center w-4 h-4 border border-slate-900 bg-slate-900 text-white"
            : "inline-block w-4 h-4 border border-slate-400 bg-white"
        }
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className={checked ? "text-slate-900 font-medium" : "text-slate-400"}>
        {label}
      </span>
    </span>
  );
}

/** Strukturierte Kostentabelle gruppiert nach Belegtyp. */
type Beleg = {
  id: string;
  belegtyp: string;
  bezeichnung: string;
  betrag_euro: string | number;
};

const BELEG_LABELS: Record<string, string> = {
  miete: "Miete",
  personalkosten: "Personalkosten",
  betriebskosten: "Betriebskosten",
};

function KostenTabelle({
  items,
  pauschalHinweis = false,
}: {
  items: Beleg[];
  pauschalHinweis?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-slate-600 bg-slate-50 border-l-2 border-slate-300 px-3 py-2 rounded-r">
        <strong>Keine Belegpositionen erfasst.</strong> Das ist für
        Förderbereich III gem. <strong>AHP 3.8</strong> regelkonform:
        „Belege sind nur auf Anfrage einzureichen". Bei Bedarf können
        die Belege im Verwendungsnachweis (1. April Folgejahr)
        nachgefordert werden.
      </div>
    );
  }
  const gruppen = (["miete", "personalkosten", "betriebskosten"] as const)
    .map((typ) => {
      const ts = items.filter((b) => b.belegtyp === typ);
      const summe = ts.reduce((s, b) => s + Number(b.betrag_euro), 0);
      return { typ, items: ts, summe };
    })
    .filter((g) => g.items.length > 0);
  const gesamt = items.reduce((s, b) => s + Number(b.betrag_euro), 0);

  return (
    <div>
      {pauschalHinweis && (
        <div className="mb-3 text-xs text-slate-700 bg-amber-50 border-l-2 border-amber-500 px-3 py-2 rounded-r">
          <strong>Hinweis zur Bemessungsrolle:</strong> Diese Positionen
          sind vom Antragsteller mitgeteilt und dienen als <strong>Tätigkeits­
          nachweis</strong>. Sie bestimmen <strong>nicht</strong> die
          Förderhöhe — die ist eine AHP-Pauschale
          (AHP 2.3 Pkt. 2 (Begegnungszentren)), die anteilig nach
          Stadt-Bewohner-Anteil ausgezahlt wird (Verwaltungspraxis
          Sozialreferat — kuratierte Auslegung, siehe
          ahp_norm_statements 2.3). Gem. AHP 3.8 sind Belege für diesen
          Förderbereich nur auf Anfrage einzu­reichen.
        </div>
      )}
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-[0.12em] text-slate-500 font-medium">
            <th className="text-left py-1 pr-3 w-[14rem]">Belegtyp</th>
            <th className="text-left py-1 pr-3">Bezeichnung</th>
            <th className="text-right py-1 w-[8rem]">Betrag (Jahr)</th>
          </tr>
        </thead>
        <tbody>
          {gruppen.map((g, gi) => (
            <Fragment key={g.typ}>
              {g.items.map((b, i) => (
                <tr
                  key={b.id}
                  className={i === 0 && gi > 0 ? "border-t border-slate-200" : ""}
                >
                  <td className="py-1.5 pr-3 align-top">
                    {i === 0 && (
                      <span className="text-slate-700 font-medium">{BELEG_LABELS[g.typ] ?? g.typ}</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-800">{b.bezeichnung}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-900">
                    {formatEuro(Number(b.betrag_euro))}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-1 pr-3 text-xs uppercase tracking-wider text-slate-500">
                  Summe {BELEG_LABELS[g.typ] ?? g.typ}
                </td>
                <td></td>
                <td className="py-1 text-right tabular-nums text-slate-700 border-t border-slate-100">
                  {formatEuro(g.summe)}
                </td>
              </tr>
            </Fragment>
          ))}
          <tr className="border-t-2 border-slate-800">
            <td className="pt-2 text-[12px] uppercase tracking-wider text-slate-700 font-semibold">
              Gesamtsumme
            </td>
            <td></td>
            <td className="pt-2 text-right text-[17px] font-bold tabular-nums text-slate-900">
              {formatEuro(gesamt)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Wochenplan im Formular-Tabellenstil. */
const TAG_LABELS: Record<string, string> = {
  mo: "Montag", di: "Dienstag", mi: "Mittwoch", do: "Donnerstag",
  fr: "Freitag", sa: "Samstag", so: "Sonntag",
};

function Wochenplan({
  zeiten,
}: {
  zeiten: Array<{ wochentag: string; oeffnungszeit: string | null; angebot: string | null }>;
}) {
  if (zeiten.length === 0) {
    return <p className="text-sm text-slate-500 italic">Kein Wochenplan hinterlegt.</p>;
  }
  return (
    <table className="w-full text-[14px]">
      <thead>
        <tr className="text-[10.5px] uppercase tracking-[0.12em] text-slate-500 font-medium">
          <th className="text-left py-1 pr-3 w-[8rem]">Tag</th>
          <th className="text-left py-1 pr-3 w-[10rem]">Öffnungszeit</th>
          <th className="text-left py-1">Angebot</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {(["mo", "di", "mi", "do", "fr", "sa", "so"] as const).map((tag) => {
          const eintrag = zeiten.find((o) => o.wochentag === tag);
          const aktiv = !!eintrag?.oeffnungszeit;
          return (
            <tr key={tag} className={aktiv ? "" : "text-slate-400"}>
              <td className="py-2 pr-3 font-medium">{TAG_LABELS[tag]}</td>
              <td className="py-2 pr-3 tabular-nums">
                {eintrag?.oeffnungszeit ?? "geschlossen"}
              </td>
              <td className="py-2">{eintrag?.angebot ?? ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Anlagen-Liste im Akten-Stil. */
function AnlagenListe({ anlagen }: { anlagen: AnlageRow[] }) {
  if (anlagen.length === 0) {
    return (
      <p className="text-sm text-slate-500 italic flex items-center gap-2">
        <FileText className="h-4 w-4" /> Keine Anlagen beigefügt.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {anlagen.map((a) => (
        <AnlageDownload key={a.id} anlage={a} />
      ))}
    </div>
  );
}

/** IBAN in 4er-Blöcke gruppieren für bessere Lesbarkeit. */
function formatIban(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

/** Trigger-Logik für die Pflicht-Zweitprüfung, gespiegelt aus dem
 *  Backend (pruefung-service main._zweitpruefung_erforderlich) — wir
 *  duplizieren bewusst die kleine Heuristik im Frontend, damit das UI
 *  ohne Server-Roundtrip schon ableitet, dass eine Zweitprüfung Pflicht
 *  ist. Quelle der Wahrheit bleibt das Backend (es schaltet den Status). */
function istZweitpruefungPflichtig(letztePruefung: { ergebnis_jsonb?: { empfehlung?: { aktion: string } } } | null): boolean {
  const aktion = letztePruefung?.ergebnis_jsonb?.empfehlung?.aktion;
  if (aktion === "ablehnen") return true;
  // 'bewilligen + > 5.000€' können wir hier nicht prüfen, weil wir die
  // *bewilligte* Summe noch nicht kennen — erst beim Status-Wechsel
  // 'bewilligt' kommt die durch. Wir geben dafür false zurück und der
  // Sachbearbeiter sieht 'optional'. Backend setzt zweitpruefung_offen
  // beim Klick auf 'Bewilligen + Bescheid'.
  return false;
}

function pflichtgrund(letztePruefung: { ergebnis_jsonb?: { empfehlung?: { aktion: string } } } | null, status: string | undefined): string | undefined {
  if (status === "zweitpruefung_dissens") return "Erst- und Zweitprüfung im Dissens — bitte auflösen.";
  if (letztePruefung?.ergebnis_jsonb?.empfehlung?.aktion === "ablehnen")
    return "KI empfiehlt Ablehnung — Vier-Augen-Prinzip vorgeschrieben.";
  return undefined;
}

/** Antrags-Summary-Streifen direkt unter dem Hero — beantwortet auf einen
 * Blick: "Was ist die Antragssumme?" und "Liegt sie innerhalb der
 * AHP-Förderhöchstgrenze?" */
function AntragSummaryStrip({
  antrag, onChanged,
}: {
  antrag: AntragFull;
  onChanged?: () => void | Promise<void>;
}) {
  const meta = foerderbereichMeta(antrag.foerderbereich);
  const wert = antrag.geforderte_foerdersumme_euro;
  if (wert === null || wert === undefined) {
    return (
      <div className="mt-6 bg-amber-50/60 border border-amber-200 rounded-sm px-5 py-3 text-sm">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div className="text-amber-900">
            <span className="font-medium">Bürger hat keine konkrete Fördersumme beantragt</span>
            <span className="block text-xs text-amber-800/80 mt-0.5">
              Webformular und PDF-Antrag fragen die Summe nicht zwingend ab —
              bitte hier ergänzen, sobald sie vorliegt.
            </span>
          </div>
          <FoerdersummeEditButton antrag={antrag} onChanged={onChanged} />
        </div>
      </div>
    );
  }
  const hoechstgrenze = meta?.hoechstgrenze ?? null;
  const ueber = hoechstgrenze !== null && wert > hoechstgrenze;
  return (
    <div
      className={
        "mt-6 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 border rounded-sm px-5 py-4 " +
        (ueber
          ? "bg-wue-rot-soft/40 border-wue-rot/40"
          : "bg-slate-50 border-slate-200")
      }
    >
      <div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500 font-medium">
          Beantragte Förderung (Jahr)
        </div>
        <div
          className={
            "text-3xl font-bold tabular-nums leading-tight mt-0.5 " +
            (ueber ? "text-wue-rot" : "text-slate-900")
          }
        >
          {formatEuro(wert)}
        </div>
      </div>
      <div className="sm:border-l sm:border-slate-300 sm:pl-4 flex flex-col justify-center">
        {meta ? (
          <>
            <div className="text-sm text-slate-700">
              <span className="font-medium">{meta.label}</span>
            </div>
            {hoechstgrenze !== null && (
              <div className="text-xs text-slate-500 mt-1">
                {meta.ahpPath}: Förderhöchstgrenze {formatEuro(hoechstgrenze)} / Jahr
                {ueber && (
                  <span className="ml-2 text-wue-rot font-medium">
                    · {formatEuro(wert - hoechstgrenze)} darüber
                  </span>
                )}
              </div>
            )}
            {hoechstgrenze === null && (
              <div className="text-xs text-slate-500 mt-1">
                {meta.ahpPath} · keine feste Förderhöchstgrenze (Einzelfall-Bewilligung)
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-slate-500 italic">
            Förderbereich nicht zugeordnet — Förderhöchstgrenze unbestimmt.
          </div>
        )}
      </div>
    </div>
  );
}

/** Zeigt den Rechenweg Förderhöchstgrenze × Stadtbewohner-Anteil =
 * maximale Auszahlung (nur für anteilsskalierte Förderbereiche:
 * Begegnungszentren + Bildungsträger nach AHP 2.3 Pkt. 2 / Pkt. 3).
 * Markiert ob die Forderung im Rahmen liegt. */
function KalkulationsFormel({
  antrag, meta,
}: {
  antrag: AntragFull;
  meta: FoerderbereichMeta | null;
}) {
  // Nur für BZ + Bildungsträger relevant
  if (
    !meta ||
    !meta.hoechstgrenze ||
    (antrag.foerderbereich !== "begegnungszentren" &&
      antrag.foerderbereich !== "bildungstraeger")
  ) {
    return null;
  }
  const anteil = antrag.stadtbewohner_anteil;
  const wert = antrag.geforderte_foerdersumme_euro;
  if (anteil === null || anteil === undefined) {
    return (
      <div className="bg-slate-50 border-l-2 border-slate-300 px-4 py-3 text-xs text-slate-600">
        <div className="font-medium text-slate-700 mb-1">Auszahlungs-Kalkulation</div>
        Maximale Auszahlung = Förderhöchstgrenze × Anteil der Würzburger
        Teilnehmer (AHP {meta.ahpPath}). Anteil nicht erfasst — bitte
        beim Träger nachfragen.
      </div>
    );
  }
  const maxAuszahlung = meta.hoechstgrenze * anteil;
  const innerhalb = wert !== null && wert <= maxAuszahlung + 0.005;
  return (
    <div
      className={
        "border-l-2 px-4 py-3 " +
        (innerhalb
          ? "bg-slate-50 border-slate-400"
          : "bg-wue-rot-soft/40 border-wue-rot")
      }
    >
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium mb-2">
        Auszahlungs-Kalkulation (AHP {meta.ahpPath})
      </div>
      <div className="flex items-baseline gap-2 flex-wrap text-sm tabular-nums">
        <span className="text-slate-700">{formatEuro(meta.hoechstgrenze)}</span>
        <span className="text-slate-400">×</span>
        <span className="text-slate-700">{Math.round(anteil * 100)} %</span>
        <span className="text-slate-400">=</span>
        <span className="text-slate-900 font-bold">{formatEuro(maxAuszahlung)}</span>
        <span className="text-xs text-slate-500 ml-1">max. Auszahlung</span>
      </div>
      {wert !== null && (
        <div className="mt-2 text-xs">
          {innerhalb ? (
            <span className="text-slate-600">
              Forderung {formatEuro(wert)}
              {wert === maxAuszahlung
                ? " entspricht exakt diesem Maximum."
                : ` liegt ${formatEuro(maxAuszahlung - wert)} darunter.`}
            </span>
          ) : (
            <span className="text-wue-rot font-medium">
              ✖ Forderung übersteigt das Maximum um{" "}
              {formatEuro(wert - maxAuszahlung)}.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Komplette § 4-Anzeige: Förderbereich-Pill, Fördersumme + Förder-
 * höchstgrenze, Skalierungs-Kennzahlen, Pflichtangaben — alles
 * kontextsensitiv je nach Förderbereich. */
/**
 * Bemessungsgrundlage gem. AHP 2.3 Förderbereich III, Pkt. 2
 * (Begegnungszentren). Zeigt die drei rechtlich relevanten Größen:
 *
 *  - stadtbewohner_anteil → Auszahlungsanteil (Pflicht für Bescheid)
 *  - anzahl_teilnehmer    → Gewichtungsgröße aus dem Budget
 *  - anzahl_treffen_jahr  → Gewichtungsgröße aus dem Budget
 *
 * Bei NULL-Werten wird ein Warnhinweis statt eines Pseudo-Wertes
 * angezeigt — dann ist der Antrag nicht entscheidungsreif.
 */
function BemessungsblockVorjahr({ antrag }: { antrag: AntragFull }) {
  const anteilPct =
    antrag.stadtbewohner_anteil === null
      ? null
      : `${(antrag.stadtbewohner_anteil * 100).toFixed(1).replace(".", ",")} %`;
  const fehlend: string[] = [];
  if (antrag.stadtbewohner_anteil === null) fehlend.push("Stadt-Anteil");
  if (antrag.anzahl_teilnehmer === null) fehlend.push("Teilnehmer:innen");
  if (antrag.anzahl_treffen_jahr === null) fehlend.push("Veranstaltungen");

  return (
    <div className="space-y-4">
      <FieldGrid>
        <DocField label="Anteil Stadt-Bewohner:innen Würzburg (Vorjahr)" className="sm:col-span-2">
          {anteilPct !== null ? (
            <>
              <span className="text-2xl font-bold tabular-nums text-wue-rot">{anteilPct}</span>
              <span className="block text-[11px] text-slate-500 italic mt-0.5">
                Bestimmt direkt den prozentualen Auszahlungsanteil
                (AHP 2.3 Pkt. 2: „erfolgt die Auszahlung des prozentualen Anteils").
              </span>
            </>
          ) : (
            <span className="text-slate-400">— nicht angegeben</span>
          )}
        </DocField>
        <DocField label="Teilnehmer:innen gesamt (Vorjahr)">
          {antrag.anzahl_teilnehmer !== null ? (
            <span className="text-slate-900 tabular-nums font-medium">
              {antrag.anzahl_teilnehmer.toLocaleString("de-DE")}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </DocField>
        <DocField label="Veranstaltungen (Vorjahr)">
          {antrag.anzahl_treffen_jahr !== null ? (
            <span className="text-slate-900 tabular-nums font-medium">
              {antrag.anzahl_treffen_jahr.toLocaleString("de-DE")}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </DocField>
      </FieldGrid>
      {fehlend.length > 0 && (
        <div className="text-xs text-amber-900 bg-amber-50 border-l-2 border-amber-500 px-3 py-2 rounded-r">
          <strong>Antrag nicht entscheidungsreif:</strong> fehlende Bemessungs­
          angabe(n) — {fehlend.join(", ")}. Ohne diese Werte kann die
          anteilige Auszahlung gem. AHP 2.3 Pkt. 2 nicht berechnet werden.
        </div>
      )}
    </div>
  );
}

function FoerderblockKomplett({
  antrag, onChanged,
}: {
  antrag: AntragFull;
  onChanged?: () => void | Promise<void>;
}) {
  const meta = foerderbereichMeta(antrag.foerderbereich);
  return (
    <div className="space-y-6">
      {/* (1) Förderbereich-Pill */}
      <div>
        <div className="flex items-baseline justify-between mb-2 gap-2">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium">
            AHP-Förderbereich
          </div>
          <FoerderbereichEditButton antrag={antrag} onChanged={onChanged} />
        </div>
        {meta ? (
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="inline-flex items-center gap-2 bg-wue-rot-soft text-wue-rot-dark border border-wue-rot/30 px-3 py-1 rounded text-sm font-medium">
              {meta.label}
            </span>
            <span className="text-xs text-slate-500 font-mono">{meta.ahpPath}</span>
          </div>
        ) : (
          <div className="text-sm text-slate-500 italic">
            Förderbereich noch nicht zugeordnet. Ohne diese Angabe wird die
            Förderhöchstgrenze nicht geprüft — bitte nachpflegen.
          </div>
        )}
      </div>

      {/* (2) Fördersumme + Förderhöchstgrenze */}
      <div>
        <div className="flex items-baseline justify-between mb-1 gap-2">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium">
            Beantragte Förderung
          </div>
          <FoerdersummeEditButton antrag={antrag} onChanged={onChanged} />
        </div>
        <FoerdersummeMitHoechstgrenze
          wert={antrag.geforderte_foerdersumme_euro}
          hoechstgrenze={meta?.hoechstgrenze ?? null}
          hoechstgrenzeLabel={meta?.ahpPath ?? null}
        />
      </div>

      {/* (2b) Kalkulationsformel — nur wenn Förderbereich anteilsskaliert */}
      <KalkulationsFormel antrag={antrag} meta={meta} />

      {/* (3) Skalierungs-Kennzahlen (kontextsensitiv) */}
      <KennzahlenBlock antrag={antrag} meta={meta} />

      {/* (4) Pflichtangaben (kontextsensitiv) */}
      <PflichtangabenBlock antrag={antrag} meta={meta} />

      {/* (5) Zuwendungszweck — nur bei FB IV */}
      {antrag.foerderbereich === "struktur_schwerpunktfoerderung" && antrag.zuwendungszweck && (
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium mb-1">
            Zuwendungszweck · Pflichtangabe AHP 2.4
          </div>
          <p className="text-sm text-slate-900 leading-relaxed border-l-2 border-wue-rot pl-3 italic">
            {antrag.zuwendungszweck}
          </p>
        </div>
      )}
    </div>
  );
}

interface FoerderbereichMeta {
  label: string;
  ahpPath: string;
  /** Förderhöchstgrenze gemäß AHP (Wortlaut: "Zuschuss von bis zu X € pro Jahr").
   *  null wenn die AHP keinen festen Wert vorsieht (z.B. FB IV Einzelfall). */
  hoechstgrenze: number | null;
  /** Welche Skalierungs-Kennzahlen sind für diesen Förderbereich relevant? */
  zeigt: {
    stadtbewohner_anteil?: boolean;
    treffen_und_teilnehmer?: boolean;
    ehrenamt?: boolean;
    befristung?: boolean;
  };
  /** Pflichtangaben für diesen Förderbereich */
  pflicht: {
    finanzplanung?: boolean;
    projektskizze?: boolean;
  };
}

function foerderbereichMeta(fb: string | null): FoerderbereichMeta | null {
  if (!fb) return null;
  // Konvention: AHP-PDF nutzt für die Unterpunkte unter 2.3 die Notation
  // "Pkt. N" (z.B. „2.3 Förderbereich III, Pkt. 4 Seniorenkreise"). Wir
  // spiegeln das durchgängig — sowohl Doctree (Migration 050) als auch
  // ontologie_rules.paragraph_ref (Migration 049) verwenden dieses Format,
  // damit Tooltips, Bescheide und DB-Refs identisch lesen.
  const map: Record<string, FoerderbereichMeta> = {
    aufbau_niedrigschwellige_angebote: {
      label: "Förderbereich I — Aufbau niedrigschwelliger Angebote",
      ahpPath: "AHP 2.1",
      hoechstgrenze: 3000,
      zeigt: { befristung: true },
      pflicht: { projektskizze: true },
    },
    buergerschaftliches_engagement: {
      label: "Förderbereich II — Bürgerschaftliches Engagement",
      ahpPath: "AHP 2.2",
      // AHP 2.2: 750 € Pauschal + Staffel max 3.500 € = 4.250 €
      hoechstgrenze: 4250,
      zeigt: { ehrenamt: true },
      pflicht: {},
    },
    mehrgenerationenhaeuser: {
      label: "Förderbereich III — Mehrgenerationenhäuser",
      ahpPath: "AHP 2.3 Pkt. 1",
      hoechstgrenze: 10000,
      zeigt: {},
      pflicht: {},
    },
    begegnungszentren: {
      label: "Förderbereich III — Begegnungszentren",
      ahpPath: "AHP 2.3 Pkt. 2",
      hoechstgrenze: 10000,
      zeigt: { stadtbewohner_anteil: true },
      pflicht: {},
    },
    bildungstraeger: {
      label: "Förderbereich III — Bildungsträger / Bildungshäuser",
      ahpPath: "AHP 2.3 Pkt. 3",
      hoechstgrenze: 6000,
      zeigt: { stadtbewohner_anteil: true },
      pflicht: {},
    },
    seniorenkreise: {
      label: "Förderbereich III — Seniorenkreise",
      ahpPath: "AHP 2.3 Pkt. 4",
      hoechstgrenze: 2000,
      zeigt: { treffen_und_teilnehmer: true },
      pflicht: {},
    },
    quartiersmanagement_altenarbeit: {
      label: "Förderbereich III — Quartiersmanagement Altenarbeit",
      ahpPath: "AHP 2.3 Pkt. 5",
      hoechstgrenze: 7500,
      zeigt: {},
      pflicht: {},
    },
    struktur_schwerpunktfoerderung: {
      label: "Förderbereich IV — Struktur- und Schwerpunktförderung",
      ahpPath: "AHP 2.4",
      // AHP 2.4 sieht keine feste Förderhöchstgrenze vor — Einzelfall-Bewilligung
      hoechstgrenze: null,
      zeigt: {},
      pflicht: { finanzplanung: true },
    },
  };
  return map[fb] ?? null;
}

function FoerdersummeMitHoechstgrenze({
  wert, hoechstgrenze, hoechstgrenzeLabel,
}: {
  wert: number | null;
  hoechstgrenze: number | null;
  hoechstgrenzeLabel: string | null;
}) {
  if (wert === null || wert === undefined) {
    return (
      <div className="text-sm text-slate-500 italic">
        Keine Fördersumme angegeben.
      </div>
    );
  }
  const ueber = hoechstgrenze !== null && wert > hoechstgrenze;
  const pct = hoechstgrenze !== null ? Math.min((wert / hoechstgrenze) * 100, 130) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium">
          Geforderter Zuschuss (Jahr)
        </span>
        {hoechstgrenze !== null && (
          <span className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500">
            Förderhöchstgrenze ({hoechstgrenzeLabel ?? "—"})
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between">
        <span
          className={
            ueber
              ? "text-2xl font-bold text-wue-rot tabular-nums"
              : "text-2xl font-bold text-slate-900 tabular-nums"
          }
        >
          {formatEuro(wert)}
        </span>
        {hoechstgrenze !== null && (
          <span className="text-sm text-slate-500 tabular-nums">
            {formatEuro(hoechstgrenze)} / Jahr
          </span>
        )}
      </div>
      {hoechstgrenze !== null && (
        <div className="mt-3 relative h-2 bg-slate-100 rounded-sm overflow-hidden">
          <div
            className={
              ueber
                ? "absolute inset-y-0 left-0 bg-wue-rot transition-all"
                : "absolute inset-y-0 left-0 bg-slate-700 transition-all"
            }
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
          <div className="absolute inset-y-0 right-0 w-px bg-slate-400" />
        </div>
      )}
      {ueber && hoechstgrenze !== null && (
        <p className="mt-2 text-xs text-wue-rot">
          {formatEuro(wert - hoechstgrenze)} über der Förderhöchstgrenze.
        </p>
      )}
      {hoechstgrenze === null && (
        <p className="mt-2 text-xs text-slate-500">
          Förderbereich IV sieht keine feste Förderhöchstgrenze vor —
          Sozialausschuss entscheidet im Einzelfall (AHP 3.4).
        </p>
      )}
    </div>
  );
}

function KennzahlenBlock({
  antrag, meta,
}: {
  antrag: AntragFull;
  meta: FoerderbereichMeta | null;
}) {
  if (!meta) return null;
  const zeilen: Array<{ label: string; value: string; hint?: string }> = [];

  if (meta.zeigt.stadtbewohner_anteil) {
    const v = antrag.stadtbewohner_anteil;
    zeilen.push({
      label: "Anteil Würzburger Teilnehmer",
      value: v === null ? "—" : `${Math.round(v * 100)} %`,
      hint:
        v === null
          ? "Bestimmt die anteilige Auszahlung (AHP 2.3 Pkt. 2 / Pkt. 3)."
          : undefined,
    });
  }
  if (meta.zeigt.treffen_und_teilnehmer) {
    zeilen.push({
      label: "Treffen pro Jahr",
      value: antrag.anzahl_treffen_jahr?.toString() ?? "—",
      hint: "≥ 10 → 750 € · ≥ 20 → 1.250 € · ≥ 46 → 2.000 €",
    });
    zeilen.push({
      label: "Teilnehmerzahl",
      value: antrag.anzahl_teilnehmer?.toString() ?? "—",
      hint: "Mindestens 6 Personen erforderlich.",
    });
  }
  if (meta.zeigt.ehrenamt) {
    zeilen.push({
      label: "Ehrenamtliche Stunden / Jahr",
      value: antrag.geleistete_stunden_jahr?.toString() ?? "—",
    });
    zeilen.push({
      label: "Anzahl Ehrenamtliche",
      value: antrag.anzahl_ehrenamtliche?.toString() ?? "—",
      hint: "750 € Pauschale + Staffel (1.250 / 2.000 / 3.500 €) · max. 4.250 € / Jahr.",
    });
  }
  if (meta.zeigt.befristung) {
    zeilen.push({
      label: "Bereits geförderte Jahre",
      value: antrag.foerderbereich_seit_jahren?.toString() ?? "—",
      hint: "Höchstens 3 Jahre möglich.",
    });
  }

  if (zeilen.length === 0) return null;
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium mb-2">
        Daten für die Förderhöhe
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {zeilen.map((z) => (
          <div key={z.label}>
            <div className="text-xs text-slate-500">{z.label}</div>
            <div className="text-sm text-slate-900 tabular-nums">{z.value}</div>
            {z.hint && (
              <div className="text-[11px] text-slate-400 mt-0.5">{z.hint}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PflichtangabenBlock({
  antrag, meta,
}: {
  antrag: AntragFull;
  meta: FoerderbereichMeta | null;
}) {
  const items: Array<{ label: string; erfuellt: boolean; bezug: string; pflicht: boolean }> = [];

  // Logo-Pflicht gilt für ALLE Förderbereiche (AHP 2)
  items.push({
    label: "Logo der Stadt Würzburg auf Materialien",
    erfuellt: !!antrag.logo_verwendet,
    bezug: "AHP 2",
    pflicht: true,
  });

  if (meta?.pflicht.finanzplanung) {
    items.push({
      label: "Finanzierungsplanung (Ausgaben + Einnahmen) beigelegt",
      erfuellt: !!antrag.finanzplanung_vorhanden,
      bezug: "AHP 2.4",
      pflicht: true,
    });
  }
  if (meta?.pflicht.projektskizze) {
    items.push({
      label: "Projektskizze mit Sozialreferat abgestimmt",
      erfuellt: !!antrag.projektskizze_eingereicht,
      bezug: "AHP 2.1",
      pflicht: true,
    });
  }

  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium mb-2">
        Pflichtangaben
      </div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.label} className="flex items-start gap-2 text-sm">
            <span
              className={
                it.erfuellt
                  ? "inline-flex items-center justify-center w-4 h-4 border border-slate-800 bg-slate-900 text-white mt-0.5 shrink-0"
                  : "inline-block w-4 h-4 border border-slate-400 bg-white mt-0.5 shrink-0"
              }
            >
              {it.erfuellt && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span
              className={
                it.erfuellt ? "text-slate-900" : "text-slate-500"
              }
            >
              {it.label}
            </span>
            <span className="text-[11px] text-slate-400 ml-1 font-mono shrink-0">
              {it.bezug}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Prozess-Indikator
// ─────────────────────────────────────────────────────────────────────

type FlowStep = {
  key: Status | "entschieden";
  label: string;
  /** Status-Werte, die diesen Schritt als „erreicht" markieren. */
  matches: Status[];
};

const FLOW: FlowStep[] = [
  { key: "eingegangen", label: "Eingegangen", matches: ["eingegangen"] },
  { key: "in_pruefung", label: "In Prüfung", matches: ["in_pruefung", "rueckfrage"] },
  { key: "entschieden", label: "Entscheidung", matches: ["bewilligt", "abgelehnt"] },
];

/**
 * Horizontaler Prozess-Indikator über drei Phasen
 * (Eingegangen → In Prüfung → Entscheidung). Spiegelt das tatsächliche
 * Workflow-Statusmodell, Rückfrage zählt zur Prüfungsphase.
 */
function StatusFlow({ status }: { status: Status }) {
  // Index des aktuellen Schritts bestimmen.
  const currentIdx = FLOW.findIndex((s) => s.matches.includes(status));

  return (
    <div className="bg-white border border-slate-200 rounded-sm shadow-sm px-6 lg:px-10 py-4">
      <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-500 font-medium mb-2">
        <span>Bearbeitungsstand</span>
        {status === "rueckfrage" && (
          <span className="text-amber-700 normal-case tracking-normal text-[12px]">
            ↩ Rückfrage offen
          </span>
        )}
      </div>
      <ol className="flex items-center gap-2">
        {FLOW.map((step, idx) => {
          const reached = idx <= currentIdx;
          const current = idx === currentIdx;
          return (
            <Fragment key={step.key}>
              <li className="flex items-center gap-3 flex-1 min-w-0">
                <span
                  className={
                    current
                      ? "inline-flex h-7 w-7 items-center justify-center rounded-full bg-wue-rot text-white text-[12px] font-semibold tabular-nums shadow-sm shrink-0"
                      : reached
                        ? "inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-white text-[12px] font-semibold tabular-nums shrink-0"
                        : "inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-400 text-[12px] font-semibold tabular-nums shrink-0"
                  }
                  aria-current={current ? "step" : undefined}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <div
                    className={
                      current
                        ? "text-[13px] font-semibold text-slate-900 truncate"
                        : reached
                          ? "text-[13px] font-medium text-slate-700 truncate"
                          : "text-[13px] text-slate-400 truncate"
                    }
                  >
                    {step.label}
                  </div>
                  {/* Sub-Label nur wenn tatsächlicher Status anders als
                      Step-Label (z.B. Step "In Prüfung" + Status "Rückfrage").
                      Sonst entsteht die Doppelung Eingegangen/Eingegangen. */}
                  {current && STATUS_LABELS[status] !== step.label && (
                    <div className="text-[11px] text-slate-500 truncate">
                      {STATUS_LABELS[status]}
                    </div>
                  )}
                </div>
              </li>
              {idx < FLOW.length - 1 && (
                <span
                  className={
                    idx < currentIdx
                      ? "h-px flex-1 bg-slate-800"
                      : "h-px flex-1 bg-slate-200"
                  }
                  aria-hidden="true"
                />
              )}
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Edit-Buttons (Fix H + I, AHP-Audit 2026-05-24)
// Direkter PATCH ohne Audit-Spur (Robert-Vorgabe: vorerst direkt).
// Beide Buttons nutzen den existierenden supabase-Client (Schema apl2).
// ─────────────────────────────────────────────────────────────────────

const FOERDERBEREICH_OPTIONEN: Array<{ value: NonNullable<AntragFull["foerderbereich"]>; label: string }> = [
  { value: "aufbau_niedrigschwellige_angebote", label: "FB I — Aufbau niedrigschwelliger Angebote (AHP 2.1)" },
  { value: "buergerschaftliches_engagement",     label: "FB II — Bürgerschaftliches Engagement (AHP 2.2)" },
  { value: "mehrgenerationenhaeuser",            label: "FB III — Mehrgenerationenhäuser (AHP 2.3 Pkt. 1)" },
  { value: "begegnungszentren",                  label: "FB III — Begegnungszentren (AHP 2.3 Pkt. 2)" },
  { value: "bildungstraeger",                    label: "FB III — Bildungsträger (AHP 2.3 Pkt. 3)" },
  { value: "seniorenkreise",                     label: "FB III — Seniorenkreise (AHP 2.3 Pkt. 4)" },
  { value: "quartiersmanagement_altenarbeit",    label: "FB III — Quartiersmanagement Altenarbeit (AHP 2.3 Pkt. 5)" },
  { value: "struktur_schwerpunktfoerderung",     label: "FB IV — Struktur- & Schwerpunktförderung (AHP 2.4)" },
];

function FoerderbereichEditButton({
  antrag, onChanged,
}: {
  antrag: AntragFull;
  onChanged?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState<string>(antrag.foerderbereich ?? "");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function save() {
    if (!val || val === antrag.foerderbereich) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setFeedback(null);
    const altLabel = foerderbereichMeta(antrag.foerderbereich)?.label ?? "—";
    const neuLabel = foerderbereichMeta(val)?.label ?? val;
    const { error } = await supabase
      .from("antraege")
      .update({ foerderbereich: val })
      .eq("id", antrag.id);
    setBusy(false);
    if (error) {
      setFeedback("Fehler: " + error.message);
      return;
    }
    setFeedback(`Förderbereich geändert: ${altLabel} → ${neuLabel}`);
    setOpen(false);
    if (onChanged) await onChanged();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 px-2 text-[10.5px] uppercase tracking-wider"
        onClick={() => { setVal(antrag.foerderbereich ?? ""); setOpen(true); }}
      >
        Ändern
      </Button>
      {feedback && (
        <span
          role="status"
          className={
            "ml-2 text-[10.5px] " +
            (feedback.startsWith("Fehler") ? "text-rose-700" : "text-emerald-700")
          }
        >
          {feedback}
        </span>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Förderbereich ändern</DialogTitle>
            <DialogDescription>
              Default ist „Begegnungszentren" — der Sachbearbeiter kann anhand
              des Antrags-Inhalts die korrekte Zuordnung treffen. Änderung wirkt
              sofort und wird nicht versionssiert.
            </DialogDescription>
          </DialogHeader>
          <select
            className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm"
            value={val}
            onChange={(e) => setVal(e.target.value)}
          >
            <option value="">— bitte wählen —</option>
            {FOERDERBEREICH_OPTIONEN.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Abbrechen
            </Button>
            <Button onClick={save} disabled={busy || !val}>
              {busy ? "Speichern …" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FoerdersummeEditButton({
  antrag, onChanged,
}: {
  antrag: AntragFull;
  onChanged?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState<string>(
    antrag.geforderte_foerdersumme_euro != null
      ? String(antrag.geforderte_foerdersumme_euro)
      : "",
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setFeedback(null);
    let neuerWert: number | null = null;
    if (val.trim().length > 0) {
      const n = Number(val.replace(",", ".").replace(/[^\d.\-]/g, ""));
      if (!Number.isFinite(n) || n < 0) {
        setBusy(false);
        setFeedback("Fehler: ungültiger Betrag");
        return;
      }
      neuerWert = n;
    }
    const { error } = await supabase
      .from("antraege")
      .update({ geforderte_foerdersumme_euro: neuerWert })
      .eq("id", antrag.id);
    setBusy(false);
    if (error) {
      setFeedback("Fehler: " + error.message);
      return;
    }
    setFeedback("Fördersumme aktualisiert");
    setOpen(false);
    if (onChanged) await onChanged();
  }

  const labelBusyAction =
    antrag.geforderte_foerdersumme_euro == null ? "Erfassen" : "Ändern";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 px-2 text-[10.5px] uppercase tracking-wider"
        onClick={() => setOpen(true)}
      >
        {labelBusyAction}
      </Button>
      {feedback && (
        <span
          role="status"
          className={
            "ml-2 text-[10.5px] " +
            (feedback.startsWith("Fehler") ? "text-rose-700" : "text-emerald-700")
          }
        >
          {feedback}
        </span>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Geforderte Fördersumme (Jahr)</DialogTitle>
            <DialogDescription>
              Betrag in EUR — Webformular und PDF-Antrag fragen diese Summe nicht
              zwingend ab. Sie können den Wert hier nachpflegen oder leer lassen.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="z. B. 10000"
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Abbrechen
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? "Speichern …" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
