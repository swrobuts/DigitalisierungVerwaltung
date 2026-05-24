import type { Signal } from "./signals";
import type { FormState } from "./types";
import { isStepComplete } from "./state";

/**
 * Long-Form-Fortschrittsbar.
 * Bedient die Fortschritt-DOM-Elemente aus index.html
 * (#fortschritt-fill und #fortschritt-text) — keine eigene Navigation.
 *
 * v3 (PDF-Voll-Sync): 6 Pflicht-Steps zählen in die Quote.
 *   1 Einrichtung · 2 Kontakt & Bank · 3 Wochenplan · 4 Räume & Kosten ·
 *   6 Programm · 7 Senden.
 *
 * Step 5 (Bemessung) ist optional — das Antrags-PDF fragt diese Werte
 * nicht ab, sie sind nur für FB-III.2 (Begegnungszentren) und FB-III.3
 * (Bildungsträger) relevant. Die Klassifizierung erfolgt durch das
 * Sozialreferat; im Webformular zählt Step 5 daher nicht zur Quote.
 */
const PFLICHT_STEPS: ReadonlyArray<1 | 2 | 3 | 4 | 6 | 7> = [1, 2, 3, 4, 6, 7];

export function attachStickyProgress(stateSig: Signal<FormState>): void {
  const fill = document.getElementById("fortschritt-fill") as HTMLElement | null;
  const text = document.getElementById("fortschritt-text") as HTMLElement | null;
  if (!fill || !text) return;

  const update = () => {
    const total = PFLICHT_STEPS.length;
    const done = PFLICHT_STEPS.filter((s) => isStepComplete(s, stateSig.value)).length;
    const pct = Math.round((done / total) * 100);
    fill.style.width = `${pct}%`;
    text.textContent = `${done} / ${total}`;
  };
  update();
  stateSig.subscribe(update);
}
