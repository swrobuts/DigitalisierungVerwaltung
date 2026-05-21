import "./styles.css";
import { signal } from "./signals";
import { initialState, isStepComplete } from "./state";
import { renderStepper } from "./stepper";
import { renderStep1 } from "./steps/step1-traeger";
import { renderStep2 } from "./steps/step2-kontakt-bank";
import { renderStep3 } from "./steps/step3-wochenplan";
import { renderStep4 } from "./steps/step4-kosten-belege";
import { renderStep5 } from "./steps/step5-flyer";
import { renderStep6 } from "./steps/step6-uebersicht";
import { submitAntrag } from "./submit";
import { setSprache, t } from "./i18n";
import type { FormState, Sprache } from "./types";

const root = document.getElementById("app")!;
const state = signal<FormState>(initialState());
setSprache(state.value.language);

// Header
const header = document.createElement("header");
header.className = "py-4 border-b border-slate-200 bg-white sticky top-0 z-10";
const headerInner = document.createElement("div");
headerInner.className = "max-w-3xl mx-auto px-4 flex justify-between items-center";
const title = document.createElement("h1");
title.className = "font-semibold";
title.textContent = "APL 2 — Stadt Würzburg";
headerInner.appendChild(title);

const langSel = document.createElement("select");
langSel.className = "text-sm rounded border border-slate-300 px-2 py-1";
for (const code of ["de", "it", "tr", "es"] as Sprache[]) {
  const opt = document.createElement("option");
  opt.value = code;
  opt.textContent = code.toUpperCase();
  opt.selected = state.value.language === code;
  langSel.appendChild(opt);
}
langSel.addEventListener("change", () => {
  const lang = langSel.value as Sprache;
  setSprache(lang);
  state.value = { ...state.value, language: lang };
});
headerInner.appendChild(langSel);
header.appendChild(headerInner);
root.appendChild(header);

const main = document.createElement("main");
main.className = "max-w-3xl mx-auto p-4";
root.appendChild(main);

const stepper = renderStepper(state);
main.appendChild(stepper);

const stepContainer = document.createElement("div");
main.appendChild(stepContainer);

const nav = document.createElement("div");
nav.className = "mt-6 flex justify-between gap-2";
const backBtn = document.createElement("button");
backBtn.type = "button";
backBtn.className = "rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50";
backBtn.textContent = t("stepper.zurueck");
backBtn.addEventListener("click", () => {
  if (state.value.step > 1) {
    state.value = { ...state.value, step: (state.value.step - 1) as FormState["step"] };
  }
});
nav.appendChild(backBtn);
const nextBtn = document.createElement("button");
nextBtn.type = "button";
nextBtn.className = "rounded bg-blue-700 text-white px-4 py-2 text-sm hover:bg-blue-800 disabled:opacity-50";
nextBtn.textContent = t("stepper.weiter");
nextBtn.addEventListener("click", () => {
  if (state.value.step < 6) {
    state.value = { ...state.value, step: (state.value.step + 1) as FormState["step"] };
  }
});
nav.appendChild(nextBtn);
main.appendChild(nav);

const onSubmit = async () => {
  const result = await submitAntrag(state.value);
  // Unsubscribe vom state, damit der renderActive-Callback nicht auf den
  // gleich entfernten stepContainer schreibt (verhindert Detached-Node-Writes).
  unsubscribe();
  main.innerHTML = "";
  const ok = document.createElement("div");
  ok.className = "bg-white p-6 rounded-lg border border-slate-200 text-center";
  const tick = document.createElement("p");
  tick.className = "text-3xl mb-3";
  tick.textContent = "✓";
  ok.appendChild(tick);
  const h2 = document.createElement("h2");
  h2.className = "text-lg font-semibold mb-2";
  h2.textContent = "Antrag eingegangen";
  ok.appendChild(h2);
  const nr = document.createElement("p");
  nr.textContent = "Ihre Antragsnummer: ";
  const strong = document.createElement("strong");
  strong.textContent = result.antragsnummer; // textContent statt innerHTML — defensiv
  nr.appendChild(strong);
  ok.appendChild(nr);
  const hint = document.createElement("p");
  hint.className = "text-sm text-slate-500 mt-2";
  hint.textContent = "Sie erhalten eine Eingangsbestätigung per E-Mail.";
  ok.appendChild(hint);
  main.appendChild(ok);
};

const renderActive = () => {
  stepContainer.innerHTML = "";
  let el: HTMLElement;
  switch (state.value.step) {
    case 1: el = renderStep1(state); break;
    case 2: el = renderStep2(state); break;
    case 3: el = renderStep3(state); break;
    case 4: el = renderStep4(state); break;
    case 5: el = renderStep5(state); break;
    case 6: el = renderStep6(state, onSubmit); break;
    default: el = document.createElement("div");
  }
  stepContainer.appendChild(el);
  backBtn.disabled = state.value.step === 1;
  if (state.value.step === 6) {
    nextBtn.style.display = "none";
  } else {
    nextBtn.style.display = "inline-block";
    nextBtn.disabled = !isStepComplete(state.value.step, state.value);
  }
};

const unsubscribe = state.subscribe(renderActive);
renderActive();
