import { useState, type ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  UserSquare2,
  Landmark,
  Receipt,
  Mail,
  Phone,
  Globe,
  Clock,
  Send,
  Check,
  X as XIcon,
} from "lucide-react";
import { useAntrag } from "../hooks/useAntrag";
import { StatusBadge } from "../components/StatusBadge";
import { HistoryTimeline } from "../components/HistoryTimeline";
import { AnlageDownload } from "../components/AnlageDownload";
import { allowedTransitions, STATUS_LABELS, type Status } from "../lib/workflow";
import { formatEuro, formatDateTime, formatAdresse } from "../lib/format";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
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
      <header className="bg-white border-b border-slate-200 relative">
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

      <main className="w-full px-4 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Hero — wie ein Antrags-Deckblatt (Würzburg-CI) */}
          <Card className="overflow-hidden">
            <div className="relative bg-white border-b border-slate-200 px-6 py-6">
              <div className="absolute inset-x-0 top-0 h-[3px] bg-wue-rot" />
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-wue-rot font-semibold mb-2">
                    Förderantrag · APL 2 · Altentagesstätte
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 leading-tight">
                    {antrag.name}
                  </h2>
                  <p className="text-sm text-slate-700 mt-1">{antrag.traeger}</p>
                  <p className="text-xs text-slate-500 mt-2">
                    {formatAdresse(antrag.strasse, antrag.hausnummer, antrag.plz, antrag.ort)}
                  </p>
                </div>
                <div className="text-right shrink-0 border-l-2 border-wue-rot pl-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-medium">
                    Haushaltsjahr
                  </div>
                  <div className="text-3xl font-bold text-slate-900 tabular-nums leading-tight">
                    {antrag.haushaltsjahr}
                  </div>
                </div>
              </div>
            </div>

            {/* Abschnitte */}
            <div className="divide-y divide-slate-100">
              <Section icon={<Building2 className="h-4 w-4" />} title="Räumlichkeiten">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <FieldRow label="Räume vorhanden">
                    <YesNoPill value={antrag.raeume_vorhanden} />
                  </FieldRow>
                  <FieldRow label="Räume unentgeltlich überlassen">
                    <YesNoPill value={antrag.raeume_unentgeltlich} />
                  </FieldRow>
                  {antrag.miete_jahr_euro > 0 && (
                    <FieldRow label="Jahresmiete" className="sm:col-span-2">
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {formatEuro(antrag.miete_jahr_euro)}
                      </span>
                    </FieldRow>
                  )}
                </div>
              </Section>

              <Section icon={<UserSquare2 className="h-4 w-4" />} title="Ansprechpartner/in">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <FieldRow label="Name" className="sm:col-span-2">
                    {antrag.ansprechpartner}
                  </FieldRow>
                  <FieldRow label="Telefon">
                    <a
                      href={`tel:${antrag.telefon.replace(/\s+/g, "")}`}
                      className="inline-flex items-center gap-1.5 text-wue-rot hover:text-wue-rot-dark hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {antrag.telefon}
                    </a>
                  </FieldRow>
                  <FieldRow label="E-Mail">
                    <a
                      href={`mailto:${antrag.email}`}
                      className="inline-flex items-center gap-1.5 text-wue-rot hover:text-wue-rot-dark hover:underline break-all"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {antrag.email}
                    </a>
                  </FieldRow>
                </div>
              </Section>

              <Section icon={<Landmark className="h-4 w-4" />} title="Bankverbindung">
                <div className="space-y-3">
                  <FieldRow label="Kreditinstitut">{antrag.bankverbindung}</FieldRow>
                  <FieldRow label="IBAN">
                    <span className="font-mono text-[15px] tracking-wide text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 inline-block">
                      {formatIban(antrag.iban)}
                    </span>
                  </FieldRow>
                  <FieldRow label="BIC">
                    {antrag.bic ? (
                      <span className="font-mono text-slate-700">{antrag.bic}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </FieldRow>
                </div>
              </Section>

              <Section icon={<Receipt className="h-4 w-4" />} title="Vorjahres-Kosten" subtitle="Ist-Kosten des Vorjahres laut Trägerangabe">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <KostenTile
                    label="Betriebskosten"
                    value={antrag.betriebskosten_vorjahr_euro}
                  />
                  <KostenTile
                    label="Personalkosten"
                    value={antrag.personalkosten_vorjahr_euro}
                  />
                </div>
              </Section>
            </div>

            {/* Einreichungs-Metadaten als Footer */}
            <div className="bg-slate-50/70 border-t border-slate-200 px-6 py-3 text-xs text-slate-500">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <Send className="h-3 w-3" />
                  Eingegangen {formatDateTime(antrag.submitted_at)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="h-3 w-3" />
                  Sprache {antrag.submitted_language.toUpperCase()}
                </span>
                {antrag.ip_address && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    IP {antrag.ip_address}
                  </span>
                )}
              </div>
              {antrag.user_agent && (
                <div className="mt-1 truncate text-[11px] text-slate-400" title={antrag.user_agent}>
                  {antrag.user_agent}
                </div>
              )}
            </div>
          </Card>
        </div>

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

          <PruefungsCard antragId={antrag.id} />

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

// ─────────────────────────────────────────────────────────────────────
// Layout-Helfer für Antragsdaten-Karte
// ─────────────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="px-6 py-5">
      <div className="flex items-center gap-2.5 mb-4 pb-2 border-b border-slate-200">
        <span className="text-wue-rot" aria-hidden="true">
          {icon}
        </span>
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-slate-900 leading-tight">
          {title}
        </h3>
        {subtitle && (
          <span className="text-xs text-slate-500 font-normal normal-case tracking-normal">
            · {subtitle}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function FieldRow({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-1">
        {label}
      </div>
      <div className="text-sm text-slate-900">{children}</div>
    </div>
  );
}

function YesNoPill({ value }: { value: string }) {
  const isYes = value === "ja";
  return (
    <span
      className={
        isYes
          ? "inline-flex items-center gap-1 text-slate-900 text-sm"
          : "inline-flex items-center gap-1 text-slate-500 text-sm"
      }
    >
      {isYes ? (
        <Check className="h-3.5 w-3.5 text-wue-rot" />
      ) : (
        <XIcon className="h-3.5 w-3.5 text-slate-400" />
      )}
      {isYes ? "ja" : "nein"}
    </span>
  );
}

function KostenTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-l-2 border-wue-rot bg-wue-rot-soft/40 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-600 font-medium">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
        {formatEuro(value)}
      </div>
    </div>
  );
}

/** IBAN in 4er-Blöcke gruppieren für bessere Lesbarkeit. */
function formatIban(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}
