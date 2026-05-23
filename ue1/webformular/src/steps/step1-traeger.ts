import type { Signal } from "../signals";
import type { FormState } from "../types";
import { renderFieldInput } from "../components/field-input";
import { isValidPLZ } from "../validation";
import { t } from "../i18n";

export function renderStep1(stateSig: Signal<FormState>): HTMLElement {
  const root = document.createElement("fieldset");
  root.dataset.section = "1";

  const legend = document.createElement("legend");
  legend.textContent = t("form.legend.traeger");
  root.appendChild(legend);

  // Haushaltsjahr-Hinweis (auto-abgeleitet, kein Pflichtfeld mehr seit
  // Abspeckung 2026-05 — Logik in state.autoHaushaltsjahr berücksichtigt
  // die AHP-Frist 1. April).
  const hjHint = document.createElement("p");
  hjHint.className = "field-hint";
  hjHint.style.marginBottom = "0.6rem";
  hjHint.textContent =
    `Antrag für Haushaltsjahr ${stateSig.value.haushaltsjahr} (Frist 1. April ${stateSig.value.haushaltsjahr}, AHP 3.3).`;
  root.appendChild(hjHint);

  const set = (patch: Partial<FormState>) => {
    stateSig.value = { ...stateSig.value, ...patch };
  };

  const fields = document.createElement("div");
  fields.className = "fields";

  fields.appendChild(renderFieldInput({
    id: "name", label: t("form.label.name"), required: true, full: true,
    value: stateSig.value.name, onChange: (v) => set({ name: v }),
  }));
  fields.appendChild(renderFieldInput({
    id: "traeger", label: t("form.label.traeger"), required: true, full: true,
    value: stateSig.value.traeger, onChange: (v) => set({ traeger: v }),
  }));
  fields.appendChild(renderFieldInput({
    id: "strasse", label: t("form.label.strasse"), required: true,
    value: stateSig.value.strasse, onChange: (v) => set({ strasse: v }),
  }));
  fields.appendChild(renderFieldInput({
    id: "hausnummer", label: t("form.label.hausnummer"), required: true,
    value: stateSig.value.hausnummer, onChange: (v) => set({ hausnummer: v }),
  }));
  fields.appendChild(renderFieldInput({
    id: "plz", label: t("form.label.plz"), required: true,
    value: stateSig.value.plz, onChange: (v) => set({ plz: v }),
    validate: (v) => (v.length > 0 && !isValidPLZ(v) ? t("validation.plz_ungueltig") : null),
    placeholder: "97070",
  }));
  fields.appendChild(renderFieldInput({
    id: "ort", label: t("form.label.ort"), required: true, full: true,
    value: stateSig.value.ort, onChange: (v) => set({ ort: v }),
  }));

  root.appendChild(fields);
  return root;
}
