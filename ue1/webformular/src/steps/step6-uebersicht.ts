import type { Signal } from "../signals";
import type { FormState } from "../types";
import { isStepComplete, isFormComplete } from "../state";
import { antragsfristHinweis } from "../cross-field";
import { t } from "../i18n";

const SECTION_LABELS: Record<number, string> = {
  1: "Träger & Einrichtung",
  2: "Kontakt & Bank",
  3: "Wochenplan (mind. 1 Tag mit Öffnungszeit + Angebot)",
  4: "Räume & Kosten Vorjahr",
  5: "Programm-Nachweis (Wochenplan oder Programm-Flyer)",
  6: "Bestätigung",
};

// Alle 6 Steps sind Pflicht — die früheren Bemessungsfelder sind aus
// dem Webformular entfernt (PDF fragt sie nicht ab; UE3 pflegt sie
// nach, falls FB-III.2/III.3 klassifiziert wird).
const PFLICHT_STEPS = [1, 2, 3, 4, 5, 6] as const;

/**
 * Step 6 — Senden.
 * Im Long-Form-Layout sind alle Eingaben oben sichtbar — eine Pre-Submit-
 * Übersicht wäre redundant. Hier nur noch:
 *   - DSGVO-Bestätigung (Checkbox)
 *   - Druckansicht-Button (window.print)
 *   - Absenden-Button (IMMER aktiv — beim Klick wird isFormComplete geprüft
 *     und bei fehlenden Pflichtfeldern eine konkrete Liste angezeigt)
 *   - Hinweis-Zeile darüber, was noch fehlt (live, ohne Klick)
 */
export function renderStep6Uebersicht(
  stateSig: Signal<FormState>,
  onSubmit: () => Promise<void>,
): HTMLElement {
  const root = document.createElement("fieldset");
  root.dataset.section = "6";

  const legend = document.createElement("legend");
  legend.textContent = t("stepper.6.titel");
  root.appendChild(legend);

  // Cross-Field-Warnhinweis (nicht-blockierend) zur 1.-April-Frist
  // gem. AHP 3.3. Live aktualisiert, kein Submit-Blocker (AHP sagt
  // „grundsätzlich"; finale Bewertung liegt beim Sozialreferat).
  const fristBox = document.createElement("div");
  fristBox.className = "frist-hinweis";
  fristBox.style.marginBottom = "0.8rem";
  fristBox.style.padding = "0.6rem 0.8rem";
  fristBox.style.borderLeft = "3px solid #b07b00";
  fristBox.style.background = "#fff8e6";
  fristBox.hidden = true;
  root.appendChild(fristBox);

  const updateFristHinweis = () => {
    const h = antragsfristHinweis(
      stateSig.value.antragsdatum,
      stateSig.value.haushaltsjahr,
    );
    if (h === null) {
      fristBox.hidden = true;
      fristBox.textContent = "";
    } else {
      fristBox.hidden = false;
      fristBox.textContent = h;
    }
  };
  updateFristHinweis();
  stateSig.subscribe(updateFristHinweis);

  // Bestätigung-Checkbox
  const checkWrap = document.createElement("label");
  checkWrap.className = "bestaetigung";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = stateSig.value.bestaetigt;
  cb.addEventListener("change", () => {
    stateSig.value = { ...stateSig.value, bestaetigt: cb.checked };
  });
  checkWrap.appendChild(cb);
  const span = document.createElement("span");
  span.textContent = t("uebersicht.bestaetigung");
  checkWrap.appendChild(span);
  root.appendChild(checkWrap);

  // Live-Hinweis was fehlt (rote Liste, nur wenn was fehlt)
  const fehlend = document.createElement("div");
  fehlend.className = "fehlend-liste";
  root.appendChild(fehlend);

  function missingSections(s: FormState): number[] {
    return PFLICHT_STEPS.filter((step) => !isStepComplete(step, s));
  }

  const updateFehlend = () => {
    const miss = missingSections(stateSig.value);
    if (miss.length === 0) {
      fehlend.textContent = "";
      fehlend.classList.remove("active");
    } else {
      const labels = miss.map((s) => SECTION_LABELS[s] ?? `Step ${s}`).join(", ");
      fehlend.textContent = `Noch zu vervollständigen: ${labels}`;
      fehlend.classList.add("active");
    }
  };
  updateFehlend();
  stateSig.subscribe(updateFehlend);

  // Buttons
  const actions = document.createElement("div");
  actions.className = "actions";

  const druckBtn = document.createElement("button");
  druckBtn.type = "button";
  druckBtn.textContent = t("form.button.drucken");
  druckBtn.addEventListener("click", () => window.print());
  actions.appendChild(druckBtn);

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.textContent = t("form.button.absenden");
  submitBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    // Hard-Check beim Klick — falls Pflicht fehlt, konkretes Feedback statt no-op
    if (!isFormComplete(stateSig.value)) {
      const miss = missingSections(stateSig.value);
      const labels = miss.map((s) => SECTION_LABELS[s] ?? `Step ${s}`).join("\n  · ");
      alert(`Bitte vor dem Absenden vervollständigen:\n  · ${labels}`);
      // Scroll zur ersten fehlenden Section
      const first = miss[0];
      if (first !== undefined) {
        const target = document.querySelector(`[data-section="${first}"]`);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Wird gesendet …";
    try {
      await onSubmit();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = t("form.button.absenden");
      alert("Fehler beim Absenden: " + (err as Error).message);
    }
  });
  actions.appendChild(submitBtn);

  root.appendChild(actions);
  return root;
}
