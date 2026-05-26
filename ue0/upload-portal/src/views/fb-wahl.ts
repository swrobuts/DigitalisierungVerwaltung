/**
 * UE0 — Förderbereich-Wahl (Einstiegspunkt).
 *
 * Layout: Eyebrow + Titel + Lead + Cross-Link → UE1, dann „Zwei Wege"-Hero,
 * dann 4 schlanke FB-Karten.
 *
 * Alle Texte i18n-fähig (t/tx). DE + TR vollständig, IT/RU/FR fallen auf DE.
 */

import { ALL_FOERDERBEREICHE } from "@dv/foerderbereiche";
import type { FoerderbereichId } from "@dv/foerderbereiche";
import { t, tx } from "../lib/i18n";

export function renderFbWahl(navigate: (search: string) => void): HTMLElement {
  const view = document.createElement("div");

  // ── Eyebrow „PDF-Upload-Portal" — Differenzierung zum UE1-Webformular ──
  const eyebrow = document.createElement("span");
  eyebrow.className = "ue0-hero-eyebrow";
  eyebrow.textContent = t("wahl.eyebrow");
  view.appendChild(eyebrow);

  // ── Seitentitel + kurzer Lead ────────────────────────────────────
  const titel = document.createElement("h1");
  titel.className = "page-titel";
  titel.textContent = t("wahl.titel");
  view.appendChild(titel);

  const lead = document.createElement("p");
  lead.className = "page-untertitel";
  lead.textContent = t("wahl.lead");
  view.appendChild(lead);

  // ── Cross-Link zum UE1-Webformular ──
  const cross = document.createElement("div");
  cross.className = "ue0-crosslink";
  cross.innerHTML = `
    <strong>${t("cross.titel")}</strong>
    <span>${t("cross.lead")}
      <a href="https://antrag.butscher.cloud" target="_blank" rel="noopener noreferrer">
        ${t("cross.linktext")}
      </a>
    </span>
  `;
  view.appendChild(cross);

  // ── Zwei-Wege-Sektion (gleichwertig dargestellt) ─────────────────
  const zweiWege = document.createElement("div");
  zweiWege.className = "zwei-wege";
  zweiWege.innerHTML = `
    <h2 class="zwei-wege-headline">${t("wege.headline")}</h2>
    <div class="weg-grid">

      <section class="weg-card weg-a">
        <div class="weg-card-badge">${t("wege.a.badge")}</div>
        <h3 class="weg-card-title">${t("wege.a.titel")}</h3>
        <p class="weg-card-desc">${t("wege.a.desc")}</p>
        <ol class="weg-steps">
          <li><span class="step-num">1</span> ${t("wege.a.step1")}</li>
          <li><span class="step-num">2</span> ${t("wege.a.step2")}</li>
          <li><span class="step-num">3</span> ${t("wege.a.step3")}</li>
        </ol>
        <div class="weg-card-action"></div>
      </section>

      <section class="weg-card weg-b">
        <div class="weg-card-badge">${t("wege.b.badge")}</div>
        <h3 class="weg-card-title">${t("wege.b.titel")}</h3>
        <p class="weg-card-desc">${t("wege.b.desc")}</p>
        <ol class="weg-steps">
          <li><span class="step-num">1</span> ${t("wege.b.step1")}</li>
          <li><span class="step-num">2</span> ${t("wege.b.step2")}</li>
          <li><span class="step-num">3</span> ${t("wege.b.step3")}</li>
        </ol>
        <div class="weg-card-hint">${t("wege.b.hint")}</div>
      </section>

    </div>
  `;
  const wegABtn = document.createElement("button");
  wegABtn.type = "button";
  wegABtn.className = "btn-primary weg-card-btn";
  wegABtn.textContent = t("wege.a.cta");
  wegABtn.addEventListener("click", () => navigate("?smart=1"));
  zweiWege.querySelector(".weg-a .weg-card-action")!.appendChild(wegABtn);
  view.appendChild(zweiWege);

  // ── Trenner ──────────────────────────────────────────────────────
  const trenner = document.createElement("div");
  trenner.className = "section-divider";
  trenner.innerHTML = `<span>${t("trenner.wegb")}</span>`;
  view.appendChild(trenner);

  // ── 4 FB-Karten ──────────────────────────────────────────────────
  const grid = document.createElement("div");
  grid.className = "fb-grid";

  const ids: FoerderbereichId[] = ["I", "II", "III", "IV"];
  for (const id of ids) {
    const fb = ALL_FOERDERBEREICHE[id];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "fb-card";
    card.setAttribute("aria-label", tx("fb.aria_label", { fb: id, label: fb.label_lang }));
    card.innerHTML = `
      <div class="fb-card-head">
        <span class="fb-card-marker">FB ${id}</span>
        <span class="fb-card-title">${fb.label_lang}</span>
      </div>
      <p class="fb-card-desc">${t(`fb_beschreibung.${id}`)}</p>
      <div class="fb-card-cta">
        <span>${tx("fb.cta.starten", { fb: id })}</span>
        <span class="fb-card-arrow" aria-hidden="true">›</span>
      </div>
    `;
    card.addEventListener("click", () => navigate(`?fb=${id}`));
    grid.appendChild(card);
  }
  view.appendChild(grid);

  return view;
}
