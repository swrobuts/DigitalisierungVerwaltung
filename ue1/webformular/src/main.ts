import "./styles.css";
import { signal } from "./signals";
import { initialState } from "./state";
import { attachStickyProgress } from "./sticky-progress";
import { renderStep1 } from "./steps/step1-traeger";
import { renderStep2 } from "./steps/step2-kontakt-bank";
import { renderStep3 } from "./steps/step3-wochenplan";
import { renderStep4RaeumeKosten } from "./steps/step4-raeume-kosten";
import { renderStep5Flyer } from "./steps/step5-flyer";
import { renderStep6Uebersicht } from "./steps/step6-uebersicht";
import { submitAntrag } from "./submit";
import { setSprache, applyTranslations, t } from "./i18n";
import type { FormState, Sprache } from "./types";

/**
 * Long-Form-Orchestrierung (UE1-v4 — PDF-Voll-Sync, ohne Bemessungs-Step).
 * Alle 6 Sections untereinander als <fieldset>s in einem <form>,
 * sticky-Fortschrittsbar oben (im HTML schon angelegt).
 * Würzburg-CI komplett aus styles.css — kein Tailwind im Markup.
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

// === Submit-Handler (ersetzt das gesamte #app) ===
const onSubmit = async () => {
  const result = await submitAntrag(state.value);
  root.innerHTML = "";
  const ok = document.createElement("section");
  ok.id = "bestaetigung";
  const tick = document.createElement("p");
  tick.style.fontSize = "2.5rem";
  tick.style.margin = "0 0 0.4rem";
  tick.style.color = "var(--ok)";
  tick.textContent = "✓";
  ok.appendChild(tick);
  const h2 = document.createElement("h2");
  h2.textContent = "Antrag eingegangen";
  ok.appendChild(h2);
  const nr = document.createElement("p");
  nr.textContent = "Ihre Antragsnummer: ";
  const strong = document.createElement("span");
  strong.className = "antragsnummer";
  strong.textContent = result.antragsnummer;
  nr.appendChild(strong);
  ok.appendChild(nr);
  const hint = document.createElement("p");
  hint.className = "field-hint";
  hint.textContent = "Sie erhalten eine Eingangsbestätigung per E-Mail.";
  ok.appendChild(hint);
  root.appendChild(ok);
};

// === Sections rendern ===
function renderSections(): void {
  root!.innerHTML = "";

  // Long-Form-Titel im #app (CSS gibt ihm border-bottom: 2px solid wue-rot)
  const head = document.createElement("header");
  const h1 = document.createElement("h1");
  h1.textContent = t("form.title");
  head.appendChild(h1);
  const sub = document.createElement("p");
  sub.className = "subtitle";
  sub.textContent = t("form.subtitle");
  head.appendChild(sub);
  root!.appendChild(head);

  // Semantisches <form>-Element — Steps sind <fieldset>s (1..6).
  const form = document.createElement("form");
  form.id = "antrag-form";
  form.noValidate = true;
  form.addEventListener("submit", (e) => e.preventDefault());

  form.appendChild(renderStep1(state));
  form.appendChild(renderStep2(state));
  form.appendChild(renderStep3(state));
  form.appendChild(renderStep4RaeumeKosten(state));
  form.appendChild(renderStep5Flyer(state));
  form.appendChild(renderStep6Uebersicht(state, onSubmit));

  root!.appendChild(form);
}

renderSections();
