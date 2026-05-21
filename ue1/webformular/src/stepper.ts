import type { Signal } from "./signals";
import type { FormState } from "./types";
import { isStepComplete } from "./state";
import { t } from "./i18n";

const STEP_LABEL_KEYS = [
  "stepper.1.titel",
  "stepper.2.titel",
  "stepper.3.titel",
  "stepper.4.titel",
  "stepper.5.titel",
  "stepper.6.titel",
];

export function renderStepper(stateSig: Signal<FormState>): HTMLElement {
  const wrap = document.createElement("nav");
  wrap.className = "mb-6";

  const bubbles = document.createElement("ol");
  bubbles.className = "flex items-center justify-between gap-1 mb-2";

  const update = () => {
    const s = stateSig.value;
    bubbles.innerHTML = "";
    for (let i = 1; i <= 6; i++) {
      const li = document.createElement("li");
      li.className = "flex-1 flex flex-col items-center";
      const btn = document.createElement("button");
      btn.type = "button";
      const done = i < s.step && isStepComplete(i, s);
      const active = i === s.step;
      const cls = active
        ? "bg-blue-700 text-white"
        : done
          ? "bg-emerald-600 text-white"
          : "bg-slate-200 text-slate-600";
      btn.className = `h-8 w-8 rounded-full text-xs font-semibold ${cls}`;
      btn.textContent = done ? "✓" : String(i);
      btn.addEventListener("click", () => {
        stateSig.value = { ...s, step: i as FormState["step"] };
      });
      li.appendChild(btn);
      const lbl = document.createElement("span");
      lbl.className = "mt-1 text-[10px] sm:text-xs text-slate-600 text-center";
      lbl.textContent = t(STEP_LABEL_KEYS[i - 1]);
      li.appendChild(lbl);
      bubbles.appendChild(li);
    }
  };
  update();
  stateSig.subscribe(update);

  wrap.appendChild(bubbles);

  const progress = document.createElement("p");
  progress.className = "text-center text-xs text-slate-500";
  const updateProgress = () => {
    progress.textContent = t("stepper.fortschritt")
      .replace("{n}", String(stateSig.value.step))
      .replace("{total}", "6");
  };
  updateProgress();
  stateSig.subscribe(updateProgress);
  wrap.appendChild(progress);

  return wrap;
}
