/**
 * UE0 — Förderbereich-Wahl (Einstiegspunkt).
 *
 * Layout-Idee: Smart-Upload als Hero („der schnelle Weg") oben prominent,
 * darunter „Oder selbst zuordnen?" mit 4 sprechenden FB-Karten (typische
 * Antragsteller + typische Höhe). Stadt-Wü-Stil, nüchtern, keine Emojis.
 */

import { ALL_FOERDERBEREICHE, FB_III_VARIANTEN } from "@dv/foerderbereiche";
import type { FoerderbereichId } from "@dv/foerderbereiche";

// Zusätzliche „bürger-lesbare" Texte pro FB — kompakt, mit konkreten Beispielen.
const FB_KONTEXT: Record<FoerderbereichId, {
  beispielTraeger: string;
  beispielVorhaben: string;
  hoechstgrenze: string;
}> = {
  I: {
    beispielTraeger: "Wohlfahrtsverbände, Pfarreien, Vereine",
    beispielVorhaben: "Neues Nachbarschaftscafé · Neuer Besuchsdienst · Neue Engagementgruppe",
    hoechstgrenze: "Einmalige Anschubfinanzierung",
  },
  II: {
    beispielTraeger: "Träger mit ehrenamtlichem Engagement",
    beispielVorhaben: "Bestehender Helferkreis · Besuchsdienst · Nachbarschaftshilfe",
    hoechstgrenze: "Pauschale je Helferin/Helfer · Helferliste erforderlich",
  },
  III: {
    beispielTraeger: "Mehrgenerationenhäuser · Begegnungszentren · Seniorenkreise · Quartiersmanagement",
    beispielVorhaben: "Laufender Betrieb etablierter Strukturen",
    hoechstgrenze: `Bis 10.000 € (A/B) · ${Math.max(...Object.values(FB_III_VARIANTEN).map(v => v.foerderhoechstgrenze_euro ?? 0)).toLocaleString("de-DE")} € (Variante D) · 4 Varianten zur Auswahl`,
  },
  IV: {
    beispielTraeger: "Träger mit besonderem Vorhaben außerhalb FB I–III",
    beispielVorhaben: "Strukturförderung · Schwerpunktinitiative · Pilotprojekt",
    hoechstgrenze: "Individuell · strukturierter Antrag mit Leitfragen",
  },
};

export function renderFbWahl(navigate: (search: string) => void): HTMLElement {
  const view = document.createElement("div");
  view.className = "fb-wahl-view";

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

  // ── HERO: Smart-Upload prominent ─────────────────────────────────
  const hero = document.createElement("div");
  hero.className = "smart-hero";
  hero.innerHTML = `
    <div class="smart-hero-text">
      <div class="smart-hero-eyebrow">Der schnelle Weg</div>
      <h2 class="smart-hero-title">PDF hochladen — KI ordnet automatisch zu</h2>
      <p class="smart-hero-desc">
        Sie haben ein ausgefülltes Antrags-PDF? Werfen Sie es einfach hier rein.
        Die KI erkennt den passenden Förderbereich, schlägt die richtige Variante vor
        und zeigt Ihnen alles zur Bestätigung — bevor irgendetwas eingereicht wird.
      </p>
    </div>
    <div class="smart-hero-action"></div>
  `;
  const heroBtn = document.createElement("button");
  heroBtn.type = "button";
  heroBtn.className = "btn-primary smart-hero-btn";
  heroBtn.textContent = "Smart-Upload starten";
  heroBtn.addEventListener("click", () => navigate("?smart=1"));
  hero.querySelector(".smart-hero-action")!.appendChild(heroBtn);
  view.appendChild(hero);

  // ── Trenner mit „oder" ───────────────────────────────────────────
  const oder = document.createElement("div");
  oder.className = "section-divider";
  oder.innerHTML = `<span>oder selbst zuordnen</span>`;
  view.appendChild(oder);

  // ── 4 FB-Karten mit Substanz ─────────────────────────────────────
  const grid = document.createElement("div");
  grid.className = "fb-grid";

  const ids: FoerderbereichId[] = ["I", "II", "III", "IV"];
  for (const id of ids) {
    const fb = ALL_FOERDERBEREICHE[id];
    const ctx = FB_KONTEXT[id];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "fb-card";
    card.setAttribute("aria-label", `Förderbereich ${fb.id}: ${fb.label_lang}`);
    card.innerHTML = `
      <div class="fb-card-head">
        <span class="fb-card-marker">FB ${fb.id}</span>
        <span class="fb-card-title">${fb.label_lang}</span>
      </div>
      <p class="fb-card-lead">${fb.beschreibung}</p>
      <dl class="fb-card-meta">
        <dt>Typische Antragsteller</dt>
        <dd>${ctx.beispielTraeger}</dd>
        <dt>Typisches Vorhaben</dt>
        <dd>${ctx.beispielVorhaben}</dd>
        <dt>Förderhöhe</dt>
        <dd>${ctx.hoechstgrenze}</dd>
      </dl>
      <div class="fb-card-cta">
        <span>Antrag für FB ${fb.id} starten</span>
        <span class="fb-card-arrow" aria-hidden="true">›</span>
      </div>
    `;
    card.addEventListener("click", () => navigate(`?fb=${id}`));
    grid.appendChild(card);
  }
  view.appendChild(grid);

  // ── Sekundäre Info: wie geht es nach dem Upload weiter? ─────────
  const info = document.createElement("div");
  info.className = "next-steps";
  info.innerHTML = `
    <h3>Wie geht es nach dem Upload weiter?</h3>
    <ol>
      <li><strong>Eingang.</strong> Sie erhalten sofort eine Eingangsbestätigung mit Tracking-Nummer.</li>
      <li><strong>Vorbefüllung.</strong> Die KI liest die Felder aus dem PDF und legt einen vorausgefüllten Antrag im Webformular an, den Sie ergänzen können.</li>
      <li><strong>Sachbearbeitung.</strong> Das Sozialreferat prüft Ihren Antrag, in der Regel innerhalb von vier Wochen.</li>
    </ol>
  `;
  view.appendChild(info);

  return view;
}
