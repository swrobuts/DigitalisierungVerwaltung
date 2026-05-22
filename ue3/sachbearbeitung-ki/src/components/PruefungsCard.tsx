import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { usePruefung, type PruefBefund } from "../hooks/usePruefung";
import { useSession } from "../hooks/useSession";

const layerLabel: Record<"A" | "B" | "C", string> = {
  A: "Strukturell",
  B: "Ontologie",
  C: "Richtlinie (RAG)",
};

function BefundRow({ b }: { b: PruefBefund }) {
  const color = b.schwere === "verstoss" ? "text-rose-700" : "text-amber-700";
  const icon = b.schwere === "verstoss" ? "✗" : "⚠";
  return (
    <div className="border-l-2 border-slate-200 pl-3 py-1">
      <p className={`text-sm font-medium ${color}`}>
        {icon} [{layerLabel[b.layer]}]
        {b.feld && <span className="text-slate-500"> {b.feld}:</span>} {b.beschreibung}
      </p>
      {b.zitat && (
        <p className="text-xs text-slate-600 italic mt-1">
          „{b.zitat}"{b.section_path && <span className="text-slate-500"> ({b.section_path})</span>}
        </p>
      )}
      {b.paragraph_ref && <p className="text-xs text-slate-500">Bezug: {b.paragraph_ref}</p>}
      {typeof b.konfidenz === "number" && (
        <p className="text-xs text-slate-400">Konfidenz: {Math.round(b.konfidenz * 100)}%</p>
      )}
    </div>
  );
}

export function PruefungsCard({ antragId }: { antragId: string }) {
  const { session } = useSession();
  const email = session?.user?.email ?? "unbekannt";
  const { latest, running, error, pruefen, downloadPdf } = usePruefung(antragId);

  const verstoesse = latest?.ergebnis_jsonb?.befunde?.filter((b) => b.schwere === "verstoss") ?? [];
  const hinweise = latest?.ergebnis_jsonb?.befunde?.filter((b) => b.schwere === "hinweis") ?? [];

  async function openPdf() {
    const url = await downloadPdf();
    if (url) window.open(url, "_blank", "noopener");
    else alert("PDF noch nicht verfügbar — Prüfung evtl. nicht abgeschlossen.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🔍 KI-Prüfung</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Button onClick={() => pruefen(email)} disabled={running} className="w-full">
          {running ? "Prüfung läuft …" : "Antrag prüfen"}
        </Button>
        {error && <p className="text-rose-700 text-xs">{error}</p>}

        {latest && (
          <>
            <p className="text-xs text-slate-500">
              Letzte Prüfung: {new Date(latest.geprueft_am).toLocaleString("de-DE", {timeZone: "Europe/Berlin"})}
              {" · "}{latest.duration_ms ?? "—"} ms · Doctree v{latest.ergebnis_jsonb?.doctree_version ?? "—"}
            </p>
            <p className="text-sm">
              <span className="text-rose-700 font-semibold">{verstoesse.length}</span> Verstöße ·{" "}
              <span className="text-amber-700 font-semibold">{hinweise.length}</span> Hinweise
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {[...verstoesse, ...hinweise].map((b, i) => <BefundRow key={i} b={b} />)}
              {verstoesse.length === 0 && hinweise.length === 0 && (
                <p className="text-emerald-700 text-sm">✓ Keine Befunde — Antrag konform.</p>
              )}
            </div>
            {latest.pdf_storage_path && (
              <Button variant="outline" onClick={openPdf} className="w-full">
                📄 Protokoll als PDF herunterladen
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
