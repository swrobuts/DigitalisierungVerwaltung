/**
 * RechtskonformFooter — kollabierbarer Block ganz unten am Antragsdokument.
 * Zeigt eine Kurz-Übersicht der 8 Gegenmaßnahmen zur Hochrisiko-Beherrschung
 * + Link auf die vollständige PDF-Doku (Browser-Print).
 *
 * Adressaten: Antragsteller, Bürger:innen, Aufsichtsbehörden. Wer den
 * Antrag öffnet, soll sofort sehen: das System hat einen klaren rechts-
 * konformen Rahmen, in dem KI eingesetzt wird.
 *
 * Identische Datei in UE2 + UE3.
 */
import { useState } from "react";
import { ChevronDown, Shield, ExternalLink } from "lucide-react";

const PUNKTE_KURZ = [
  { titel: "Human-in-the-Loop", rg: "AI Act Art. 14 Abs. 4 lit. d" },
  { titel: "Verbot vollautomatisierter Entscheidung", rg: "DSGVO Art. 22 + § 35a VwVfG" },
  { titel: "Anti-Automation-Bias", rg: "AI Act Art. 14 Abs. 4 lit. b" },
  { titel: "Stop-Funktion + Vier-Augen-Prinzip", rg: "AI Act Art. 14 Abs. 4 lit. e" },
  { titel: "Halluzinations-Hard-Fail", rg: "AI Act Art. 9 + Art. 13" },
  { titel: "Vollständiger Audit-Trail", rg: "AI Act Art. 12 + DSGVO Art. 5" },
  { titel: "Transparenz gegenüber Antragsteller", rg: "AI Act Art. 50" },
  { titel: "Risiko-Management-System", rg: "AI Act Art. 9 Abs. 2" },
];

export function RechtskonformFooter() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-slate-50 border-t border-slate-200 px-10 lg:px-14 py-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-xs text-slate-600 hover:text-slate-900"
        aria-expanded={open}
      >
        <Shield className="h-3.5 w-3.5 text-amber-600 shrink-0" />
        <span className="font-medium">Rechtskonforme KI-Nutzung</span>
        <span className="text-slate-400 font-normal">
          ({PUNKTE_KURZ.length} Gegenmaßnahmen · AI Act + DSGVO + VwVfG)
        </span>
        <ChevronDown
          className={
            "h-3.5 w-3.5 text-slate-400 ml-auto transition-transform " +
            (open ? "rotate-180" : "")
          }
        />
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
          {PUNKTE_KURZ.map((p, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="text-slate-400 tabular-nums shrink-0">
                {(i + 1).toString().padStart(2, "0")}
              </span>
              <span className="text-slate-700">{p.titel}</span>
              <span className="text-slate-400 font-mono text-[10px] ml-auto">
                {p.rg}
              </span>
            </div>
          ))}
          <div className="md:col-span-2 mt-3 pt-3 border-t border-slate-200 flex items-center justify-between gap-4 flex-wrap">
            <span className="text-[11px] text-slate-500">
              Hochrisiko-Klassifikation nach AI Act Anhang III Nr. 5(a) —
              vollständige Doku mit Wortlaut der Rechtsgrundlagen:
            </span>
            <a
              href="/rechtskonforme-ki-nutzung.html"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-[11px] text-amber-700 hover:text-amber-900 border border-amber-300 hover:border-amber-500 rounded px-2 py-0.5 font-medium bg-white"
            >
              <ExternalLink className="h-3 w-3" />
              Als PDF herunterladen
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
