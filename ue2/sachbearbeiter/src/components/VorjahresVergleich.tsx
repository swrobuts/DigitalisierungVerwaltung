/**
 * Vorjahres-Vergleich als Collapsible-Card.
 *
 * Lädt /api/antrag/{id}/vergleich-vorjahr on-mount. Zeigt eine
 * Tabelle der relevanten Änderungen — kritische und auffällige zuerst.
 * Wenn kein Vorjahres-Antrag existiert: dezenter Hinweis.
 *
 * UE2-Hinweis: Diese Komponente nutzt zwar den `pruefung`-Service,
 * dort aber nur den SQL-Lookup-Endpunkt `vergleich-vorjahr` — kein LLM.
 * Damit ist sie auch für die "klassische Sachbearbeitung" (ohne KI)
 * vertretbar und wird 1:1 aus UE3 übernommen.
 */
import { useEffect, useState } from "react";
import { ChevronDown, Diff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { formatEuro } from "../lib/format";

const PRUEFUNG_SERVICE = "https://pruefung.butscher.cloud";

interface Aenderung {
  feld: string;
  label: string;
  art: "numerisch" | "strukturell";
  format?: "euro" | "int" | "pct";
  alt: unknown;
  neu: unknown;
  pct_veraenderung?: number | null;
  schwere: "kritisch" | "auffaellig" | "unauffaellig";
  /** Optional: konkrete rechtliche/finanzielle Konsequenz, wenn die
   *  Änderung über die reine Heuristik hinausgeht (z.B. Anteil drückt
   *  Auszahlung unter geforderte Summe). */
  konsequenz?: string;
}

interface VergleichResponse {
  vorjahr: { id: string; haushaltsjahr: number; traeger: string } | null;
  aktuell_hj?: number;
  gesucht_hj?: number;
  aenderungen: Aenderung[];
  anzahl_kritisch?: number;
  anzahl_auffaellig?: number;
}

interface Props {
  antragId: string;
}

export function VorjahresVergleich({ antragId }: Props) {
  const [data, setData] = useState<VergleichResponse | null>(null);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${PRUEFUNG_SERVICE}/api/antrag/${antragId}/vergleich-vorjahr`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: VergleichResponse) => setData(d))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [antragId]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Vorjahres-Vergleich</CardTitle></CardHeader>
        <CardContent className="text-xs text-slate-400">Lade …</CardContent>
      </Card>
    );
  }
  if (error || !data) {
    return null; // still — kein Vorjahres-Vergleich heißt nicht Fehler
  }
  if (!data.vorjahr) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Diff className="h-4 w-4 text-slate-400" />
            Vorjahres-Vergleich
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-slate-500">
          Kein Antrag des gleichen Trägers für Haushaltsjahr
          {" "}{data.gesucht_hj ?? "—"} gefunden. Erstantrag oder Trägername abweichend.
        </CardContent>
      </Card>
    );
  }

  const krit = data.anzahl_kritisch ?? 0;
  const auff = data.anzahl_auffaellig ?? 0;
  const unauff = data.aenderungen.length - krit - auff;

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <CardTitle className="text-base flex items-center gap-2">
            <ChevronDown
              className={
                "h-4 w-4 text-slate-400 transition-transform " +
                (open ? "" : "-rotate-90")
              }
            />
            <Diff className="h-4 w-4 text-slate-400" />
            Vorjahres-Vergleich
          </CardTitle>
          <div className="flex items-center gap-2 text-xs">
            {krit > 0 && (
              <span className="text-rose-700 font-medium">🔴 {krit} kritisch</span>
            )}
            {auff > 0 && (
              <span className="text-amber-700 font-medium">🟡 {auff} auffällig</span>
            )}
            {krit === 0 && auff === 0 && (
              <span className="text-emerald-700">🟢 unauffällig</span>
            )}
          </div>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="pt-1">
          <p className="text-xs text-slate-500 mb-3">
            Verglichen mit Antrag aus Haushaltsjahr{" "}
            <strong>{data.vorjahr.haushaltsjahr}</strong> desselben Trägers.
            {unauff > 0 && (
              <> {unauff} weitere Position(en) ohne wesentliche Änderung.</>
            )}
          </p>
          {data.aenderungen.length === 0 ? (
            <p className="text-xs text-emerald-700">
              Keine wesentlichen Änderungen gegenüber Vorjahr.
            </p>
          ) : (
            <div className="border border-slate-200 rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Position</th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      Vorjahr{data.vorjahr ? ` (${data.vorjahr.haushaltsjahr})` : ""}
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      Aktuell{data.aktuell_hj ? ` (${data.aktuell_hj})` : ""}
                    </th>
                    <th className="text-right px-2 py-1.5 font-medium">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.aenderungen.map((a, i) => (
                    <AenderungZeile key={i} aenderung={a} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function AenderungZeile({ aenderung: a }: { aenderung: Aenderung }) {
  const farbe =
    a.schwere === "kritisch"
      ? "bg-rose-50 border-l-2 border-rose-500"
      : a.schwere === "auffaellig"
      ? "bg-amber-50 border-l-2 border-amber-500"
      : "border-l-2 border-slate-200";
  const punkt =
    a.schwere === "kritisch" ? "🔴" : a.schwere === "auffaellig" ? "🟡" : "🟢";
  return (
    <>
      <tr className={`${farbe} border-t border-slate-100`}>
        <td className="px-2 py-1.5 flex items-center gap-1.5">
          <span>{punkt}</span>
          <span>{a.label}</span>
        </td>
        <td className="px-2 py-1.5 tabular-nums text-slate-600">
          {formatWert(a.alt, a.format)}
        </td>
        <td className="px-2 py-1.5 tabular-nums font-medium">
          {formatWert(a.neu, a.format)}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          {typeof a.pct_veraenderung === "number"
            ? <span className={a.pct_veraenderung > 0 ? "text-rose-700" : "text-emerald-700"}>
                {a.pct_veraenderung > 0 ? "+" : ""}{a.pct_veraenderung.toFixed(0)}%
              </span>
            : <span className="text-slate-400">—</span>}
        </td>
      </tr>
      {a.konsequenz && (
        <tr className={farbe}>
          <td colSpan={4} className="px-2 pb-2 pt-0 text-[11px] text-rose-800 italic">
            ⚠ {a.konsequenz}
          </td>
        </tr>
      )}
    </>
  );
}

function formatWert(v: unknown, format?: "euro" | "int" | "pct"): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  if (format === "euro" && typeof v === "number") return formatEuro(v);
  if (format === "pct" && typeof v === "number") return `${Math.round(v * 100)}%`;
  if (format === "int" && typeof v === "number") return v.toLocaleString("de-DE");
  return String(v);
}
