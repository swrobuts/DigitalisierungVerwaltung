/**
 * UE0 — Förderbereich-Wahl (Einstiegspunkt).
 *
 * Zeigt 4 Karten (FB I-IV) + Smart-Upload-Karte. Klick navigiert zu
 *   ?fb=I|II|III|IV   →  fb-upload.ts
 *   ?smart=1          →  smart-upload.ts
 */

import { ALL_FOERDERBEREICHE } from "@dv/foerderbereiche";
import type { FoerderbereichId } from "@dv/foerderbereiche";

export function renderFbWahl(navigate: (search: string) => void): HTMLElement {
  const view = document.createElement("div");

  const titel = document.createElement("h1");
  titel.className = "page-titel";
  titel.textContent = "Altenhilfeplan — Antrag einreichen";
  view.appendChild(titel);

  const sub = document.createElement("p");
  sub.className = "page-untertitel";
  sub.textContent =
    "Wählen Sie den passenden Förderbereich aus. Sie können auch ein vorhandenes Antrags-PDF hochladen, ohne den Bereich zu kennen — unser Smart-Upload erkennt ihn automatisch.";
  view.appendChild(sub);

  const intro = document.createElement("div");
  intro.className = "card";
  intro.innerHTML = `
    <h3 class="card-h3">So funktioniert es</h3>
    <div class="card-body">
      <p style="margin: 0 0 0.5rem;">
        Jeder Förderbereich hat einen eigenen Antrag mit eigenen Pflichtfeldern
        und Anlagen. Wählen Sie unten, was zu Ihrem Vorhaben passt.
      </p>
      <p style="margin: 0; color: #555; font-size: 13.5px;">
        Ein KI-gestützter Workflow liest die Felder anschließend automatisch
        aus dem hochgeladenen PDF (auch handschriftlich) und legt einen
        vorausgefüllten Antrag im Webformular an.
      </p>
    </div>
  `;
  view.appendChild(intro);

  // ── Karten-Grid ──────────────────────────────────────────────────
  const grid = document.createElement("div");
  grid.className = "fb-grid";

  const ids: FoerderbereichId[] = ["I", "II", "III", "IV"];
  for (const id of ids) {
    const fb = ALL_FOERDERBEREICHE[id];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "fb-card";
    card.innerHTML = `
      <div class="fb-card-icon" aria-hidden="true">${fb.icon}</div>
      <div class="fb-card-body">
        <div class="fb-card-roman">FB ${fb.id}</div>
        <div class="fb-card-title">${fb.label_lang}</div>
        <div class="fb-card-desc">${fb.beschreibung}</div>
      </div>
      <div class="fb-card-arrow" aria-hidden="true">›</div>
    `;
    card.addEventListener("click", () => navigate(`?fb=${id}`));
    grid.appendChild(card);
  }

  view.appendChild(grid);

  // ── Smart-Upload-Brücke ─────────────────────────────────────────
  const smart = document.createElement("div");
  smart.className = "card smart-upload-teaser";
  smart.innerHTML = `
    <h3 class="card-h3">🤖 Unsicher? Smart-Upload entscheidet</h3>
    <div class="card-body">
      <p style="margin: 0 0 0.8rem;">
        Sie haben bereits ein ausgefülltes Antrags-PDF und wissen nicht, zu
        welchem Förderbereich es gehört? Laden Sie es einfach hoch — die KI
        erkennt den passenden Förderbereich automatisch. Sie können den
        Vorschlag vor dem Absenden noch korrigieren.
      </p>
    </div>
  `;
  const smartBtn = document.createElement("button");
  smartBtn.type = "button";
  smartBtn.className = "btn-primary";
  smartBtn.textContent = "🤖 Smart-Upload starten";
  smartBtn.addEventListener("click", () => navigate("?smart=1"));
  smart.appendChild(smartBtn);

  view.appendChild(smart);
  return view;
}
