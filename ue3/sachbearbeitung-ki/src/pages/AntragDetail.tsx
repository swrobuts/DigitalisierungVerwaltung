import { Fragment, useState, type ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Check, FileText } from "lucide-react";
import { useAntrag, type AnlageRow } from "../hooks/useAntrag";
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
              title="Beantragte Fördersumme"
              subtitle="Bezugsgröße der AHP-Förderhöchstgrenze (Kap. 2.3.2)"
            >
              <FoerdersummeBlock value={antrag.geforderte_foerdersumme_euro} />
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

/** Nummerierter Akten-Abschnitt im Stil eines Verwaltungs-Formulars. */
function DocSection({
  num, title, subtitle, children,
}: {
  num: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-5">
        <span className="text-slate-400 font-semibold text-base tabular-nums">{num}</span>
        <h2 className="text-[15px] font-semibold text-slate-900 tracking-tight">{title}</h2>
        {subtitle && <span className="text-xs text-slate-500">— {subtitle}</span>}
      </div>
      <div className="ml-[3.25rem]">{children}</div>
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

/** Anzeige der beantragten Fördersumme mit visueller Cap-Indikation
 * (AHP 2.3.2 Begegnungszentren: 10.000 €/Jahr). */
function FoerdersummeBlock({ value }: { value: number | null }) {
  const CAP = 10000;
  if (value === null || value === undefined) {
    return (
      <div className="text-sm text-slate-500 italic">
        Keine Fördersumme angegeben — die AHP-Höchstgrenze (10.000 € / Jahr nach
        Kap. 2.3.2) kann maschinell nicht geprüft werden. Bitte vom Antragsteller
        nachfordern.
      </div>
    );
  }
  const ueber = value > CAP;
  const pct = Math.min((value / CAP) * 100, 130);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium">
          Geforderter Zuschuss (Jahr)
        </span>
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500">
          Cap (AHP 2.3.2)
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span
          className={
            ueber
              ? "text-2xl font-bold text-wue-rot tabular-nums"
              : "text-2xl font-bold text-slate-900 tabular-nums"
          }
        >
          {formatEuro(value)}
        </span>
        <span className="text-sm text-slate-500 tabular-nums">
          {formatEuro(CAP)} / Jahr
        </span>
      </div>
      {/* Visuelle Cap-Anzeige */}
      <div className="mt-3 relative h-2 bg-slate-100 rounded-sm overflow-hidden">
        <div
          className={
            ueber
              ? "absolute inset-y-0 left-0 bg-wue-rot transition-all"
              : "absolute inset-y-0 left-0 bg-slate-700 transition-all"
          }
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
        {/* 100%-Marker für die Cap */}
        <div className="absolute inset-y-0 right-0 w-px bg-slate-400" />
      </div>
      {ueber && (
        <p className="mt-2 text-xs text-wue-rot">
          Überschreitet die AHP-Höchstgrenze um{" "}
          <span className="font-semibold">{formatEuro(value - CAP)}</span>.
        </p>
      )}
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
