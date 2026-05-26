/**
 * Layer D — Externe Validierung via Perplexity Sonar.
 *
 * Sachbearbeiter:in triggert per Klick eine Web-Recherche zu Träger,
 * Adresse und Einrichtung des Antrags. Antworten kommen mit Quellen-URLs
 * (Audit-Trail) und ggf. Auffälligkeiten. Ergebnisse sind explizit als
 * 'Hinweis' markiert — nie rechtsverbindlich.
 *
 * Response-Schema des Backends:
 *   {
 *     befunde: [{ name, titel, art, konfidenz, kommentar, quellen[],
 *                 details, parse_fehler }],
 *     summary: { kritisch, neutral, fehler },
 *   }
 *
 * art: "neutral" → bestätigend, "kritisch" → Auffälligkeit,
 *      "fehler"  → Recherche fehlgeschlagen, "info" → reine Info
 */
import {
  ExternalLink,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Info,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import {
  useExterneValidierung,
  type ExterneValidierungBefund,
  type ExterneValidierungErgebnis,
} from "../hooks/useExterneValidierung";

interface Props {
  antragId: string;
}

export function ExterneValidierungCard({ antragId }: Props) {
  const { data, running, error, validieren } = useExterneValidierung(antragId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Externe Validierung</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Button onClick={validieren} disabled={running} className="w-full">
          {running ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recherche läuft …
            </>
          ) : data ? (
            "Erneut mit öffentlichen Quellen abgleichen"
          ) : (
            "Mit öffentlichen Quellen abgleichen"
          )}
        </Button>
        <p className="text-xs text-slate-500 leading-relaxed">
          Recherchiert <strong>Träger, Adresse und Einrichtung</strong> mit
          Perplexity gegen öffentliche Quellen (Bistum, Caritas, Handelsregister,
          OpenStreetMap u.a.). Liefert Hinweise mit Quellenangabe — keine
          rechtsverbindliche Auskunft. Personenbezogene Daten werden nicht
          übertragen.
        </p>
        {error && (
          <div className="text-xs bg-rose-50 border border-rose-300 text-rose-800 px-2 py-1.5 rounded">
            <strong>Fehler:</strong> {error}
          </div>
        )}
        {data && <ValidierungsErgebnis data={data} />}
      </CardContent>
    </Card>
  );
}

function ValidierungsErgebnis({ data }: { data: ExterneValidierungErgebnis }) {
  const { befunde, summary } = data;
  const hatKritisch = (summary?.kritisch ?? 0) > 0;
  const hatFehler = (summary?.fehler ?? 0) > 0;
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        Letzte Recherche: {new Date(data.geprueft_am).toLocaleString("de-DE")}
      </p>

      {/* Summary-Bar */}
      <div
        className={`border rounded px-3 py-2 text-sm ${
          hatKritisch
            ? "border-amber-300 bg-amber-50"
            : hatFehler
              ? "border-rose-300 bg-rose-50"
              : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <div className="flex items-start gap-2">
          {hatKritisch ? (
            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          ) : hatFehler ? (
            <AlertCircle className="h-4 w-4 text-rose-700 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
          )}
          <p className="text-slate-800">
            {befunde.length === 0
              ? "Keine externe Recherche möglich."
              : hatKritisch
                ? `${summary.kritisch} Auffälligkeit${summary.kritisch === 1 ? "" : "en"} gefunden — bitte prüfen.`
                : hatFehler
                  ? `${summary.fehler} Recherche${summary.fehler === 1 ? "" : "n"} fehlgeschlagen.`
                  : `${befunde.length} Recherche${befunde.length === 1 ? "" : "n"} ohne Auffälligkeit.`}
          </p>
        </div>
      </div>

      {/* Befund-Liste */}
      {befunde.length > 0 && (
        <ul className="space-y-2">
          {befunde.map((b, i) => (
            <BefundZeile key={b.name + i} befund={b} />
          ))}
        </ul>
      )}

      <p className="text-[10px] text-slate-400 italic">
        ⚠ Triage-Hilfe, keine rechtsverbindliche Auskunft. Bei
        Auffälligkeiten manuell mit Verwaltungsdaten abgleichen.
      </p>
    </div>
  );
}

function BefundZeile({ befund }: { befund: ExterneValidierungBefund }) {
  const isKritisch = befund.art === "kritisch";
  const isFehler = befund.art === "fehler";
  const isInfo = befund.art === "info";
  const quellen = Array.isArray(befund.quellen) ? befund.quellen : [];

  return (
    <li
      className={`border-l-2 pl-2 py-1.5 text-xs space-y-1 ${
        isKritisch
          ? "border-amber-500 bg-amber-50"
          : isFehler
            ? "border-rose-500 bg-rose-50"
            : isInfo
              ? "border-sky-500 bg-sky-50"
              : "border-emerald-500 bg-emerald-50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 min-w-0 flex-1">
          {isKritisch ? (
            <AlertTriangle className="h-3 w-3 text-amber-700 shrink-0 mt-0.5" />
          ) : isFehler ? (
            <AlertCircle className="h-3 w-3 text-rose-700 shrink-0 mt-0.5" />
          ) : isInfo ? (
            <Info className="h-3 w-3 text-sky-700 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-3 w-3 text-emerald-700 shrink-0 mt-0.5" />
          )}
          <p className="font-medium text-slate-900">{befund.titel}</p>
        </div>
        <span
          className="shrink-0 text-[10px] uppercase tracking-wider bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded"
          title={`Konfidenz: ${(befund.konfidenz * 100).toFixed(0)}%`}
        >
          {(befund.konfidenz * 100).toFixed(0)}%
        </span>
      </div>
      <p className="text-slate-800 leading-snug pl-4">{befund.kommentar}</p>
      {befund.parse_fehler && (
        <p className="text-[10px] text-rose-700 italic pl-4">
          ⚠ Antwort konnte nicht sicher geparst werden — manuell prüfen.
        </p>
      )}
      {quellen.length > 0 && (
        <ul className="pl-4 space-y-0.5">
          {quellen.map((url, i) => (
            <li key={url + i}>
              <a
                href={url}
                target="_blank"
                rel="noopener nofollow"
                className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 hover:underline"
                title={url}
              >
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                {hostnameOf(url)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
