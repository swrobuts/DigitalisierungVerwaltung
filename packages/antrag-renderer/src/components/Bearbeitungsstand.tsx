/**
 * Bearbeitungsstand — Sticky-Stepper-Bar oben auf der Antrag-Detail-Seite.
 *
 * Maps die fünf Workflow-Status (eingegangen, in_pruefung, rueckfrage,
 * bewilligt, abgelehnt) auf drei sichtbare Phasen für Bürger und
 * Sachbearbeitung:
 *   1. Eingegangen
 *   2. In Prüfung   (umfasst in_pruefung + rueckfrage)
 *   3. Entscheidung (bewilligt | abgelehnt)
 *
 * Visuelles Vorbild: Pre-Hard-Cut-Commit 7754322 — horizontaler Stepper
 * mit Sticky-Verhalten am oberen Rand der Detail-Seite.
 *
 * Hinweis: Diese Komponente ersetzt die UE3-lokale `Bearbeitungsstand`
 * (kompakter, ohne Sticky-Bar). Layout-Single-Source-of-Truth ist jetzt
 * @dv/antrag-renderer — UE2 + UE3 nutzen identische Bar.
 */
import { Fragment } from "react";
import type { StatusEnum } from "@dv/data-layer";

const STATUS_LABEL: Record<StatusEnum, string> = {
  eingegangen: "Eingegangen",
  in_pruefung: "In Prüfung",
  rueckfrage: "Rückfrage",
  bewilligt: "Bewilligt",
  abgelehnt: "Abgelehnt",
};

type FlowStep = {
  key: "eingegangen" | "in_pruefung" | "entscheidung";
  label: string;
  /** Status-Werte, die diesen Schritt als „aktuell" markieren. */
  matches: StatusEnum[];
};

const FLOW: FlowStep[] = [
  { key: "eingegangen", label: "Eingegangen", matches: ["eingegangen"] },
  { key: "in_pruefung", label: "In Prüfung", matches: ["in_pruefung", "rueckfrage"] },
  { key: "entscheidung", label: "Entscheidung", matches: ["bewilligt", "abgelehnt"] },
];

interface Props {
  status: StatusEnum;
  /** Sticky-Verhalten — default true. In Storybook/Tests false sinnvoll. */
  sticky?: boolean;
}

export function Bearbeitungsstand({ status, sticky = true }: Props) {
  const currentIdx = FLOW.findIndex((s) => s.matches.includes(status));
  const stickyCls = sticky ? "sticky top-0 z-30" : "";
  return (
    <div className={`bg-white border border-slate-200 rounded-sm shadow-sm ${stickyCls}`}>
      <div className="px-8 lg:px-12 py-3.5">
        <div className="flex items-center justify-between gap-2 text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium mb-2">
          <span>Bearbeitungsstand</span>
          {status === "rueckfrage" && (
            <span className="text-amber-700 normal-case tracking-normal text-[11px]">
              ↩ Rückfrage offen
            </span>
          )}
        </div>
        <ol className="flex items-center gap-2.5">
          {FLOW.map((step, idx) => {
            const reached = idx <= currentIdx;
            const current = idx === currentIdx;
            const isEntscheidung = step.key === "entscheidung" && current;
            return (
              <Fragment key={step.key}>
                <li
                  className="flex items-center gap-3 flex-1 min-w-0"
                  data-testid={current ? "bearbeitungsstand-aktiv" : undefined}
                >
                  <span
                    className={
                      current
                        ? "inline-flex h-8 w-8 items-center justify-center rounded-full bg-wue-rot text-white text-[13px] font-bold tabular-nums shadow-sm shrink-0 ring-[3px] ring-wue-rot/15"
                        : reached
                          ? "inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-white text-[13px] font-semibold tabular-nums shrink-0"
                          : "inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-400 text-[13px] font-semibold tabular-nums shrink-0"
                    }
                    aria-current={current ? "step" : undefined}
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div
                      className={
                        current
                          ? "text-[13px] font-semibold text-slate-900 truncate"
                          : reached
                            ? "text-[13px] font-medium text-slate-700 truncate"
                            : "text-[13px] text-slate-400 truncate"
                      }
                    >
                      {step.label}
                    </div>
                    {/* Sub-Label nur, wenn der Status-Klartext vom Step-Label
                        abweicht (Step "In Prüfung" + Status "Rückfrage", oder
                        Step "Entscheidung" + Status "Bewilligt"/"Abgelehnt").
                        Sonst entstünde die Doppelung Eingegangen/Eingegangen. */}
                    {current && STATUS_LABEL[status] !== step.label && (
                      <div
                        className={
                          isEntscheidung && status === "bewilligt"
                            ? "text-[11px] text-emerald-700 font-semibold truncate"
                            : isEntscheidung && status === "abgelehnt"
                              ? "text-[11px] text-rose-700 font-semibold truncate"
                              : "text-[11px] text-slate-500 truncate"
                        }
                      >
                        {STATUS_LABEL[status]}
                      </div>
                    )}
                  </div>
                </li>
                {idx < FLOW.length - 1 && (
                  <span
                    className={
                      idx < currentIdx
                        ? "h-px flex-1 bg-slate-800"
                        : "h-px flex-1 bg-slate-300"
                    }
                    aria-hidden="true"
                  />
                )}
              </Fragment>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
