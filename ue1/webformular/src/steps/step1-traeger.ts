import type { Signal } from "../signals";
import type { FormState } from "../types";
import { renderFieldInput } from "../components/field-input";
import { isValidPLZ } from "../validation";
import { t } from "../i18n";

export function renderStep1(stateSig: Signal<FormState>): HTMLElement {
  const root = document.createElement("section");
  root.className = "bg-white p-6 rounded-lg border border-slate-200";

  const h = document.createElement("h2");
  h.className = "text-lg font-semibold mb-4";
  h.textContent = t("form.legend.traeger");
  root.appendChild(h);

  const set = (patch: Partial<FormState>) => {
    stateSig.value = { ...stateSig.value, ...patch };
  };

  root.appendChild(renderFieldInput({
    id: "haushaltsjahr", label: t("form.label.haushaltsjahr"), type: "number",
    required: true, value: String(stateSig.value.haushaltsjahr),
    onChange: (v) => set({ haushaltsjahr: Number(v) || 0 }),
  }));
  root.appendChild(renderFieldInput({
    id: "name", label: t("form.label.name"), required: true,
    value: stateSig.value.name, onChange: (v) => set({ name: v }),
  }));
  root.appendChild(renderFieldInput({
    id: "traeger", label: t("form.label.traeger"), required: true,
    value: stateSig.value.traeger, onChange: (v) => set({ traeger: v }),
  }));

  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 sm:grid-cols-4 gap-3";
  grid.appendChild(wrapInGrid(renderFieldInput({
    id: "strasse", label: t("form.label.strasse"), required: true,
    value: stateSig.value.strasse, onChange: (v) => set({ strasse: v }),
  }), "sm:col-span-2"));
  grid.appendChild(wrapInGrid(renderFieldInput({
    id: "hausnummer", label: t("form.label.hausnummer"), required: true,
    value: stateSig.value.hausnummer, onChange: (v) => set({ hausnummer: v }),
  }), ""));
  grid.appendChild(wrapInGrid(renderFieldInput({
    id: "plz", label: t("form.label.plz"), required: true,
    value: stateSig.value.plz, onChange: (v) => set({ plz: v }),
    validate: (v) => (v.length > 0 && !isValidPLZ(v) ? t("validation.plz_ungueltig") : null),
  }), ""));
  grid.appendChild(wrapInGrid(renderFieldInput({
    id: "ort", label: t("form.label.ort"), required: true,
    value: stateSig.value.ort, onChange: (v) => set({ ort: v }),
  }), "sm:col-span-4"));
  root.appendChild(grid);

  return root;
}

function wrapInGrid(el: HTMLElement, colSpan: string): HTMLElement {
  const wrap = document.createElement("div");
  if (colSpan) wrap.className = colSpan;
  wrap.appendChild(el);
  return wrap;
}
