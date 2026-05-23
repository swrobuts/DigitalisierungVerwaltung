/**
 * Adoption-Dashboard — sichtbar machen, ob das Vier-Augen-Prinzip
 * tatsächlich wirkt oder ob die KI-Empfehlung blind übernommen wird.
 *
 * Zentrale Metrik: Übernahme-Quote (gefolgt / mit_ki_empfehlung).
 * Health-Klassifizierung kommt vom Backend (60-80% = gesund, > 90% =
 * Automation-Bias-Verdacht, < 40% = KI unzuverlässig).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { formatEuro } from "../lib/format";

const PRUEFUNG_SERVICE = "https://pruefung.butscher.cloud";

interface Paar {
  bescheid_id: string;
  empfehlung: "bewilligen" | "ablehnen" | "rueckfragen";
  entscheidung: "bewilligt" | "abgelehnt" | "rueckfrage";
  gefolgt: boolean;
  ausgestellt_am: string;
  bewilligte_summe_euro: number | null;
}

interface AdoptionData {
  anzahl_bescheide_gesamt: number;
  anzahl_mit_ki_empfehlung: number;
  anzahl_ohne_ki_empfehlung: number;
  anzahl_gefolgt: number;
  anzahl_ueberstimmt: number;
  uebernahme_quote: number;
  health: "gesund" | "automation_bias_verdacht" | "ki_unzuverlaessig" | "keine_daten";
  health_text: string;
  per_aktion: Record<string, { gefolgt: number; ueberstimmt: number }>;
  letzte_paare: Paar[];
}

export function AdoptionDashboard() {
  const [data, setData] = useState<AdoptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${PRUEFUNG_SERVICE}/api/dashboard/adoption`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: AdoptionData) => setData(d))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-3 flex items-center gap-4">
        <Link to="/inbox" className="text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Inbox
        </Link>
        <span className="text-slate-300">·</span>
        <h1 className="text-lg font-bold">Adoption-Dashboard</h1>
        <span className="text-xs text-slate-500 ml-2">
          KI-Empfehlung vs. finale Entscheidung
        </span>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {loading && <p className="text-slate-500">Lade …</p>}
        {error && (
          <Card>
            <CardContent className="pt-6 text-rose-700 text-sm">
              Fehler: {error}
            </CardContent>
          </Card>
        )}
        {data && (
          <div className="space-y-4">
            <HealthBox data={data} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KennzahlCard
                label="Bescheide gesamt"
                wert={data.anzahl_bescheide_gesamt}
                sub={`${data.anzahl_mit_ki_empfehlung} mit KI-Empfehlung verknüpft`}
              />
              <KennzahlCard
                label="KI-Empfehlung gefolgt"
                wert={data.anzahl_gefolgt}
                sub={
                  data.anzahl_mit_ki_empfehlung > 0
                    ? `${(data.uebernahme_quote * 100).toFixed(0)}% Übernahme-Quote`
                    : "—"
                }
              />
              <KennzahlCard
                label="Überstimmt"
                wert={data.anzahl_ueberstimmt}
                sub={
                  data.anzahl_mit_ki_empfehlung > 0
                    ? `${((1 - data.uebernahme_quote) * 100).toFixed(0)}% Override-Quote`
                    : "—"
                }
                tone={data.anzahl_ueberstimmt > 0 ? "positiv" : "neutral"}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Aufschlüsselung pro Empfehlungs-Aktion</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(data.per_aktion).length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Keine Daten.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="text-left py-1">KI empfahl</th>
                        <th className="text-right py-1">Gefolgt</th>
                        <th className="text-right py-1">Überstimmt</th>
                        <th className="text-right py-1">Quote</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.per_aktion).map(([k, v]) => {
                        const total = v.gefolgt + v.ueberstimmt;
                        const quote = total > 0 ? v.gefolgt / total : 0;
                        return (
                          <tr key={k} className="border-t border-slate-100">
                            <td className="py-1.5">{LABELS[k] ?? k}</td>
                            <td className="py-1.5 text-right tabular-nums">{v.gefolgt}</td>
                            <td className="py-1.5 text-right tabular-nums">{v.ueberstimmt}</td>
                            <td className="py-1.5 text-right tabular-nums font-medium">
                              {(quote * 100).toFixed(0)}%
                            </td>
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
                <CardTitle className="text-base">Letzte 10 Bescheide</CardTitle>
              </CardHeader>
              <CardContent>
                {data.letzte_paare.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Keine Bescheide mit KI-Empfehlung.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="text-left py-1">Datum</th>
                        <th className="text-left py-1">KI-Vorschlag</th>
                        <th className="text-left py-1">Entscheidung</th>
                        <th className="text-right py-1">Summe</th>
                        <th className="text-center py-1">Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.letzte_paare.map((p) => (
                        <tr key={p.bescheid_id} className="border-t border-slate-100">
                          <td className="py-1.5 text-xs text-slate-600">
                            {new Date(p.ausgestellt_am).toLocaleDateString("de-DE")}
                          </td>
                          <td className="py-1.5">{LABELS[p.empfehlung]}</td>
                          <td className="py-1.5">{LABELS_ENT[p.entscheidung]}</td>
                          <td className="py-1.5 text-right tabular-nums text-xs">
                            {p.bewilligte_summe_euro != null
                              ? formatEuro(p.bewilligte_summe_euro)
                              : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="py-1.5 text-center">
                            {p.gefolgt ? (
                              <span className="text-emerald-600" title="Gefolgt">✓</span>
                            ) : (
                              <span className="text-amber-600" title="Überstimmt">↯</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-slate-400 italic">
              Daten werden direkt aus pruefprotokoll + bescheide abgeleitet —
              keine separate Telemetrie, keine personenbezogenen Tracker.
              Healthy-Bandbreite (Literatur): 60-80% Übernahme-Quote.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

const LABELS: Record<string, string> = {
  bewilligen: "Bewilligen",
  ablehnen: "Ablehnen",
  rueckfragen: "Rückfragen",
};
const LABELS_ENT: Record<string, string> = {
  bewilligt: "Bewilligt",
  abgelehnt: "Abgelehnt",
  rueckfrage: "Rückfrage",
};

function HealthBox({ data }: { data: AdoptionData }) {
  const palette: Record<AdoptionData["health"], { box: string; icon: React.ReactNode; titel: string }> = {
    gesund: {
      box: "bg-emerald-50 border-emerald-300",
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-700" />,
      titel: "Vier-Augen-Prinzip wirksam",
    },
    automation_bias_verdacht: {
      box: "bg-rose-50 border-rose-300",
      icon: <AlertTriangle className="h-5 w-5 text-rose-700" />,
      titel: "Verdacht auf Automation Bias",
    },
    ki_unzuverlaessig: {
      box: "bg-amber-50 border-amber-300",
      icon: <AlertTriangle className="h-5 w-5 text-amber-700" />,
      titel: "KI-Empfehlung wenig hilfreich",
    },
    keine_daten: {
      box: "bg-slate-50 border-slate-300",
      icon: <Activity className="h-5 w-5 text-slate-500" />,
      titel: "Noch keine Daten",
    },
  };
  const p = palette[data.health];
  return (
    <div className={`border rounded p-4 flex gap-3 items-start ${p.box}`}>
      {p.icon}
      <div>
        <p className="font-semibold text-slate-900">{p.titel}</p>
        <p className="text-sm text-slate-700 mt-0.5">{data.health_text}</p>
      </div>
    </div>
  );
}

function KennzahlCard({
  label, wert, sub, tone = "neutral",
}: {
  label: string;
  wert: number;
  sub: string;
  tone?: "neutral" | "positiv";
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
          {label}
        </p>
        <p
          className={`text-3xl font-semibold tabular-nums mt-1 ${
            tone === "positiv" ? "text-emerald-700" : "text-slate-900"
          }`}
        >
          {wert}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}
