import { Fragment, useState, type ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, FileText } from "lucide-react";
import { useAntrag, type AnlageRow, type AntragFull } from "../hooks/useAntrag";
import { useBescheide, type BescheidRow } from "../hooks/useBescheide";
import { useSession } from "../hooks/useSession";
import { StatusBadge } from "../components/StatusBadge";
import { HistoryTimeline } from "../components/HistoryTimeline";
import { AnlageDownload } from "../components/AnlageDownload";
import { allowedTransitions, STATUS_LABELS, type Status } from "../lib/workflow";
import { formatEuro, formatDateTime, formatAdresse } from "../lib/format";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PruefungsCard } from "../components/PruefungsCard";
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
    loading, error, changeStatus,
  } = useAntrag(id);
  const { session } = useSession();
  const { bescheide, creating: bescheidCreating, erstelleBescheid, downloadBescheidPdf } =
    useBescheide(antrag?.id);
  const [confirmTo, setConfirmTo] = useState<Status | null>(null);
  const [kommentar, setKommentar] = useState("");
  const [busy, setBusy] = useState(false);
  const [bewilligteSumme, setBewilligteSumme] = useState<string>("");

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
    setBusy(true);
    const result = await changeStatus(confirmTo, kommentar);
    if (result.error) {
      alert("Fehler: " + result.error);
      setBusy(false);
      return;
    }
    // Bei Entscheidungs-Status: zusätzlich Bescheid-PDF erstellen
    if (istEntscheidungsStatus(confirmTo)) {
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

      {/* Prozess-Indikator: zeigt, wo der Antrag im Workflow steht */}
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

          {/* Titelblock — Antrags-Klassifikation als Kategorie-Label, Einrichtungs-
              name als visueller Anker (nicht der Antragstyp). */}
          <div className="px-10 lg:px-14 pt-8 pb-6 border-b border-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-medium">
                  Förderantrag · Altentagesstätten APL 2
                </div>
                <h1 className="text-xl font-semibold text-slate-700 mt-0.5">
                  Betriebs- und Personalkostenzuschuss
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Haushaltsjahr{" "}
                  <span className="font-semibold text-slate-800 tabular-nums">{antrag.haushaltsjahr}</span>
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
          </div>

          {/* §§ Abschnitte */}
          <div className="px-10 lg:px-14 py-10 space-y-12">
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
                  <DocField label="Jahresmiete" className="sm:col-span-2">
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {formatEuro(antrag.miete_jahr_euro)}
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
              subtitle="AHP-Klassifikation und Bezugsgrößen der Förderhöchstgrenze"
            >
              <FoerderblockKomplett antrag={antrag} />
            </DocSection>

            <DocSection
              num="§ 5"
              title="Kostenpositionen (Jahresplanung)"
              subtitle="Geplante Aufwendungen für das laufende Haushaltsjahr"
            >
              <KostenTabelle items={belegpositionen} />
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
                <span className="font-semibold uppercase tracking-wider">Eingegangen</span>
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
                          {istEntscheidungsStatus(s)
                            ? "Erzeugt zusätzlich automatisch einen PDF-Bescheid mit der Ontologie-Begründung aus der letzten KI-Prüfung."
                            : "Optional kannst du einen Kommentar hinterlassen (im Audit-Trail sichtbar)."}
                        </DialogDescription>
                      </DialogHeader>
                      {s === "bewilligt" && (
                        <div className="space-y-1">
                          <label
                            htmlFor="bewilligte-summe"
                            className="text-[11px] uppercase tracking-wider text-slate-500 font-medium"
                          >
                            Bewilligte Fördersumme (€) · Cap AHP 2.3.2: 10.000 €
                          </label>
                          <Input
                            id="bewilligte-summe"
                            placeholder="z.B. 8500.00"
                            value={bewilligteSumme}
                            onChange={(e) => setBewilligteSumme(e.target.value)}
                          />
                        </div>
                      )}
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
                ))
              )}
            </CardContent>
          </Card>

          <PruefungsCard antragId={antrag.id} />

          {bescheide.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Bescheide</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {bescheide.map((b) => (
                  <BescheidListItem
                    key={b.id}
                    bescheid={b}
                    onOpen={() => b.pdf_storage_path && openBescheidPdf(b.pdf_storage_path)}
                  />
                ))}
              </CardContent>
            </Card>
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

function KostenTabelle({ items }: { items: Beleg[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500 italic">Keine Kostenpositionen angegeben.</p>;
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

/** Eine Zeile in der Bescheide-Card mit Entscheidung, Datum, Summe + Download. */
function BescheidListItem({
  bescheid, onOpen,
}: {
  bescheid: BescheidRow;
  onOpen: () => void;
}) {
  const labels: Record<BescheidRow["entscheidung"], { txt: string; color: string }> = {
    bewilligt: { txt: "Bewilligt", color: "text-emerald-700" },
    abgelehnt: { txt: "Abgelehnt", color: "text-rose-700" },
    rueckfrage: { txt: "Rückfrage", color: "text-amber-700" },
  };
  const meta = labels[bescheid.entscheidung];
  return (
    <div className="border border-slate-200 rounded p-2 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-medium ${meta.color}`}>{meta.txt}</span>
        <span className="text-xs text-slate-500">
          {formatDateTime(bescheid.ausgestellt_am)}
        </span>
      </div>
      {bescheid.bewilligte_summe_euro !== null && (
        <div className="text-xs text-slate-700 tabular-nums mt-1">
          Summe: <span className="font-medium">{formatEuro(bescheid.bewilligte_summe_euro)}</span>
        </div>
      )}
      {bescheid.doctree_version && (
        <div className="text-[11px] text-slate-400 mt-0.5">
          Doctree v{bescheid.doctree_version}
        </div>
      )}
      {bescheid.pdf_storage_path && (
        <Button variant="outline" size="sm" onClick={onOpen} className="w-full mt-2">
          📄 Bescheid als PDF
        </Button>
      )}
    </div>
  );
}

/** Komplette § 4-Anzeige: Förderbereich-Pill, Fördersumme + Cap, Skalierungs-
 * Kennzahlen, Pflichtangaben — alles kontextsensitiv je nach Förderbereich. */
function FoerderblockKomplett({ antrag }: { antrag: AntragFull }) {
  const meta = foerderbereichMeta(antrag.foerderbereich);
  return (
    <div className="space-y-6">
      {/* (1) Förderbereich-Pill */}
      <div>
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium mb-2">
          AHP-Förderbereich
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
            Kein Förderbereich klassifiziert — Cap-Regeln werden nicht ausgeführt.
            Sachbearbeiter sollte den Förderbereich nachpflegen.
          </div>
        )}
      </div>

      {/* (2) Fördersumme + Cap */}
      <FoerdersummeMitCap
        wert={antrag.geforderte_foerdersumme_euro}
        cap={meta?.cap ?? null}
        capLabel={meta?.ahpPath ?? null}
      />

      {/* (3) Skalierungs-Kennzahlen (kontextsensitiv) */}
      <KennzahlenBlock antrag={antrag} meta={meta} />

      {/* (4) Pflichtangaben (kontextsensitiv) */}
      <PflichtangabenBlock antrag={antrag} meta={meta} />

      {/* (5) Zuwendungszweck — nur bei FB IV */}
      {antrag.foerderbereich === "struktur_schwerpunktfoerderung" && antrag.zuwendungszweck && (
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium mb-1">
            Zuwendungszweck (AHP 2.4 Pflichtangabe)
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
  cap: number | null;
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
  const map: Record<string, FoerderbereichMeta> = {
    aufbau_niedrigschwellige_angebote: {
      label: "Förderbereich I — Aufbau niedrigschwelliger Angebote",
      ahpPath: "AHP 2.1",
      cap: 3000,
      zeigt: { befristung: true },
      pflicht: { projektskizze: true },
    },
    buergerschaftliches_engagement: {
      label: "Förderbereich II — Bürgerschaftliches Engagement",
      ahpPath: "AHP 2.2",
      cap: 5500,
      zeigt: { ehrenamt: true },
      pflicht: {},
    },
    mehrgenerationenhaeuser: {
      label: "Förderbereich III — Mehrgenerationenhäuser",
      ahpPath: "AHP 2.3.1",
      cap: 10000,
      zeigt: {},
      pflicht: {},
    },
    begegnungszentren: {
      label: "Förderbereich III — Begegnungszentren",
      ahpPath: "AHP 2.3.2",
      cap: 10000,
      zeigt: { stadtbewohner_anteil: true },
      pflicht: {},
    },
    bildungstraeger: {
      label: "Förderbereich III — Bildungsträger / Bildungshäuser",
      ahpPath: "AHP 2.3.3",
      cap: 6000,
      zeigt: { stadtbewohner_anteil: true },
      pflicht: {},
    },
    seniorenkreise: {
      label: "Förderbereich III — Seniorenkreise",
      ahpPath: "AHP 2.3.4",
      cap: 2000,
      zeigt: { treffen_und_teilnehmer: true },
      pflicht: {},
    },
    quartiersmanagement_altenarbeit: {
      label: "Förderbereich III — Quartiersmanagement Altenarbeit",
      ahpPath: "AHP 2.3.5",
      cap: 7500,
      zeigt: {},
      pflicht: {},
    },
    struktur_schwerpunktfoerderung: {
      label: "Förderbereich IV — Struktur- und Schwerpunktförderung",
      ahpPath: "AHP 2.4",
      cap: null, // keine Cap
      zeigt: {},
      pflicht: { finanzplanung: true },
    },
  };
  return map[fb] ?? null;
}

function FoerdersummeMitCap({
  wert, cap, capLabel,
}: {
  wert: number | null;
  cap: number | null;
  capLabel: string | null;
}) {
  if (wert === null || wert === undefined) {
    return (
      <div className="text-sm text-slate-500 italic">
        Keine Fördersumme angegeben — bitte vom Antragsteller nachfordern.
      </div>
    );
  }
  const ueber = cap !== null && wert > cap;
  const pct = cap !== null ? Math.min((wert / cap) * 100, 130) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium">
          Geforderter Zuschuss (Jahr)
        </span>
        {cap !== null && (
          <span className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500">
            Cap ({capLabel ?? "—"})
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
        {cap !== null && (
          <span className="text-sm text-slate-500 tabular-nums">
            {formatEuro(cap)} / Jahr
          </span>
        )}
      </div>
      {cap !== null && (
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
      {ueber && cap !== null && (
        <p className="mt-2 text-xs text-wue-rot">
          Überschreitet die AHP-Höchstgrenze um{" "}
          <span className="font-semibold">{formatEuro(wert - cap)}</span>.
        </p>
      )}
      {cap === null && (
        <p className="mt-2 text-xs text-slate-500">
          Förderbereich IV: keine pauschale Cap — Sozialausschuss entscheidet
          nach Einzelfallprüfung (AHP 3.4).
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
      label: "Anteil Würzburger Bewohner:innen",
      value: v === null ? "—" : `${Math.round(v * 100)} %`,
      hint:
        v === null
          ? "skaliert die Auszahlung nach AHP 2.3.2/2.3.3"
          : undefined,
    });
  }
  if (meta.zeigt.treffen_und_teilnehmer) {
    zeilen.push({
      label: "Treffen pro Jahr",
      value: antrag.anzahl_treffen_jahr?.toString() ?? "—",
      hint: "12–24 → 1.000 € / ≥25 → 2.000 € (AHP 2.3.4)",
    });
    zeilen.push({
      label: "Anzahl Teilnehmer:innen",
      value: antrag.anzahl_teilnehmer?.toString() ?? "—",
      hint: "min. 6 (AHP 2.3.4)",
    });
  }
  if (meta.zeigt.ehrenamt) {
    zeilen.push({
      label: "Geleistete Stunden / Jahr",
      value: antrag.geleistete_stunden_jahr?.toString() ?? "—",
    });
    zeilen.push({
      label: "Anzahl Ehrenamtliche",
      value: antrag.anzahl_ehrenamtliche?.toString() ?? "—",
      hint: "Staffelung 1.500 € / 2.500 € / 4.000 € / 5.500 € (AHP 2.2)",
    });
  }
  if (meta.zeigt.befristung) {
    zeilen.push({
      label: "Bereits geförderte Jahre",
      value: antrag.foerderbereich_seit_jahren?.toString() ?? "—",
      hint: "max. 3 Jahre (AHP 2.1)",
    });
  }

  if (zeilen.length === 0) return null;
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium mb-2">
        Skalierungs-Kennzahlen
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
    label: "Logo der Stadt Würzburg in Materialien verwendet",
    erfuellt: !!antrag.logo_verwendet,
    bezug: "AHP 2",
    pflicht: true,
  });

  if (meta?.pflicht.finanzplanung) {
    items.push({
      label: "Finanzierungsplanung (Ausgaben + Einnahmen) liegt vor",
      erfuellt: !!antrag.finanzplanung_vorhanden,
      bezug: "AHP 2.4",
      pflicht: true,
    });
  }
  if (meta?.pflicht.projektskizze) {
    items.push({
      label: "Projektskizze (mit Sozialreferat abgestimmt) eingereicht",
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
                  {current && (
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
