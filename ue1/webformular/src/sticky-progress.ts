import type { Signal } from "./signals";
import type { FormState } from "./types";
import { isStepComplete } from "./state";

/**
 * Long-Form-Fortschrittsbar.
 * Bedient die Fortschritt-DOM-Elemente aus index.html
 * (#fortschritt-fill und #fortschritt-text) — keine eigene Navigation.
 *
 * v4 (PDF-Voll-Sync, ohne Bemessungs-Step): 6 Pflicht-Steps.
 *   1 Einrichtung · 2 Kontakt & Bank · 3 Wochenplan · 4 Räume & Kosten ·
 *   5 Programm · 6 Senden.
 *
 * Die früheren Bemessungsfelder (anzahl_teilnehmer/stadtbewohner_anteil/
 * anzahl_veranstaltungen) wurden aus dem Webformular entfernt — das
 * amtliche PDF fragt sie nicht ab. UE3 (Sachbearbeitung) pflegt sie
 * nach, falls der Antrag als FB-III.2/III.3 klassifiziert wird.
 */
const PFLICHT_STEPS: ReadonlyArray<1 | 2 | 3 | 4 | 5 | 6> = [1, 2, 3, 4, 5, 6];

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
