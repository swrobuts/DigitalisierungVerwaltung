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
import { loadPrefillData } from "./prefill";
import type { FormState, Sprache } from "./types";

/**
 * Long-Form-Orchestrierung (UE1-v4 — PDF-Voll-Sync, ohne Bemessungs-Step).
 * Alle 6 Sections untereinander als <fieldset>s in einem <form>,
 * sticky-Fortschrittsbar oben (im HTML schon angelegt).
 * Würzburg-CI komplett aus styles.css — kein Tailwind im Markup.
 *
 * Prefill-Mode (?prefill=<einreichung_id>): UE0 leitet hierher um, sobald
 * der OCR-Workflow die Felder ausgelesen hat. Wir laden die extrahierten
 * Werte aus apl2.antrag_einreichung.extrahiert_jsonb und hydratisieren
 * den FormState. Bürger prüft + sendet final ab.
 */
const root = document.getElementById("app") as HTMLElement | null;
if (!root) throw new Error("main.ts: #app nicht gefunden");

// Async init — wir müssen ggf. erst Prefill-Daten holen, bevor wir rendern.
async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const prefillId = params.get("prefill");

  const initial = initialState();
  let prefillFailed = false;

  if (prefillId) {
    const prefill = await loadPrefillData(prefillId);
    if (prefill) {
      Object.assign(initial, prefill);
      initial.einreichung_id = prefillId;
    } else {
      // UE1 fällt auf leeres Formular zurück; Banner informiert den Bürger.
      prefillFailed = true;
    }
  }

  const state = signal<FormState>(initial);
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
    root!.innerHTML = "";
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
    root!.appendChild(ok);
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

    // Prefill-Banner: deutlicher grüner Hinweis, dass die Werte aus dem
    // hochgeladenen PDF stammen und nochmal geprüft werden sollen.
    if (state.value.einreichung_id) {
      const banner = document.createElement("div");
      banner.className = "prefill-banner";
      banner.innerHTML = `
        <strong>✓ Daten aus Ihrem hochgeladenen PDF übernommen</strong><br />
        Bitte prüfen Sie alle Felder und korrigieren Sie gegebenenfalls,
        bevor Sie den Antrag final absenden.
      `;
      root!.appendChild(banner);
    } else if (prefillFailed) {
      const banner = document.createElement("div");
      banner.className = "prefill-banner prefill-banner-warn";
      banner.innerHTML = `
        <strong>Hinweis:</strong> Die OCR-Daten konnten nicht geladen werden.
        Bitte füllen Sie das Formular von Hand aus.
      `;
      root!.appendChild(banner);
    }

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
}

bootstrap().catch((e) => {
  console.error("UE1 bootstrap fehlgeschlagen:", e);
  if (root) {
    root.innerHTML = `
      <p style="padding:1rem;color:#b00020;">
        Das Formular konnte nicht geladen werden. Bitte laden Sie die Seite neu.
      </p>
    `;
  }
});
