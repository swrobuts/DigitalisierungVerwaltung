/**
 * Compliance-Cockpit Multi-FB.
 *
 * Aggregiert über `apl.antrag_inbox` (read via useAntraege):
 *   - Anzahl Anträge pro FB
 *   - Bewilligungs-Quote (entscheidungs_typ='bewilligt' / entschieden)
 *   - Durchschnittliche Durchlaufzeit (Tage)
 *
 * Client-seitige Aggregation — für die Demo-Mengen (<1k) schnell genug.
 */
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAntraege } from "../hooks/useAntraege";
import { ALL_FOERDERBEREICHE, type FoerderbereichId } from "@dv/foerderbereiche";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { FbIcon } from "../components/FbIcon";

interface FbAggregate {
  fb: FoerderbereichId;
  anzahl: number;
  bewilligt: number;
  abgelehnt: number;
  offen: number;
  durchschnitt_durchlaufzeit: number;
}

export function ComplianceStatus() {
  const { antraege, loading, error } = useAntraege();

  const groups: FbAggregate[] = (["I", "II", "III", "IV"] as FoerderbereichId[]).map((fb) => {
    const rows = antraege.filter((a) => a.foerderbereich === fb);
    const bewilligt = rows.filter((r) => r.entscheidungs_typ === "bewilligt").length;
    const abgelehnt = rows.filter((r) => r.entscheidungs_typ === "abgelehnt").length;
    const offen = rows.length - bewilligt - abgelehnt;
    const summe = rows.reduce((s, r) => s + (r.durchlaufzeit_tage ?? 0), 0);
    return {
      fb,
      anzahl: rows.length,
      bewilligt,
      abgelehnt,
      offen,
      durchschnitt_durchlaufzeit: rows.length === 0 ? 0 : summe / rows.length,
    };
  });

  const total = antraege.length;
  const totalBewilligt = antraege.filter((a) => a.entscheidungs_typ === "bewilligt").length;
  const totalAbgelehnt = antraege.filter((a) => a.entscheidungs_typ === "abgelehnt").length;
  const totalEntschieden = totalBewilligt + totalAbgelehnt;
  const bewilligungsquote = totalEntschieden === 0 ? 0 : totalBewilligt / totalEntschieden;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 relative">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-wue-rot" />
        <div className="w-full px-4 py-3 flex items-center gap-3">
          <Link to="/inbox" className="text-sm text-slate-500 flex items-center gap-1 hover:text-wue-rot">
            <ArrowLeft className="h-4 w-4" /> Inbox
          </Link>
          <span className="text-slate-300">·</span>
          <h1 className="text-xl font-bold">Compliance-Cockpit (Multi-FB)</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {loading && <p className="text-slate-500">Lade …</p>}
        {error && <p className="text-rose-700">Fehler: {error}</p>}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KpiCard label="Anträge gesamt" value={String(total)} />
              <KpiCard
                label="Bewilligungs-Quote (entschieden)"
                value={
                  totalEntschieden === 0
                    ? "—"
                    : `${(bewilligungsquote * 100).toFixed(0)} %`
                }
                hint={`${totalBewilligt} von ${totalEntschieden}`}
              />
              <KpiCard label="Davon abgelehnt" value={String(totalAbgelehnt)} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Pro Förderbereich</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <th className="text-left py-2">FB</th>
                      <th className="text-right py-2">Anträge</th>
                      <th className="text-right py-2">Bewilligt</th>
                      <th className="text-right py-2">Abgelehnt</th>
                      <th className="text-right py-2">Offen</th>
                      <th className="text-right py-2">Quote</th>
                      <th className="text-right py-2">Ø Durchlaufzeit (Tage)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => {
                      const cfg = ALL_FOERDERBEREICHE[g.fb];
                      const entschieden = g.bewilligt + g.abgelehnt;
                      const quote =
                        entschieden === 0 ? "—" : `${((g.bewilligt / entschieden) * 100).toFixed(0)} %`;
                      return (
                        <tr key={g.fb} className="border-b border-slate-100">
                          <td className="py-2">
                            <span className="inline-flex items-center gap-1.5">
                              <FbIcon name={cfg.icon} className="h-3.5 w-3.5" />
                              FB {g.fb} <span className="text-xs text-slate-500">· {cfg.label_kurz}</span>
                            </span>
                          </td>
                          <td className="text-right tabular-nums">{g.anzahl}</td>
                          <td className="text-right tabular-nums text-emerald-700">{g.bewilligt}</td>
                          <td className="text-right tabular-nums text-rose-700">{g.abgelehnt}</td>
                          <td className="text-right tabular-nums text-slate-600">{g.offen}</td>
                          <td className="text-right tabular-nums">{quote}</td>
                          <td className="text-right tabular-nums">
                            {g.durchschnitt_durchlaufzeit.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-3xl font-bold mt-1 tabular-nums">{value}</div>
        {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
