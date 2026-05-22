import { useState, type ReactNode } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { usePruefung, type PruefBefund } from "../hooks/usePruefung";
import { useSession } from "../hooks/useSession";
import { useAhpTree, findNodeByPath, pathFromParagraphRef } from "../hooks/useAhpTree";

const layerLabel: Record<"A" | "B" | "C", string> = {
  A: "Strukturell",
  B: "Ontologie",
  C: "Richtlinie (RAG)",
};

function BefundRow({ b }: { b: PruefBefund }) {
  const [showAhp, setShowAhp] = useState(false);
  const color = b.schwere === "verstoss" ? "text-rose-700" : "text-amber-700";
  const icon = b.schwere === "verstoss" ? "✗" : "⚠";
  const ahpPath = pathFromParagraphRef(b.paragraph_ref);
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
      {b.paragraph_ref && (
        <div className="text-xs text-slate-500 mt-1">
          Bezug:{" "}
          <button
            type="button"
            onClick={() => setShowAhp((v) => !v)}
            className="text-wue-rot hover:text-wue-rot-dark hover:underline inline-flex items-center gap-1"
            title="AHP-Wortlaut einblenden"
          >
            {b.paragraph_ref}
            <ExternalLink className="h-3 w-3" />
          </button>
          {ahpPath && (
            <>
              {" · "}
              <a
                href={`/ahp?section=${ahpPath}`}
                target="_blank"
                rel="noopener"
                className="text-slate-500 hover:text-slate-800 underline decoration-dotted"
              >
                im Doctree-Browser öffnen
              </a>
            </>
          )}
        </div>
      )}
      {showAhp && ahpPath && <AhpWortlautPopover path={ahpPath} />}
      {typeof b.konfidenz === "number" && (
        <p className="text-xs text-slate-400">Konfidenz: {Math.round(b.konfidenz * 100)}%</p>
      )}
    </div>
  );
}

/** Klappbare Befund-Gruppe (Verstöße / Hinweise) mit Header-Toggle + Count-Pill. */
function BefundGroup({
  title, count, tone, defaultOpen, children,
}: {
  title: string;
  count: number;
  tone: "rose" | "amber";
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  const headerColor = tone === "rose" ? "text-rose-700" : "text-amber-700";
  const pillColor =
    tone === "rose"
      ? "bg-rose-100 text-rose-800 border-rose-200"
      : "bg-amber-100 text-amber-800 border-amber-200";
  return (
    <div className="border border-slate-200 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
        aria-expanded={open}
      >
        <ChevronDown
          className={
            "h-3.5 w-3.5 text-slate-500 transition-transform shrink-0 " +
            (open ? "" : "-rotate-90")
          }
          aria-hidden="true"
        />
        <span className={`text-sm font-semibold ${headerColor}`}>{title}</span>
        <span
          className={`inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-[11px] font-semibold rounded-full border tabular-nums ${pillColor}`}
        >
          {count}
        </span>
      </button>
      {open && (
        <div className="px-3 py-2 space-y-2 max-h-96 overflow-y-auto bg-white">
          {children}
        </div>
      )}
    </div>
  );
}

/** Lazy-lädt den AHP-Doctree und zeigt den Wortlaut der referenzierten Section
 * inline unter dem Befund — damit der Sachbearbeiter sofort sieht, woher die
 * Begründung rechtlich kommt. */
function AhpWortlautPopover({ path }: { path: string }) {
  const { tree, loading } = useAhpTree();
  const node = findNodeByPath(tree, path);
  if (loading) {
    return <p className="text-xs text-slate-400 mt-2">Lade AHP-Wortlaut …</p>;
  }
  if (!node) {
    return (
      <p className="text-xs text-rose-600 mt-2">
        Section {path} im aktuellen Doctree nicht gefunden.
      </p>
    );
  }
  return (
    <div className="mt-2 bg-wue-rot-soft/40 border border-wue-rot-soft border-l-2 border-l-wue-rot px-3 py-2 rounded-sm">
      <div className="text-[10.5px] uppercase tracking-wider text-wue-rot-dark font-semibold mb-1">
        AHP-Wortlaut · {node.title}
      </div>
      <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
        {node.content || (
          <span className="text-slate-500 italic">
            Diese Section hat keinen direkten Fließtext (siehe Unter-Sections).
          </span>
        )}
      </p>
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

            {verstoesse.length === 0 && hinweise.length === 0 && (
              <p className="text-emerald-700 text-sm">✓ Keine Befunde — Antrag konform.</p>
            )}

            <BefundGroup
              title="Verstöße"
              count={verstoesse.length}
              tone="rose"
              defaultOpen={true}
            >
              {verstoesse.map((b, i) => <BefundRow key={`v-${i}`} b={b} />)}
            </BefundGroup>

            <BefundGroup
              title="Hinweise"
              count={hinweise.length}
              tone="amber"
              defaultOpen={hinweise.length <= 3}
            >
              {hinweise.map((b, i) => <BefundRow key={`h-${i}`} b={b} />)}
            </BefundGroup>

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
