/**
 * Layer D — Externe Validierung via Perplexity Sonar.
 *
 * Sachbearbeiter:in triggert per Klick eine Web-Recherche zu Träger,
 * Adresse und Einrichtung des Antrags. Antworten kommen mit Quellen-URLs
 * (Audit-Trail) und ggf. Warnungen. Ergebnisse sind explizit als
 * 'Hinweis' markiert — nie rechtsverbindlich.
 *
 * Anpassung Etappe E (apl2→apl-Vollrestoration):
 *  - Fetch-Logik vollständig in useExterneValidierung gekapselt
 *    (POST /api/antrag/{id}/validiere-extern bleibt unverändert)
 *  - Response-Schema umgestellt von altem { befunde[], summary } auf
 *    aktuelles ExterneValidierungErgebnis { recherche_summary,
 *    gefundene_quellen[], warnungen[], geprueft_am }
 */
import { ExternalLink, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import {
  useExterneValidierung,
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
  const hatWarnungen = data.warnungen.length > 0;
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        Letzte Recherche: {new Date(data.geprueft_am).toLocaleString("de-DE")}
      </p>

      {/* Zusammenfassung */}
      <div
        className={`border rounded px-3 py-2 text-sm ${
          hatWarnungen
            ? "border-amber-300 bg-amber-50"
            : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <div className="flex items-start gap-2">
          {hatWarnungen ? (
            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
          )}
          <p className="text-slate-800">{data.recherche_summary}</p>
        </div>
      </div>

      {/* Warnungen */}
      {hatWarnungen && (
        <section>
          <h4 className="text-xs uppercase tracking-wider text-amber-800 font-semibold mb-1">
            Warnungen ({data.warnungen.length})
          </h4>
          <ul className="space-y-1 text-sm">
            {data.warnungen.map((w, i) => (
              <li
                key={i}
                className="border-l-2 border-amber-500 bg-amber-50 pl-2 py-1 text-amber-900 text-xs"
              >
                {w}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Quellen */}
      {data.gefundene_quellen.length > 0 && (
        <section>
          <h4 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">
            Quellen ({data.gefundene_quellen.length})
          </h4>
          <ul className="space-y-1.5">
            {data.gefundene_quellen.map((q, i) => (
              <QuellenZeile key={q.url + i} quelle={q} />
            ))}
          </ul>
        </section>
      )}

      <p className="text-[10px] text-slate-400 italic">
        ⚠ Triage-Hilfe, keine rechtsverbindliche Auskunft. Bei
        Auffälligkeiten manuell mit Verwaltungsdaten abgleichen.
      </p>
    </div>
  );
}

function QuellenZeile({
  quelle,
}: {
  quelle: { url: string; titel: string; relevanz: string };
}) {
  return (
    <li className="border border-slate-200 rounded px-2 py-1.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900 truncate" title={quelle.titel}>
            {quelle.titel}
          </p>
          <a
            href={quelle.url}
            target="_blank"
            rel="noopener nofollow"
            className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 hover:underline"
            title={quelle.url}
          >
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            {hostnameOf(quelle.url)}
          </a>
        </div>
        <span
          className="shrink-0 text-[10px] uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded"
          title={`Relevanz: ${quelle.relevanz}`}
        >
          {quelle.relevanz}
        </span>
      </div>
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
