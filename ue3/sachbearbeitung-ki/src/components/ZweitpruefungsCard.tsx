/**
 * Zweitprüfungs-Card — Vier-Augen-Prinzip-UI.
 *
 * Lebenszyklus:
 *  1. Keine Zweitprüfung existiert  → Auswahl Mensch | KI
 *  2. Mensch-Modus               → Befund-Checkliste + Abschnitte + Kommentar + Abschließen
 *  3. KI-Modus               → "Adversariell starten" → liefert sofort fertige Prüfung
 *  4. Abgeschlossen           → read-only Anzeige
 *  5. Dissens               → Befunde mit Widerspruch sind gelb umrandet
 */
import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Clock, XCircle, HelpCircle, RotateCcw, Sparkles, User, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useSession } from "../hooks/useSession";
import { useBekannteBearbeiter } from "../hooks/useBekannteBearbeiter";
import {
  usePruefungen,
  type AbhakungenJsonb,
  type AbhakungStatus,
  type AbschnittStatus,
  type DissensEintrag,
  type EntscheidungsVorschlag,
  type PrueferTyp,
  type PruefungRow,
} from "../hooks/usePruefungen";
import type { PruefBefund, PruefProtokoll } from "../hooks/usePruefung";

/** Welche Abschnitte werden manuell durchgegangen (analog zu §-Sektionen
 *  im Antragsformular)? */
const ABSCHNITTE: { key: string; label: string }[] = [
  { key: "traeger", label: "Träger / Antragsteller" },
  { key: "raeumlichkeiten", label: "Räumlichkeiten" },
  { key: "foerderbereich", label: "Förderbereich" },
  { key: "finanzen", label: "Finanzen / Kalkulation" },
];

const VORSCHLAG_LABELS: Record<EntscheidungsVorschlag, string> = {
  bewilligen: "Bewilligen",
  ablehnen: "Ablehnen",
  rueckfragen: "Rückfragen",
};

interface Props {
  antragId: string;
  letzteErstpruefung: PruefProtokoll | null;
  zweitpruefungPflicht: boolean;
  pflichtgrund?: string;
}

export function ZweitpruefungsCard({
  antragId,
  letzteErstpruefung,
  zweitpruefungPflicht,
  pflichtgrund,
}: Props) {
  const { session } = useSession();
  const email = session?.user?.email ?? null;
  const {
    zweitpruefung,
    upsert,
    triggerKiZweitpruefung,
    kiZweitpruefungRunning,
    loesche,
    error,
  } = usePruefungen(antragId);

  if (!zweitpruefungPflicht && !zweitpruefung) {
    // Keine Pflicht, noch keine angefangen → Trigger-Button
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zweitprüfung (optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-slate-600">
            Für diesen Antrag ist keine Zweitprüfung erforderlich. Sie können
            sie trotzdem anfordern.
          </p>
          <ZweitpruefungsStart
            antragId={antragId}
            email={email}
            kiRunning={kiZweitpruefungRunning}
            onStartKi={triggerKiZweitpruefung}
            onStartMensch={(pruefer_email) =>
              upsert({
                rolle: "zweitpruefung",
                pruefer_typ: "mensch",
                pruefer_id: pruefer_email,
                pruefprotokoll_id: letzteErstpruefung?.id,
              })
            }
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  if (!zweitpruefung) {
    return (
      <Card className="border-amber-300 bg-amber-50/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Zweitprüfung erforderlich
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pflichtgrund && (
            <p className="text-xs text-amber-800 bg-amber-100 px-2 py-1 rounded">
              Grund: {pflichtgrund}
            </p>
          )}
          <ZweitpruefungsStart
            antragId={antragId}
            email={email}
            kiRunning={kiZweitpruefungRunning}
            onStartKi={triggerKiZweitpruefung}
            onStartMensch={(pruefer_email) =>
              upsert({
                rolle: "zweitpruefung",
                pruefer_typ: "mensch",
                pruefer_id: pruefer_email,
                pruefprotokoll_id: letzteErstpruefung?.id,
              })
            }
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  // Read-only Mode für alle, die nicht die zugewiesene Person sind.
  // Beispiel: Erstprüfer:in A hat B als Zweitprüfer:in zugewiesen — A
  // sieht jetzt nur "Wartet auf B", kann nicht bewerten.
  const istZugewiesenAnAndere =
    zweitpruefung.pruefer_typ === "mensch"
    && !zweitpruefung.abgeschlossen_am
    && email !== null
    && email !== zweitpruefung.pruefer_id;

  return (
    <ZweitpruefungsBody
      zweitpruefung={zweitpruefung}
      letzteErstpruefung={letzteErstpruefung}
      error={error}
      istReadOnlyForCurrentUser={istZugewiesenAnAndere}
      onSave={(patch) => upsert({ id: zweitpruefung.id, rolle: "zweitpruefung",
        pruefer_typ: zweitpruefung.pruefer_typ, pruefer_id: zweitpruefung.pruefer_id,
        pruefer_modus: zweitpruefung.pruefer_modus,
        pruefprotokoll_id: zweitpruefung.pruefprotokoll_id, ...patch })}
      onReset={async () => {
        const confirmMsg =
          zweitpruefung.pruefer_typ === "ki"
            ? "KI-Zweitprüfung verwerfen und neu starten?\n\n"
              + "Der bisherige Eintrag wird gelöscht. Das KI-Prüfprotokoll "
              + "bleibt als Audit-Trail im Verlauf erhalten."
            : "Zweitprüfung verwerfen?\n\nAlle Abhakungen, Kommentare "
              + "und der Vorschlag gehen verloren.";
        if (!confirm(confirmMsg)) return;
        await loesche(zweitpruefung.id);
      }}
    />
  );
}

function ZweitpruefungsStart({
  email,
  kiRunning,
  onStartKi,
  onStartMensch,
}: {
  antragId: string;
  email: string | null;
  kiRunning: boolean;
  onStartKi: () => Promise<unknown>;
  /** Wenn pruefer-email != aktueller User: zugewiesen (wartet auf jemand
   *  anderen). Wenn email == current_user: Selbst-Zweitprüfung. */
  onStartMensch: (pruefer_email: string) => Promise<unknown>;
}) {
  const [mode, setMode] = useState<"select" | "ich" | "andere" | "ki">("select");
  const [zugewieseneEmail, setZugewieseneEmail] = useState("");
  const { emails: bekannteEmails } = useBekannteBearbeiter();

  // Vorschläge sind alle bekannten Bearbeiter:innen außer der/dem
  // aktuell eingeloggten (man weist nicht sich selbst zu)
  const vorschlaege = bekannteEmails.filter((e) => e !== email);

  if (mode === "select") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-700">Wer soll als Zweitprüfer:in agieren?</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button
            variant="outline"
            onClick={() => email && setMode("ich")}
            disabled={!email}
            className="justify-start gap-2 text-left"
            title="Du prüfst selbst — sinnvoll nur, wenn du nicht der Erstprüfer warst"
          >
            <User className="h-4 w-4 shrink-0" />
            <span className="truncate">Ich selbst</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => setMode("andere")}
            className="justify-start gap-2 text-left"
            title="Andere Person zuweisen — klassisches Vier-Augen-Prinzip"
          >
            <UserPlus className="h-4 w-4 shrink-0" />
            <span className="truncate">Andere Person</span>
          </Button>
          <Button
            onClick={() => setMode("ki")}
            className="justify-start gap-2 text-left"
            title="KI prüft adversariell — sucht aktiv nach Schwächen"
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="truncate">KI adversariell</span>
          </Button>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          <strong>Vier-Augen-Prinzip</strong>: idealerweise eine andere
          Person als die/der Erstprüfer:in. KI-Variante ergänzt oder
          ersetzt die Mensch-Prüfung, ist aber methodisch nicht das
          klassische Vier-Augen.
        </p>
      </div>
    );
  }

  if (mode === "ich") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-700">
          Selbst-Zweitprüfung als <strong>{email}</strong> starten?
        </p>
        <div className="flex gap-2">
          <Button onClick={() => email && onStartMensch(email)} size="sm">
            Starten
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMode("select")}>
            Zurück
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "andere") {
    const istValide = zugewieseneEmail.includes("@") && zugewieseneEmail !== email;
    return (
      <div className="space-y-2">
        <label className="text-sm text-slate-700 font-medium block">
          Email-Adresse der Zweitprüfer:in
        </label>
        <input
          type="email"
          list="bekannte-bearbeiter"
          value={zugewieseneEmail}
          onChange={(e) => setZugewieseneEmail(e.target.value)}
          placeholder="vorname.nachname@stadt.wuerzburg.de"
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:border-wue-rot"
        />
        <datalist id="bekannte-bearbeiter">
          {vorschlaege.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
        {vorschlaege.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 mr-1 mt-1">
              Vorschläge:
            </span>
            {vorschlaege.slice(0, 5).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setZugewieseneEmail(e)}
                className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5 hover:bg-slate-50"
              >
                {e}
              </button>
            ))}
          </div>
        )}
        {zugewieseneEmail === email && (
          <p className="text-xs text-amber-700">
            Du kannst dich nicht selbst zuweisen — wähle „Ich selbst" wenn das gewollt ist.
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            disabled={!istValide}
            onClick={() => onStartMensch(zugewieseneEmail)}
            title={istValide ? "" : "Bitte gültige Email tippen oder vorschlagen"}
          >
            Zuweisen
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMode("select")}>
            Zurück
          </Button>
        </div>
      </div>
    );
  }

  // ki
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-700">
        Adversarielle KI-Zweitprüfung starten?
      </p>
      <p className="text-xs text-slate-600 leading-relaxed">
        Die Zweit-KI sucht aktiv nach Schwächen der Erstprüfung,
        bestätigt oder widerspricht den einzelnen Befunden und liefert
        einen eigenen Vorschlag. Dauer ca. 30-60s.
      </p>
      <div className="flex gap-2">
        <Button onClick={onStartKi} disabled={kiRunning} size="sm">
          {kiRunning ? "KI prüft …" : "KI-Lauf starten"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMode("select")} disabled={kiRunning}>
          Zurück
        </Button>
      </div>
    </div>
  );
}

function ZweitpruefungsBody({
  zweitpruefung,
  letzteErstpruefung,
  error,
  istReadOnlyForCurrentUser,
  onSave,
  onReset,
}: {
  zweitpruefung: PruefungRow;
  letzteErstpruefung: PruefProtokoll | null;
  error: string | null;
  /** True wenn die Zweitprüfung an jemand anderen zugewiesen ist und der
   *  aktuelle User nur als Beobachter zusieht (z.B. Erstprüfer:in nach
   *  Zuweisung). UI ist dann read-only, Reset bleibt möglich. */
  istReadOnlyForCurrentUser: boolean;
  onSave: (patch: Partial<{
    abhakungen_jsonb: AbhakungenJsonb;
    gesamt_kommentar: string;
    entscheidungs_vorschlag: EntscheidungsVorschlag;
    abschliessen: boolean;
  }>) => Promise<unknown>;
  onReset: () => Promise<void>;
}) {
  const istAbgeschlossen = !!zweitpruefung.abgeschlossen_am;
  const istKi = zweitpruefung.pruefer_typ === "ki";
  // 'disabled' für Edit-Felder: abgeschlossen ODER ich bin nicht die
  // zugewiesene Person
  const editDisabled = istAbgeschlossen || istReadOnlyForCurrentUser;
  const erstBefunde: PruefBefund[] =
    letzteErstpruefung?.ergebnis_jsonb?.befunde ?? [];
  const dissens: DissensEintrag[] = zweitpruefung.abhakungen_jsonb?.dissens ?? [];

  // Lokaler Edit-State, wird beim Speichern serialisiert
  const [befundChecks, setBefundChecks] = useState<
    Record<string, { status: AbhakungStatus; kommentar?: string }>
  >(zweitpruefung.abhakungen_jsonb?.befunde ?? {});
  const [abschnittChecks, setAbschnittChecks] = useState<
    Record<string, { status: AbschnittStatus; kommentar?: string }>
  >(zweitpruefung.abhakungen_jsonb?.abschnitte ?? {});
  const [kommentar, setKommentar] = useState(zweitpruefung.gesamt_kommentar ?? "");
  const [vorschlag, setVorschlag] = useState<EntscheidungsVorschlag | "">(
    zweitpruefung.entscheidungs_vorschlag ?? "",
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBefundChecks(zweitpruefung.abhakungen_jsonb?.befunde ?? {});
    setAbschnittChecks(zweitpruefung.abhakungen_jsonb?.abschnitte ?? {});
    setKommentar(zweitpruefung.gesamt_kommentar ?? "");
    setVorschlag(zweitpruefung.entscheidungs_vorschlag ?? "");
  }, [zweitpruefung]);

  function setBefundStatus(idx: number, status: AbhakungStatus) {
    setBefundChecks((prev) => ({
      ...prev,
      [String(idx)]: { ...prev[String(idx)], status },
    }));
  }
  function setBefundKommentar(idx: number, kommentar: string) {
    setBefundChecks((prev) => ({
      ...prev,
      [String(idx)]: { status: prev[String(idx)]?.status ?? "unklar", kommentar },
    }));
  }
  function setAbschnitt(key: string, status: AbschnittStatus) {
    setAbschnittChecks((prev) => ({
      ...prev,
      [key]: { ...prev[key], status },
    }));
  }
  function setAbschnittKommentar(key: string, kommentar: string) {
    setAbschnittChecks((prev) => ({
      ...prev,
      [key]: { status: prev[key]?.status ?? "offen", kommentar },
    }));
  }

  function buildAbhakungen(): AbhakungenJsonb {
    return {
      befunde: befundChecks,
      abschnitte: abschnittChecks,
      dissens: zweitpruefung.abhakungen_jsonb?.dissens, // KI-Dissens behalten
    };
  }

  async function speichern(abschliessen: boolean) {
    setSaving(true);
    try {
      await onSave({
        abhakungen_jsonb: buildAbhakungen(),
        gesamt_kommentar: kommentar,
        entscheidungs_vorschlag: (vorschlag || undefined) as EntscheidungsVorschlag | undefined,
        abschliessen,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            {istAbgeschlossen ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            Zweitprüfung
            <span className="text-xs font-normal text-slate-500 ml-2">
              {istKi ? "🤖 KI" : "👤 Mensch"} ({zweitpruefung.pruefer_id})
              {zweitpruefung.pruefer_modus === "adversariell" && " · adversariell"}
            </span>
            {istKi && !istAbgeschlossen && (
              <span className="text-[11px] font-normal text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded ml-2">
                KI-Vorschlag · bitte sichten + abschließen
              </span>
            )}
          </CardTitle>
          <button
            type="button"
            onClick={onReset}
            className="shrink-0 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-700 border border-slate-200 hover:border-rose-300 rounded px-2 py-1 transition-colors"
            title={
              istKi
                ? "KI-Zweitprüfung verwerfen und Auswahl neu öffnen"
                : "Zweitprüfung verwerfen — alle Abhakungen gehen verloren"
            }
          >
            <RotateCcw className="h-3 w-3" />
            Zurücksetzen
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="text-xs bg-rose-50 border border-rose-300 text-rose-800 px-2 py-1.5 rounded">
            <strong>Fehler:</strong> {error}
          </div>
        )}
        {istReadOnlyForCurrentUser && !istAbgeschlossen && (
          <div className="text-xs bg-sky-50 border border-sky-300 text-sky-900 px-3 py-2 rounded flex items-start gap-2">
            <Clock className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <strong>Wartet auf Zweitprüfung von {zweitpruefung.pruefer_id}.</strong>
              <p className="mt-0.5 text-sky-800">
                Du siehst die Card als Beobachter:in. Bewertung und Abschluss
                bleiben der zugewiesenen Person vorbehalten. Falls die Zuweisung
                falsch war, kannst du sie über „Zurücksetzen" oben rechts auflösen.
              </p>
            </div>
          </div>
        )}
        {istAbgeschlossen && (
          <div className="text-xs bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
            Abgeschlossen am {new Date(zweitpruefung.abgeschlossen_am!).toLocaleString("de-DE")} ·
            Vorschlag: <strong>{vorschlag ? VORSCHLAG_LABELS[vorschlag as EntscheidungsVorschlag] : "—"}</strong>
          </div>
        )}

        <ZweitKiBewertung
          dissens={dissens}
          strukturiert={zweitpruefung.abhakungen_jsonb?.ki_strukturiert}
          istKi={istKi}
          gesamtVorschlag={vorschlag || null}
        />


        {/* Befund-Checkliste */}
        {erstBefunde.length > 0 && (
          <section>
            <h4 className="text-sm font-semibold mb-2">
              Befunde der Erstprüfung ({erstBefunde.length})
            </h4>
            <div className="space-y-2">
              {erstBefunde.map((b, idx) => {
                const dissensEintrag = dissens.find(
                  (d) => d.erst_befund_index === idx,
                );
                return (
                  <BefundCheckRow
                    key={idx}
                    idx={idx}
                    befund={b}
                    check={befundChecks[String(idx)]}
                    dissens={dissensEintrag}
                    disabled={editDisabled}
                    onStatus={(s) => setBefundStatus(idx, s)}
                    onKommentar={(k) => setBefundKommentar(idx, k)}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Zusätzliche neue Befunde der Zweit-KI */}
        {dissens.filter((d) => d.art === "neuer_befund").length > 0 && (
          <section>
            <h4 className="text-sm font-semibold mb-2 text-amber-800">
              Zusätzlich von Zweit-KI gefunden
            </h4>
            <div className="space-y-1">
              {dissens
                .filter((d) => d.art === "neuer_befund")
                .map((d, i) => (
                  <div
                    key={i}
                    className="text-xs border-l-2 border-amber-500 bg-amber-50 px-2 py-1 rounded-r"
                  >
                    <strong>[{d.zweit?.schwere}]</strong> {d.zweit?.beschreibung}
                    {d.zweit?.paragraph_ref && (
                      <span className="text-slate-500"> · {d.zweit.paragraph_ref}</span>
                    )}
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Abschnitts-Checkliste */}
        <section>
          <h4 className="text-sm font-semibold mb-2">Antrags-Abschnitte</h4>
          <div className="space-y-1.5">
            {ABSCHNITTE.map((a) => (
              <AbschnittCheckRow
                key={a.key}
                label={a.label}
                check={abschnittChecks[a.key]}
                disabled={editDisabled}
                onStatus={(s) => setAbschnitt(a.key, s)}
                onKommentar={(k) => setAbschnittKommentar(a.key, k)}
              />
            ))}
          </div>
        </section>

        {/* Gesamt-Kommentar */}
        <section>
          <label className="text-sm font-semibold block mb-1">
            Gesamt-Kommentar
          </label>
          <Textarea
            value={kommentar}
            onChange={(e) => setKommentar(e.target.value)}
            disabled={editDisabled}
            rows={3}
            placeholder="Zusammenfassende Einschätzung …"
          />
        </section>

        {/* Vorschlag */}
        <section>
          <label className="text-sm font-semibold block mb-1">
            Entscheidungs-Vorschlag
          </label>
          <div className="flex gap-2 flex-wrap">
            {(["bewilligen", "ablehnen", "rueckfragen"] as const).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={vorschlag === v ? "default" : "outline"}
                onClick={() => !editDisabled && setVorschlag(v)}
                disabled={editDisabled}
                className="text-xs"
              >
                {VORSCHLAG_LABELS[v]}
              </Button>
            ))}
          </div>
        </section>

        {/* Action-Buttons */}
        {!istAbgeschlossen && !istReadOnlyForCurrentUser && (
          <div className="flex gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => speichern(false)}
              disabled={saving}
            >
              Zwischenspeichern
            </Button>
            <Button
              size="sm"
              onClick={() => speichern(true)}
              disabled={saving || !vorschlag}
              title={!vorschlag ? "Vorschlag wählen vor Abschluss" : ""}
            >
              {saving ? "Speichere …" : "Zweitprüfung abschließen"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BefundCheckRow({
  idx,
  befund,
  check,
  dissens,
  disabled,
  onStatus,
  onKommentar,
}: {
  idx: number;
  befund: PruefBefund;
  check?: { status: AbhakungStatus; kommentar?: string };
  dissens?: DissensEintrag;
  disabled: boolean;
  onStatus: (s: AbhakungStatus) => void;
  onKommentar: (k: string) => void;
}) {
  // Nur echte Widersprüche der Zweit-KI sollen den Befund gelb highlighten.
  // 'unbeantwortet' bedeutet nur Stille — kein Konflikt, kein Highlight.
  const istWiderspruch = dissens?.art === "widerspruch";
  const borderClass = istWiderspruch
    ? "border-l-4 border-amber-500 bg-amber-50/50"
    : "border-l-2 border-slate-300";
  return (
    <div className={`${borderClass} pl-3 pr-2 py-2 rounded-r`}>
      <div className="flex items-start gap-2">
        <span className="text-xs text-slate-400 tabular-nums w-5">#{idx + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm">
            <span
              className={
                befund.schwere === "verstoss"
                  ? "text-rose-700 font-medium"
                  : "text-amber-700"
              }
            >
              {befund.schwere === "verstoss" ? "✗" : "⚠"} [{befund.layer}]
            </span>{" "}
            {befund.beschreibung}
          </p>
          {dissens?.art === "widerspruch" && dissens.zweit && (
            <p className="text-xs text-amber-800 mt-1 italic">
              Zweit-KI widerspricht: {dissens.zweit.begruendung}
              {dissens.zweit.alternative_schwere && (
                <> (vorgeschlagen als <strong>{dissens.zweit.alternative_schwere}</strong>)</>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <CheckButton
            active={check?.status === "bestaetigt"}
            label="Bestätigt"
            color="emerald"
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            disabled={disabled}
            onClick={() => onStatus("bestaetigt")}
          />
          <CheckButton
            active={check?.status === "widerspruch"}
            label="Widerspruch"
            color="rose"
            icon={<XCircle className="h-3.5 w-3.5" />}
            disabled={disabled}
            onClick={() => onStatus("widerspruch")}
          />
          <CheckButton
            active={check?.status === "unklar"}
            label="Unklar"
            color="amber"
            icon={<HelpCircle className="h-3.5 w-3.5" />}
            disabled={disabled}
            onClick={() => onStatus("unklar")}
          />
        </div>
      </div>
      {check?.status && (
        <input
          type="text"
          value={check?.kommentar ?? ""}
          onChange={(e) => onKommentar(e.target.value)}
          disabled={disabled}
          placeholder="Kommentar (optional)"
          className="mt-1.5 ml-7 w-[calc(100%-2rem)] text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-wue-rot"
        />
      )}
    </div>
  );
}

function AbschnittCheckRow({
  label,
  check,
  disabled,
  onStatus,
  onKommentar,
}: {
  label: string;
  check?: { status: AbschnittStatus; kommentar?: string };
  disabled: boolean;
  onStatus: (s: AbschnittStatus) => void;
  onKommentar: (k: string) => void;
}) {
  const istGeprueft = check?.status === "geprueft";
  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        type="button"
        onClick={() => !disabled && onStatus(istGeprueft ? "offen" : "geprueft")}
        disabled={disabled}
        className={
          istGeprueft
            ? "shrink-0 w-5 h-5 rounded border-2 border-emerald-600 bg-emerald-600 text-white flex items-center justify-center"
            : "shrink-0 w-5 h-5 rounded border-2 border-slate-300 hover:border-slate-500"
        }
      >
        {istGeprueft && <CheckCircle2 className="h-3 w-3" />}
      </button>
      <span className={istGeprueft ? "text-slate-700" : "text-slate-500"}>
        {label}
      </span>
      <input
        type="text"
        value={check?.kommentar ?? ""}
        onChange={(e) => onKommentar(e.target.value)}
        disabled={disabled}
        placeholder="Notiz …"
        className="flex-1 text-xs border-b border-slate-200 px-1 py-0.5 focus:outline-none focus:border-wue-rot"
      />
    </div>
  );
}

function CheckButton({
  active,
  label,
  color,
  icon,
  disabled,
  onClick,
}: {
  active: boolean;
  label: string;
  color: "emerald" | "rose" | "amber";
  icon: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  const palette = {
    emerald: active
      ? "bg-emerald-600 text-white border-emerald-600"
      : "text-emerald-700 border-emerald-300 hover:bg-emerald-50",
    rose: active
      ? "bg-rose-600 text-white border-rose-600"
      : "text-rose-700 border-rose-300 hover:bg-rose-50",
    amber: active
      ? "bg-amber-500 text-white border-amber-500"
      : "text-amber-700 border-amber-300 hover:bg-amber-50",
  }[color];
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${palette} disabled:opacity-50`}
    >
      {icon}
    </button>
  );
}

/**
 * Differenzierte Anzeige der KI-Zweitprüfungs-Bewertung.
 *
 * Vier mögliche Zustände:
 *  1. Echtes Dissens (Widersprüche oder neue Befunde) → gelb 'KI-Dissens'
 *  2. Keine strukturierte Antwort (KI hat das Tool-JSON nicht ausgefüllt)
 *     → grau 'KI lieferte keine differenzierte Beurteilung — manuelle
 *     Bewertung empfohlen'
 *  3. Strukturierte Antwort, nur 'unbeantwortet'-Einträge (KI hat zwar
 *     bewertet, aber einzelne Erst-Befunde übergangen) → blau 'Hinweis:
 *     n Erst-Befunde nicht einzeln kommentiert'
 *  4. Strukturierte Antwort + alle Erst-Befunde bestätigt → grün
 *     'Zweit-KI bestätigt die Erstprüfung'
 *
 * Nicht jeder dieser Zustände ist Dissens — das alte 'KI-Dissens'-Label
 * war für 2/3 dieser Fälle irreführend.
 */
function ZweitKiBewertung({
  dissens, strukturiert, istKi, gesamtVorschlag,
}: {
  dissens: DissensEintrag[];
  strukturiert?: boolean;
  istKi: boolean;
  gesamtVorschlag: string | null;
}) {
  if (!istKi) return null;  // bei Mensch-Zweitprüfer kein KI-Banner

  const wid = dissens.filter((d) => d.art === "widerspruch").length;
  const neu = dissens.filter((d) => d.art === "neuer_befund").length;
  const offen = dissens.filter((d) => d.art === "unbeantwortet").length;

  // 1. Echtes Dissens → gelbe Warn-Box
  if (wid > 0 || neu > 0) {
    return (
      <div className="border border-amber-300 bg-amber-50 rounded px-3 py-2 text-xs space-y-0.5">
        <div className="font-semibold text-amber-900 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          KI-Dissens
        </div>
        <ul className="text-amber-800 ml-5 list-disc">
          {wid > 0 && <li>{wid} Widerspruch{wid > 1 ? " / -sprüche" : ""}</li>}
          {neu > 0 && <li>{neu} neue:r Befund(e)</li>}
          {offen > 0 && <li>{offen} ohne explizite Bewertung</li>}
        </ul>
      </div>
    );
  }

  // 2. Keine strukturierte Antwort → grauer Hinweis
  if (strukturiert === false) {
    return (
      <div className="border border-slate-300 bg-slate-50 rounded px-3 py-2 text-xs">
        <div className="font-semibold text-slate-700 flex items-center gap-2">
          <HelpCircle className="h-3.5 w-3.5" />
          Zweit-KI ohne differenzierte Beurteilung
        </div>
        <p className="text-slate-600 mt-1">
          Die adversarielle Prüfung hat keinen einzelnen Erst-Befund explizit
          bewertet und keinen Gegenvorschlag formuliert. Bei wichtigen
          Entscheidungen bitte manuell ergänzen oder den Lauf wiederholen.
        </p>
      </div>
    );
  }

  // 3. Strukturierte Antwort, aber einzelne Befunde nicht kommentiert
  if (offen > 0) {
    return (
      <div className="border border-sky-200 bg-sky-50 rounded px-3 py-2 text-xs">
        <div className="font-semibold text-sky-900 flex items-center gap-2">
          <HelpCircle className="h-3.5 w-3.5" />
          Zweit-KI im Detail
        </div>
        <p className="text-sky-800 mt-1">
          {offen} Erst-Befund{offen > 1 ? "e wurden" : " wurde"} nicht einzeln
          kommentiert
          {gesamtVorschlag
            ? `, der Gesamt-Vorschlag der Zweit-KI lautet aber `
            : "."}
          {gesamtVorschlag && <strong>„{gesamtVorschlag}"</strong>}
          {gesamtVorschlag && "."}
        </p>
      </div>
    );
  }

  // 4. Vollständige Bestätigung
  return (
    <div className="border border-emerald-200 bg-emerald-50 rounded px-3 py-2 text-xs">
      <div className="font-semibold text-emerald-900 flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Zweit-KI bestätigt die Erstprüfung
      </div>
      <p className="text-emerald-800 mt-1">
        Keine Widersprüche, keine zusätzlichen Befunde
        {gesamtVorschlag && <> · Gesamt-Vorschlag: <strong>„{gesamtVorschlag}"</strong></>}.
      </p>
    </div>
  );
}
