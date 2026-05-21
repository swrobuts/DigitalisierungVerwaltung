import type { Signal } from "../signals";
import type { FormState } from "../types";
import { isFormComplete } from "../state";
import { t } from "../i18n";

/**
 * Step 6 — Senden.
 * Im Long-Form-Layout sind alle Eingaben oben sichtbar — eine Pre-Submit-
 * Übersicht wäre redundant. Hier nur noch:
 *   - DSGVO-Bestätigung (Checkbox)
 *   - Druckansicht-Button (window.print)
 *   - Absenden-Button (disabled bis Form komplett + bestätigt)
 */
export function renderStep6(
  stateSig: Signal<FormState>,
  onSubmit: () => Promise<void>,
): HTMLElement {
  const root = document.createElement("fieldset");
  root.dataset.section = "6";

  const legend = document.createElement("legend");
  legend.textContent = t("stepper.6.titel");
  root.appendChild(legend);

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
  const updateBtnState = () => {
    submitBtn.disabled = !isFormComplete(stateSig.value);
  };
  updateBtnState();
  stateSig.subscribe(updateBtnState);
  submitBtn.addEventListener("click", async (e) => {
    e.preventDefault();
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
