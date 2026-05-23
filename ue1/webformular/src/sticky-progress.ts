import type { Signal } from "./signals";
import type { FormState } from "./types";
import { isStepComplete } from "./state";

/**
 * Long-Form-Fortschrittsbar.
 * Bedient die Fortschritt-DOM-Elemente aus index.html
 * (#fortschritt-fill und #fortschritt-text) — keine eigene Navigation.
 *
 * Pflicht-Sections sind 1, 2, 4, 5, 6, 7. Step 3 (Wochenplan) ist
 * laut AHP-PDF optional und zählt nicht in die Quote.
 *
 * Step 4 (Bemessungsgrundlage Vorjahr) ist seit dem Refactor 2026-05
 * Pflicht — gem. AHP 2.3 FB III Pkt. 2 (Stadt-Anteil bestimmt die
 * Auszahlung, Teilnehmer + Veranstaltungen die Gewichtung). Die alten
 * Steps 4/5/6 sind dadurch auf 5/6/7 verschoben.
 */
const PFLICHT_STEPS: ReadonlyArray<1 | 2 | 4 | 5 | 6 | 7> = [1, 2, 4, 5, 6, 7];

export function attachStickyProgress(stateSig: Signal<FormState>): void {
  const fill = document.getElementById("fortschritt-fill") as HTMLElement | null;
  const text = document.getElementById("fortschritt-text") as HTMLElement | null;
  if (!fill || !text) return;

  const update = () => {
    const total = PFLICHT_STEPS.length;
    const done = PFLICHT_STEPS.filter((s) => isStepComplete(s, stateSig.value)).length;
    const pct = Math.round((done / total) * 100);
    fill.style.width = `${pct}%`;
    text.textContent = `${done} / ${total}`;
  };
  update();
  stateSig.subscribe(update);
}
