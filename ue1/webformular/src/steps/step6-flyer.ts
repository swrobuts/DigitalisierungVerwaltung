import type { Signal } from "../signals";
import type { FormState } from "../types";
import { t } from "../i18n";

export function renderStep6(stateSig: Signal<FormState>): HTMLElement {
  const root = document.createElement("fieldset");
  root.dataset.section = "6";

  const legend = document.createElement("legend");
  legend.textContent = t("stepper.6.titel");
  root.appendChild(legend);

  const wrap = document.createElement("label");
  wrap.className = "flyer-dropzone";

  const lbl = document.createElement("span");
  lbl.className = "field-label";
  const txt = document.createElement("span");
  txt.textContent = t("form.label.anlage.programm");
  lbl.appendChild(txt);
  const star = document.createElement("span");
  star.className = "pflicht";
  star.textContent = " *";
  lbl.appendChild(star);
  wrap.appendChild(lbl);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/pdf,image/jpeg,image/png";
  wrap.appendChild(fileInput);

  const status = document.createElement("span");
  status.className = "field-hint";
  const updateStatus = () => {
    const f = stateSig.value.programm_flyer;
    status.textContent = f
      ? `✓ ${f.name} (${(f.size / 1024).toFixed(0)} KB)`
      : "";
  };
  updateStatus();
  stateSig.subscribe(updateStatus);
  wrap.appendChild(status);

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0] ?? null;
    if (f && f.size > 10 * 1024 * 1024) {
      alert("Datei > 10 MB nicht erlaubt");
      return;
    }
    stateSig.value = { ...stateSig.value, programm_flyer: f };
  });

  root.appendChild(wrap);
  return root;
}
