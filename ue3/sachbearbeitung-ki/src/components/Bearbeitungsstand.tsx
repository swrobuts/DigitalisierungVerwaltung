/**
 * 3-Schritt-Stepper für den Antrags-Bearbeitungsstand.
 *
 * Maps die fünf Workflow-Status (eingegangen, in_pruefung, rueckfrage,
 * bewilligt, abgelehnt) auf drei sichtbare Bürger-Verständnis-Stufen:
 *   1. Eingegangen
 *   2. In Prüfung (umfasst in_pruefung + rueckfrage)
 *   3. Entschieden (bewilligt oder abgelehnt)
 *
 * Optionales `entscheidung`-Prop blendet bei Schritt 3 ein Sub-Label ein
 * (z.B. „bewilligt" oder „abgelehnt") — wird in AntragDetail über
 * dem letzten Bescheid gerendert.
 */
import type { Status } from "../lib/workflow";
import { cn } from "../lib/cn";

const SCHRITTE = [
  { nr: 1, label: "Eingegangen" },
  { nr: 2, label: "In Prüfung" },
  { nr: 3, label: "Entschieden" },
] as const;

function aktuellerSchritt(status: Status): 1 | 2 | 3 {
  switch (status) {
    case "eingegangen":
      return 1;
    case "in_pruefung":
    case "rueckfrage":
      return 2;
    case "bewilligt":
    case "abgelehnt":
      return 3;
  }
}

interface Props {
  status: Status;
  /** Optionales Sub-Label für Schritt 3 — etwa „bewilligt" oder „abgelehnt". */
  entscheidung?: string;
}

export function Bearbeitungsstand({ status, entscheidung }: Props) {
  const aktiv = aktuellerSchritt(status);
  return (
    <div className="flex items-center gap-2 w-full">
      {SCHRITTE.map((s, idx) => {
        const istAktiv = s.nr === aktiv;
        const istErreicht = s.nr < aktiv;
        const istKuenftig = s.nr > aktiv;
        const kreisFarbe = istAktiv
          ? "bg-wue-rot text-white border-wue-rot"
          : istErreicht
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-400 border-slate-300";
        const labelFarbe = istAktiv
          ? "text-wue-rot font-semibold"
          : istErreicht
          ? "text-slate-900"
          : "text-slate-400";
        const linienFarbe = istKuenftig ? "bg-slate-200" : "bg-slate-900";
        return (
          <div key={s.nr} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "h-7 w-7 rounded-full border-2 flex items-center justify-center text-xs font-semibold tabular-nums",
                  kreisFarbe,
                )}
                aria-current={istAktiv ? "step" : undefined}
              >
                {s.nr}
              </div>
              <div className={cn("text-[11px] uppercase tracking-wider", labelFarbe)}>
                {s.label}
              </div>
              {s.nr === 3 && entscheidung && aktiv === 3 && (
                <div className="text-[10px] text-slate-500 italic">{entscheidung}</div>
              )}
            </div>
            {idx < SCHRITTE.length - 1 && (
              <div className={cn("h-0.5 flex-1 mx-2", linienFarbe)} aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
}
