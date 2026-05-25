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

  // ── Zwei-Wege-Sektion (gleichwertig dargestellt) ─────────────────
  const zweiWege = document.createElement("div");
  zweiWege.className = "zwei-wege";
  zweiWege.innerHTML = `
    <h2 class="zwei-wege-headline">Es gibt zwei Wege ans Ziel</h2>
    <div class="weg-grid">

      <section class="weg-card weg-a">
        <div class="weg-card-badge">Weg A</div>
        <h3 class="weg-card-title">PDF hochladen — KI macht den Rest</h3>
        <p class="weg-card-desc">
          Sie haben ein ausgefülltes Antrags-PDF (auch handschriftlich)?
          Die KI liest es aus und befüllt das Webformular vor — Sie müssen
          nur noch prüfen und absenden.
        </p>
        <ol class="weg-steps">
          <li><span class="step-num">1</span> PDF hochladen</li>
          <li><span class="step-num">2</span> KI liest aus + Webformular wird vorausgefüllt</li>
          <li><span class="step-num">3</span> Prüfen und absenden</li>
        </ol>
        <div class="weg-card-action"></div>
      </section>

      <section class="weg-card weg-b">
        <div class="weg-card-badge">Weg B</div>
        <h3 class="weg-card-title">Förderbereich selbst wählen</h3>
        <p class="weg-card-desc">
          Sie kennen Ihren Förderbereich? Wählen Sie ihn unten direkt aus
          und laden Sie das ausgefüllte PDF in den passenden Slot — keine
          KI-Klassifikation nötig.
        </p>
        <ol class="weg-steps">
          <li><span class="step-num">1</span> Förderbereich (FB I–IV) wählen</li>
          <li><span class="step-num">2</span> PDF + ggf. Anlage hochladen</li>
          <li><span class="step-num">3</span> Prüfen und absenden</li>
        </ol>
        <div class="weg-card-hint">Wählen Sie unten einen der vier Förderbereiche aus.</div>
      </section>

    </div>
  `;
  const wegABtn = document.createElement("button");
  wegABtn.type = "button";
  wegABtn.className = "btn-primary weg-card-btn";
  wegABtn.textContent = "Smart-Upload starten";
  wegABtn.addEventListener("click", () => navigate("?smart=1"));
  zweiWege.querySelector(".weg-a .weg-card-action")!.appendChild(wegABtn);
  view.appendChild(zweiWege);

  // ── Trenner ──────────────────────────────────────────────────────
  const trenner = document.createElement("div");
  trenner.className = "section-divider";
  trenner.innerHTML = `<span>Weg B — Förderbereich wählen</span>`;
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
