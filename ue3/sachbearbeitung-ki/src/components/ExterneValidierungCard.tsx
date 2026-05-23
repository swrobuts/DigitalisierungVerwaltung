/**
 * Layer D — Externe Validierung via Perplexity Sonar.
 *
 * Sachbearbeiter:in triggert per Klick eine Web-Recherche zu Träger,
 * Adresse und Einrichtung des Antrags. Antworten kommen mit Quellen-URLs
 * (Audit-Trail) und einer Konfidenz. Ergebnisse sind explizit als
 * 'Hinweis' markiert — nie rechtsverbindlich.
 */
import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";

const PRUEFUNG_SERVICE = "https://pruefung.butscher.cloud";

type Art = "kritisch" | "neutral" | "fehler";

interface ExternBefund {
  name: string;
  titel: string;
  art: Art;
  konfidenz: number;
  kommentar: string;
  details: Record<string, unknown>;
  quellen: string[];
  parse_fehler: boolean;
}

interface Response {
  befunde: ExternBefund[];
  summary: { kritisch: number; neutral: number; fehler: number };
}

interface Props {
  antragId: string;
}

export function ExterneValidierungCard({ antragId }: Props) {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function trigger() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(
        `${PRUEFUNG_SERVICE}/api/antrag/${antragId}/validiere-extern`,
        { method: "POST" },
      );
      if (!res.ok) {
        const txt = await res.text();
        setError(`Validierung fehlgeschlagen: ${res.status} ${txt}`);
        return;
      }
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 text-sm pt-5">
        <Button onClick={trigger} disabled={running} className="w-full">
          {running ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recherche läuft …</>
          ) : data ? "Erneut mit öffentlichen Quellen abgleichen" : "Mit öffentlichen Quellen abgleichen"}
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
        {data && (
          <>
            <p className="text-xs text-slate-500">
              Letzte Recherche:{" "}
              {data.summary.kritisch > 0 && (
                <span className="text-rose-700 font-medium">
                  {data.summary.kritisch} kritisch ·{" "}
                </span>
              )}
              <span>{data.summary.neutral} bestätigt/neutral</span>
              {data.summary.fehler > 0 && (
                <span className="text-amber-700"> · {data.summary.fehler} Fehler</span>
              )}
            </p>
            <div className="space-y-2">
              {data.befunde.map((b) => (
                <BefundZeile key={b.name} befund={b} />
              ))}
            </div>
            <p className="text-[10px] text-slate-400 italic">
              ⚠ Triage-Hilfe, keine rechtsverbindliche Auskunft. Bei
              Auffälligkeiten manuell mit Verwaltungsdaten abgleichen.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BefundZeile({ befund: b }: { befund: ExternBefund }) {
  const palette: Record<Art, { box: string; icon: string }> = {
    kritisch: { box: "border-rose-300 bg-rose-50", icon: "🔴" },
    neutral:  { box: "border-slate-200 bg-slate-50", icon: "🟢" },
    fehler:   { box: "border-amber-300 bg-amber-50", icon: "⚠" },
  };
  const pal = palette[b.art];
  const konfidenzText =
    b.konfidenz >= 0.8 ? "hoch"
    : b.konfidenz >= 0.5 ? "mittel"
    : "niedrig";
  return (
    <div className={`border ${pal.box} rounded px-3 py-2 text-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span className="text-sm">{pal.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">{b.titel}</p>
            <p className="text-xs text-slate-700 mt-0.5">{b.kommentar}</p>
            {Object.keys(b.details).length > 0 && (
              <details className="mt-1.5">
                <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-700">
                  Details
                </summary>
                <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                  {Object.entries(b.details).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="font-mono text-slate-500">{k}:</dt>
                      <dd>{formatValue(v)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            {b.quellen.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {b.quellen.map((q, i) => (
                  <a
                    key={q + i}
                    href={q}
                    target="_blank"
                    rel="noopener nofollow"
                    className="inline-flex items-center gap-1 text-[10px] text-sky-700 hover:text-sky-900 hover:underline bg-white border border-sky-200 rounded px-1.5 py-0.5 max-w-[200px] truncate"
                    title={q}
                  >
                    <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                    {hostnameOf(q)}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
        <span
          className={`text-[10px] uppercase tracking-wider shrink-0 px-1.5 py-0.5 rounded ${
            b.konfidenz >= 0.8
              ? "bg-slate-700 text-white"
              : b.konfidenz >= 0.5
                ? "bg-slate-200 text-slate-700"
                : "bg-slate-100 text-slate-500"
          }`}
          title={`Konfidenz: ${(b.konfidenz * 100).toFixed(0)}%`}
        >
          {konfidenzText}
        </span>
      </div>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "ja" : "nein";
  return String(v);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
