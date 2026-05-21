import "./styles.css";
import { signal } from "./signals";
import { initialState } from "./state";
import { attachStickyProgress } from "./sticky-progress";
import { renderStep1 } from "./steps/step1-traeger";
import { renderStep2 } from "./steps/step2-kontakt-bank";
import { renderStep3 } from "./steps/step3-wochenplan";
import { renderStep4 } from "./steps/step4-kosten-belege";
import { renderStep5 } from "./steps/step5-flyer";
import { renderStep6 } from "./steps/step6-uebersicht";
import { submitAntrag } from "./submit";
import { setSprache, applyTranslations, t } from "./i18n";
import type { FormState, Sprache } from "./types";

/**
 * Long-Form-Orchestrierung (UE1-v2, Korrektur-Rebuild).
 * Statt Stepper mit 6 Schritten: alle Sections untereinander auf einer
 * Seite, sticky-Fortschrittsbar oben (im HTML schon angelegt).
 * Würzburg-CI aus UE1-v1 (Header + Footer im HTML, Stilklassen aus
 * styles.css). Wochenplan ist optional — siehe state.isStepComplete(3).
 */
const root = document.getElementById("app") as HTMLElement | null;
if (!root) throw new Error("main.ts: #app nicht gefunden");

const state = signal<FormState>(initialState());
setSprache(state.value.language);
applyTranslations();

// === Sprach-Switcher (existiert im HTML) ===
const langSel = document.getElementById("sprach-select") as HTMLSelectElement | null;
if (langSel) {
  langSel.value = state.value.language;
  langSel.addEventListener("change", () => {
    const lang = langSel.value as Sprache;
    setSprache(lang);                // ruft intern applyTranslations()
    state.value = { ...state.value, language: lang };
    // Sections neu rendern (Labels intern via t()-Aufrufe)
    renderSections();
  });
}

// === Sticky-Fortschrittsbar bedienen ===
attachStickyProgress(state);

// === Submit-Handler (ersetzt das gesamte <main>) ===
const onSubmit = async () => {
  const result = await submitAntrag(state.value);
  root.innerHTML = "";
  const ok = document.createElement("section");
  ok.className =
    "bg-white p-6 rounded-lg border border-slate-200 text-center max-w-2xl mx-auto my-8";
  const tick = document.createElement("p");
  tick.className = "text-4xl mb-3";
  tick.textContent = "✓";
  ok.appendChild(tick);
  const h2 = document.createElement("h2");
  h2.className = "text-xl font-semibold mb-2";
  h2.textContent = "Antrag eingegangen";
  ok.appendChild(h2);
  const nr = document.createElement("p");
  nr.textContent = "Ihre Antragsnummer: ";
  const strong = document.createElement("strong");
  strong.textContent = result.antragsnummer;
  nr.appendChild(strong);
  ok.appendChild(nr);
  const hint = document.createElement("p");
  hint.className = "text-sm text-slate-500 mt-2";
  hint.textContent = "Sie erhalten eine Eingangsbestätigung per E-Mail.";
  ok.appendChild(hint);
  root.appendChild(ok);
};

// === Sections rendern ===
function renderSections(): void {
  root!.innerHTML = "";

  const container = document.createElement("div");
  container.className = "max-w-3xl mx-auto px-4 py-6 space-y-4";

  // Long-Form-Titel
  const head = document.createElement("header");
  head.className = "mb-2";
  const h1 = document.createElement("h1");
  h1.className = "text-2xl font-semibold";
  h1.textContent = t("form.title");
  head.appendChild(h1);
  const sub = document.createElement("p");
  sub.className = "text-sm text-slate-600 mt-1";
  sub.textContent = t("form.subtitle");
  head.appendChild(sub);
  container.appendChild(head);

  container.appendChild(renderStep1(state));
  container.appendChild(renderStep2(state));

  // Optional-Hinweis vor Wochenplan
  const optHint = document.createElement("p");
  optHint.className = "text-sm text-slate-500 italic mt-6 mb-0";
  optHint.textContent = t("wochenplan.optional");
  container.appendChild(optHint);

  container.appendChild(renderStep3(state));
  container.appendChild(renderStep4(state));
  container.appendChild(renderStep5(state));
  container.appendChild(renderStep6(state, onSubmit));

  root!.appendChild(container);
}

renderSections();
