import type { Signal } from "../signals";
import type { FormState } from "../types";
import { t } from "../i18n";

export function renderStep5(stateSig: Signal<FormState>): HTMLElement {
  const root = document.createElement("section");
  root.className = "bg-white p-6 rounded-lg border border-slate-200";
  root.dataset.section = "5";

  const h = document.createElement("h2");
  h.className = "text-lg font-semibold mb-4";
  h.textContent = t("form.label.anlage.programm") + " *";
  root.appendChild(h);

  const dropzone = document.createElement("label");
  dropzone.className = "block border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:bg-slate-50";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/pdf,image/jpeg,image/png";
  fileInput.className = "hidden";
  const status = document.createElement("p");
  status.className = "text-slate-600";

  const updateStatus = () => {
    const f = stateSig.value.programm_flyer;
    status.textContent = f
      ? `✓ ${f.name} (${(f.size / 1024).toFixed(0)} KB)`
      : "Datei wählen oder hierher ziehen";
  };
  updateStatus();
  stateSig.subscribe(updateStatus);

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0] ?? null;
    if (f && f.size > 10 * 1024 * 1024) {
      alert("Datei > 10 MB nicht erlaubt");
      return;
    }
    stateSig.value = { ...stateSig.value, programm_flyer: f };
  });

  dropzone.appendChild(fileInput);
  dropzone.appendChild(status);
  root.appendChild(dropzone);

  return root;
}
