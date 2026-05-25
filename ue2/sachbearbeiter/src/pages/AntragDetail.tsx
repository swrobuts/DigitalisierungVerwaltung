import { Fragment, useState, type ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, FileText } from "lucide-react";
import { useAntrag, type AnlageRow, type AntragFull } from "../hooks/useAntrag";
import { ManuellePruefungProvider } from "../hooks/useManuellePruefung";
import { DemoDatenBanner } from "../components/DemoDatenBanner";
import { StatusBadge } from "../components/StatusBadge";
import { HistoryTimeline } from "../components/HistoryTimeline";
import { AnlageDownload } from "../components/AnlageDownload";
import { VorjahresVergleich } from "../components/VorjahresVergleich";
import { SektionPruefung } from "../components/SektionPruefung";
import { allowedTransitions, STATUS_LABELS, type Status } from "../lib/workflow";
import { formatEuro, formatDateTime, formatDate, formatAdresse, formatDurchlaufzeit, durchlaufzeitAmpel, type DurchlaufzeitAmpel } from "../lib/format";
import { supabase } from "../lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
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
// AntragDetail (UE2 — klassische Sachbearbeitung, OHNE KI)
//
// Layout 1:1 aus UE3 portiert (Stufe „Vor-KI" im Reifegradmodell):
//   - Akte mit Briefkopf · Titelblock · §§ 1–7 · Submission-Footer
//   - Werkzeug-Sidebar rechts (Workflow · Anlagen · Verlauf)
//
// Bewusst weggelassen (sind KI-Funktionen → nur UE3):
//   - PruefungsCard / ZweitpruefungsCard (LLM-Prüfung)
//   - ExterneValidierungCard (Web-Recherche)
//   - AntragMetricsBar (Risiko-Score)
//   - BescheideListe + automatische Bescheid-Erzeugung
//
// Drin gelassen (kein KI):
//   - VorjahresVergleich (SQL-Lookup im pruefung-Service, kein LLM)
//   - Manuelle Edit-Buttons für Förderbereich / Fördersumme / Bemessung
//
// Workflow: UE2 hat das einfache 5-Status-Modell aus lib/workflow.ts
// (eingegangen → in_pruefung → rueckfrage/bewilligt/abgelehnt). Kein
// zweitpruefung_*, kein Reverse-Transition-Pflichtkommentar.
// ════════════════════════════════════════════════════════════════════

/** Durchlaufzeit-Subtitle im Page-Header neben dem StatusBadge.
 *  Zeigt — abhängig davon, ob der Antrag entschieden ist —
 *  „bewilligt nach X Tagen" / „abgelehnt nach X Tagen" / „läuft seit X Tagen".
 *  Ampel-Punkt davor (Migration 058, Helper `durchlaufzeitAmpel`).
 *  Identisch zwischen UE2 und UE3. */
const AMPEL_BG_HEADER: Record<DurchlaufzeitAmpel, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-slate-400",
};

function DurchlaufzeitSubtitle({ antrag }: { antrag: AntragFull }) {
  const entschieden = antrag.entscheidungs_typ !== null;
  const tage = antrag.durchlaufzeit_tage ?? 0;
  const ampel = durchlaufzeitAmpel(tage, entschieden);
  let text: string;
  if (entschieden) {
    // formatDurchlaufzeit liefert nur "12 Tage" / "1 Tag" / "<1 Tag".
    // Hier wollen wir explizit den Entscheidungs-Verbtyp im Subtitle —
    // also "bewilligt nach 12 Tagen" statt nur "12 Tage".
    const dauer = formatDurchlaufzeit(tage, true);
    const verb = antrag.entscheidungs_typ === "bewilligt" ? "bewilligt" : "abgelehnt";
    text = tage === 1 || tage <= 0
      ? `${verb} nach ${dauer}`
      : `${verb} nach ${tage} Tagen`;
  } else {
    text = formatDurchlaufzeit(tage, false); // "läuft seit X Tagen"
  }
  const toneClass = entschieden ? "text-slate-600" : "text-slate-500";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${toneClass}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${AMPEL_BG_HEADER[ampel]}`} aria-hidden="true" />
      {text}
    </span>
  );
}

export function AntragDetail() {
  const { id } = useParams<{ id: string }>();
  // Rules of Hooks: erst alle Hook-Calls, dann early returns.
  const {
    antrag, anlagen, belegpositionen, oeffnungszeiten, history,
    loading, error, changeStatus, reload,
  } = useAntrag(id);
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
    <ManuellePruefungProvider antragId={antrag.id}>
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
          <DurchlaufzeitSubtitle antrag={antrag} />
          <span
            className="ml-auto text-[11px] text-slate-500 italic"
            title="APL 2 ist nur das Aktenzeichen — die geltende Rechtsgrundlage ist die AHP-Förderrichtlinie Stadt Würzburg (Stand 2025-03-27)."
          >
            Aktenzeichen APL 2 — Rechtsgrundlage: AHP-Förderrichtlinie 2025-03-27
          </span>
        </div>
      </header>

      <DemoDatenBanner />

      {/* Prozess-Indikator: drei Phasen Eingegangen → In Prüfung → Entscheidung. */}
      <div className="w-full px-4 lg:px-8 pt-6">
        <StatusFlow status={antrag.status} />
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

          {/* Titelblock */}
          <div className="px-10 lg:px-14 pt-8 pb-6 border-b border-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-medium">
                  Förderantrag · Altentagesstätten APL 2
                </div>
                <div
                  className="text-[10.5px] text-slate-400 italic mt-0.5 leading-tight max-w-[60ch]"
                  title="APL 2 ist nur das Aktenzeichen — die geltende Rechtsgrundlage ist die AHP-Förderrichtlinie der Stadt Würzburg (Stand 2025-03-27)."
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

            {/* Einrichtungs-Block — visueller Anker */}
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

            <AntragSummaryStrip antrag={antrag} onChanged={reload} />
          </div>

          {/* §§ Abschnitte */}
          <div className="px-10 lg:px-14 py-10 space-y-12">
            <VorjahresVergleich antragId={antrag.id} />

            <DocSection num="§ 1" title="Antragsteller / Träger">
              <div className="flex justify-end -mt-2 mb-3">
                <SektionPruefung antragId={antrag.id} paragraph="§ 1" />
              </div>
              <FieldGrid>
                <DocField label="Träger" className="sm:col-span-2">
                  {antrag.traeger}
                </DocField>
                <DocField label="Ansprechpartner/in" className="sm:col-span-2">
                  {antrag.ansprechpartner}
                </DocField>
                <DocField label="Telefon / Handy">
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
              <div className="flex justify-end -mt-2 mb-3">
                <SektionPruefung antragId={antrag.id} paragraph="§ 2" />
              </div>
              <FieldGrid>
                <DocField label="Vorhandene Räumlichkeiten des Trägers">
                  <YesNo value={antrag.raeume_vorhanden} />
                </DocField>
                <DocField label="Unentgeltlich bereitgestellte Räume anderer Träger">
                  <YesNo value={antrag.raeume_unentgeltlich} />
                </DocField>
                {antrag.miete_jahr_euro > 0 && (
                  <DocField label="Monatliche Mietzahlung (Eigenangabe)" className="sm:col-span-2">
                    <span className="text-slate-700 tabular-nums">
                      {formatEuro(antrag.miete_jahr_euro / 12)}
                    </span>
                    <span className="text-slate-500 text-sm tabular-nums ml-2">
                      (≙ Jahressumme {formatEuro(antrag.miete_jahr_euro)})
                    </span>
                    <span className="block text-[11px] text-slate-500 italic mt-0.5">
                      Antragsformular fragt monatlich ab (PDF: „Monatliche
                      Mietzahlungen in Höhe von — Kopie Mietvertrag"). System
                      speichert die Jahressumme als Belegposition. Für
                      Förderbereich III keine prüfungsrelevante Bemessung
                      (siehe § 5).
                    </span>
                  </DocField>
                )}
              </FieldGrid>
            </DocSection>

            <DocSection num="§ 3" title="Bankverbindung">
              <div className="flex justify-end -mt-2 mb-3">
                <SektionPruefung antragId={antrag.id} paragraph="§ 3" />
              </div>
              <FieldGrid>
                <DocField label="Bankverbindung" className="sm:col-span-2">
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
              <div className="flex justify-end -mt-2 mb-3">
                <SektionPruefung antragId={antrag.id} paragraph="§ 4" />
              </div>
              <FoerderblockKomplett antrag={antrag} onChanged={reload} />
            </DocSection>

            <DocSection
              num="§ 5"
              title="Kostenpositionen (vom Antragsteller mitgeteilt)"
              subtitle="Tätigkeitsnachweis; für Förderbereich III gem. AHP 3.8 nur auf Anfrage einzureichen — keine Bemessungsgrundlage"
            >
              <div className="flex justify-end -mt-2 mb-3">
                <SektionPruefung antragId={antrag.id} paragraph="§ 5" />
              </div>
              <KostenTabelle
                items={belegpositionen}
                pauschalHinweis={antrag.foerderbereich !== "struktur_schwerpunktfoerderung"}
              />
            </DocSection>

            <DocSection num="§ 6" title="Wochenplan / Öffnungszeiten">
              <div className="flex justify-end -mt-2 mb-3">
                <SektionPruefung antragId={antrag.id} paragraph="§ 6" />
              </div>
              <Wochenplan zeiten={oeffnungszeiten} />
            </DocSection>

            <DocSection
              num="§ 7"
              title="Anlagen"
              subtitle="Mit dem Antrag eingereichte Belege"
            >
              <div className="flex justify-end -mt-2 mb-3">
                <SektionPruefung antragId={antrag.id} paragraph="§ 7" />
              </div>
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

        {/* ═══════════════════ WERKZEUG-SIDEBAR (RECHTS) ═══════════════════ */}
        <aside className="space-y-4 lg:sticky lg:top-[5.25rem] lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
          <Card>
            <CardHeader>
              <CardTitle>Workflow · Status-Wechsel</CardTitle>
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

// ─────────────────────────────────────────────────────────────────────
// Dokument-Helfer
// ─────────────────────────────────────────────────────────────────────

/** Nummerierter Akten-Abschnitt im Stil eines Verwaltungs-Formulars. */
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
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-500 italic">Kein Wochenplan hinterlegt.</p>
        <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Hinweis: Wenn der Antrag aus dem UE0-Portal (PDF-Upload) kommt,
          wurde keine Anlage 1 mit eingereicht. Bürger ggf. kontaktieren
          oder Wochenplan manuell nachpflegen.
        </p>
      </div>
    );
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

/** Antrags-Summary-Streifen direkt unter dem Hero. */
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

      {/* (3) Pflichtangaben (kontextsensitiv) */}
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
  hoechstgrenze: number | null;
  pflicht: {
    finanzplanung?: boolean;
    projektskizze?: boolean;
  };
}

function foerderbereichMeta(fb: string | null): FoerderbereichMeta | null {
  if (!fb) return null;
  const map: Record<string, FoerderbereichMeta> = {
    aufbau_niedrigschwellige_angebote: {
      label: "Förderbereich I — Aufbau niedrigschwelliger Angebote",
      ahpPath: "AHP 2.1",
      hoechstgrenze: 3000,
      pflicht: { projektskizze: true },
    },
    buergerschaftliches_engagement: {
      label: "Förderbereich II — Bürgerschaftliches Engagement",
      ahpPath: "AHP 2.2",
      hoechstgrenze: 4250,
      pflicht: {},
    },
    mehrgenerationenhaeuser: {
      label: "Förderbereich III — Mehrgenerationenhäuser",
      ahpPath: "AHP 2.3 Pkt. 1",
      hoechstgrenze: 10000,
      pflicht: {},
    },
    begegnungszentren: {
      label: "Förderbereich III — Begegnungszentren",
      ahpPath: "AHP 2.3 Pkt. 2",
      hoechstgrenze: 10000,
      pflicht: {},
    },
    bildungstraeger: {
      label: "Förderbereich III — Bildungsträger / Bildungshäuser",
      ahpPath: "AHP 2.3 Pkt. 3",
      hoechstgrenze: 6000,
      pflicht: {},
    },
    seniorenkreise: {
      label: "Förderbereich III — Seniorenkreise",
      ahpPath: "AHP 2.3 Pkt. 4",
      hoechstgrenze: 2000,
      pflicht: {},
    },
    quartiersmanagement_altenarbeit: {
      label: "Förderbereich III — Quartiersmanagement Altenarbeit",
      ahpPath: "AHP 2.3 Pkt. 5",
      hoechstgrenze: 7500,
      pflicht: {},
    },
    struktur_schwerpunktfoerderung: {
      label: "Förderbereich IV — Struktur- und Schwerpunktförderung",
      ahpPath: "AHP 2.4",
      hoechstgrenze: null,
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

function PflichtangabenBlock({
  antrag, meta,
}: {
  antrag: AntragFull;
  meta: FoerderbereichMeta | null;
}) {
  const items: Array<{ label: string; erfuellt: boolean; bezug: string; pflicht: boolean }> = [];

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
  matches: Status[];
};

const FLOW: FlowStep[] = [
  { key: "eingegangen", label: "Eingegangen", matches: ["eingegangen"] },
  { key: "in_pruefung", label: "In Prüfung", matches: ["in_pruefung", "rueckfrage"] },
  { key: "entschieden", label: "Entscheidung", matches: ["bewilligt", "abgelehnt"] },
];

/**
 * Horizontaler Prozess-Indikator über drei Phasen
 * (Eingegangen → In Prüfung → Entscheidung).
 */
function StatusFlow({ status }: { status: Status }) {
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
// Edit-Buttons (manuelle Korrektur — direkter PATCH ohne Audit-Spur)
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
