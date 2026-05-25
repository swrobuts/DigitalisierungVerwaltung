/**
 * UE0 — Förderbereich-Wahl (Einstiegspunkt).
 *
 * Layout: Smart-Upload-Hero oben, „oder selbst zuordnen"-Trenner, dann
 * 4 schlanke FB-Karten (gleich hoch, gleicher Marker-Breite, gleiche CTA-Position).
 */

import { ALL_FOERDERBEREICHE } from "@dv/foerderbereiche";
import type { FoerderbereichId } from "@dv/foerderbereiche";

/** Klar formulierte, bürger-lesbare Kurzbeschreibungen pro FB. */
const FB_BESCHREIBUNG: Record<FoerderbereichId, string> = {
  I: "Anschubfinanzierung, wenn Sie ein neues Angebot oder eine neue Engagementgruppe aufbauen — z.B. ein Nachbarschaftscafé oder einen neuen Besuchsdienst.",
  II: "Pauschale Förderung für bestehendes ehrenamtliches Engagement — Helferkreise, Besuchsdienste, Nachbarschaftshilfen. Helferliste erforderlich.",
  III: "Laufende Förderung etablierter Strukturen — Mehrgenerationenhaus, Begegnungszentrum, Seniorenkreis oder Quartiersmanagement. Vier Varianten zur Auswahl.",
  IV: "Individuelles Vorhaben, das nicht in die Förderbereiche I–III passt — Strukturförderung, Schwerpunktinitiative oder Pilotprojekt. Strukturierter Antrag mit Leitfragen.",
};

export function renderFbWahl(navigate: (search: string) => void): HTMLElement {
  const view = document.createElement("div");

  // ── Seitentitel + kurzer Lead ────────────────────────────────────
  const titel = document.createElement("h1");
  titel.className = "page-titel";
  titel.textContent = "Altenhilfeplan — Antrag einreichen";
  view.appendChild(titel);

  const lead = document.createElement("p");
  lead.className = "page-untertitel";
  lead.textContent =
    "Die Stadt Würzburg fördert Altenhilfe-Träger in vier Förderbereichen. Wählen Sie unten den passenden Bereich — oder lassen Sie ein vorhandenes Antrags-PDF von der KI automatisch zuordnen.";
  view.appendChild(lead);

  // ── HYBRID-Hero: PDF + KI + Webform ──────────────────────────────
  const hero = document.createElement("div");
  hero.className = "smart-hero";
  hero.innerHTML = `
    <div class="smart-hero-eyebrow">Empfohlen — der schnelle Weg</div>
    <h2 class="smart-hero-title">PDF einreichen, Rest automatisch</h2>
    <p class="smart-hero-desc">
      Sie haben ein ausgefülltes Antrags-PDF (z.&nbsp;B. eine handschriftlich
      ausgefüllte Vorlage)? Laden Sie es hoch — die KI liest die Felder aus und
      legt ein vorausgefülltes Webformular an, das Sie nur noch prüfen und
      absenden müssen.
    </p>
    <ol class="smart-hero-steps" aria-label="Drei Schritte">
      <li><span class="step-num">1</span><span>PDF&nbsp;hochladen</span></li>
      <li class="step-arrow" aria-hidden="true">→</li>
      <li><span class="step-num">2</span><span>KI&nbsp;liest&nbsp;aus &amp; befüllt&nbsp;Formular</span></li>
      <li class="step-arrow" aria-hidden="true">→</li>
      <li><span class="step-num">3</span><span>Prüfen &amp; absenden</span></li>
    </ol>
    <div class="smart-hero-action"></div>
  `;
  const heroBtn = document.createElement("button");
  heroBtn.type = "button";
  heroBtn.className = "smart-hero-btn";
  heroBtn.textContent = "Smart-Upload starten";
  heroBtn.addEventListener("click", () => navigate("?smart=1"));
  hero.querySelector(".smart-hero-action")!.appendChild(heroBtn);
  view.appendChild(hero);

  // ── Trenner ──────────────────────────────────────────────────────
  const trenner = document.createElement("div");
  trenner.className = "section-divider";
  trenner.innerHTML = `<span>oder Förderbereich selbst auswählen</span>`;
  view.appendChild(trenner);

  // ── 4 FB-Karten (schlank, alle gleich aufgebaut) ─────────────────
  const grid = document.createElement("div");
  grid.className = "fb-grid";

  const ids: FoerderbereichId[] = ["I", "II", "III", "IV"];
  for (const id of ids) {
    const fb = ALL_FOERDERBEREICHE[id];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "fb-card";
    card.setAttribute("aria-label", `Förderbereich ${fb.id}: ${fb.label_lang}`);
    card.innerHTML = `
      <div class="fb-card-head">
        <span class="fb-card-marker">FB ${fb.id}</span>
        <span class="fb-card-title">${fb.label_lang}</span>
      </div>
      <p class="fb-card-desc">${FB_BESCHREIBUNG[id]}</p>
      <div class="fb-card-cta">
        <span>Antrag für FB ${fb.id} starten</span>
        <span class="fb-card-arrow" aria-hidden="true">›</span>
      </div>
    `;
    card.addEventListener("click", () => navigate(`?fb=${id}`));
    grid.appendChild(card);
  }
  view.appendChild(grid);

  return view;
}
