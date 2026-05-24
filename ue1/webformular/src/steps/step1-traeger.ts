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

  const set = (patch: Partial<FormState>) => {
    stateSig.value = { ...stateSig.value, ...patch };
  };

  const fields = document.createElement("div");
  fields.className = "fields";

  // Haushaltsjahr editierbar (PDF-Voll-Sync); Default kommt aus
  // autoHaushaltsjahr() im initialState. Range 2020–2030.
  const hjWrap = document.createElement("label");
  hjWrap.htmlFor = "haushaltsjahr";
  hjWrap.className = "full";
  const hjLblSpan = document.createElement("span");
  hjLblSpan.className = "field-label";
  const hjLblTxt = document.createElement("span");
  hjLblTxt.textContent = t("form.label.haushaltsjahr");
  hjLblSpan.appendChild(hjLblTxt);
  const hjStar = document.createElement("span");
  hjStar.className = "pflicht";
  hjStar.textContent = " *";
  hjLblSpan.appendChild(hjStar);
  hjWrap.appendChild(hjLblSpan);
  const hjInput = document.createElement("input");
  hjInput.id = "haushaltsjahr";
  hjInput.name = "haushaltsjahr";
  hjInput.type = "number";
  hjInput.min = "2020";
  hjInput.max = "2030";
  hjInput.step = "1";
  hjInput.required = true;
  hjInput.value = String(stateSig.value.haushaltsjahr);
  hjInput.addEventListener("input", () => {
    const v = parseInt(hjInput.value, 10);
    if (!Number.isNaN(v)) set({ haushaltsjahr: v });
  });
  hjWrap.appendChild(hjInput);
  const hjHint = document.createElement("span");
  hjHint.className = "field-hint";
  hjHint.textContent = t("form.label.haushaltsjahr_hint");
  hjWrap.appendChild(hjHint);
  fields.appendChild(hjWrap);

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
