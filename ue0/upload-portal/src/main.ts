/**
 * UE0 — Antrag-PDF-Upload-Portal (Reifegradstufe 0, Multi-FB).
 *
 * URL-Routing (Query-Strings, weil GitHub Pages keine SPA-Routes):
 *   /                       → Förderbereich-Wahl (4 Karten + Smart-Upload-Brücke)
 *   /?fb=I|II|III|IV        → FB-spezifischer Upload (Hauptantrag + optionale Anlage)
 *   /?fb=III&v=A|B|C|D      → FB III mit gewählter Variante (variantenspezifische Anlage)
 *   /?smart=1               → Smart-Upload (Klassifikation pro PDF)
 *   /?status=<einreichung>  → Tracking-Page mit Polling
 *
 * Architektur 2026-05-25 Phase 4: ein gemeinsamer Layout-Wrapper
 * (Header, Adressbox, Footer) — der dynamische Teil wird ins #app gerendert.
 */

import "./styles.css";
import { renderFbWahl } from "./views/fb-wahl";
import { renderFbUpload } from "./views/fb-upload";
import { renderSmartUpload } from "./views/smart-upload";
import { renderStatusView } from "./views/status";

import type { FoerderbereichId, FbIiiVarianteId } from "@dv/foerderbereiche";

const VALID_FBS = new Set(["I", "II", "III", "IV"]);
const VALID_V = new Set(["A", "B", "C", "D"]);

const root = document.getElementById("app");
if (!root) throw new Error("#app nicht gefunden");

function renderAddressBox(): HTMLElement {
  const box = document.createElement("aside");
  box.className = "address-box";
  box.innerHTML = `
    <div class="address-box-head">
      Adresse
      <span style="color:#b0b0b0;font-weight:400;">▾</span>
    </div>
    <div class="address-box-body">
      <p>
        Seniorenarbeit in der Stadt Würzburg<br />
        Semmelstraße 2<br />
        97070 Würzburg
      </p>
      <p>
        Telefon: 37 35 15<br />
        Fax: 0931 - 37 38 42<br />
        E-Mail: <a href="mailto:seniorenarbeit@stadt.wuerzburg.de">Kontakt aufnehmen</a>
      </p>
    </div>
  `;
  return box;
}

/** Setzt `search` als neuen URL-Query und re-routed. Leerer String → /. */
function navigate(search: string): void {
  const url = new URL(window.location.href);
  url.search = search.startsWith("?") ? search.slice(1) : search;
  window.history.pushState({}, "", url);
  route();
}

function route(): void {
  root!.innerHTML = "";

  const params = new URLSearchParams(window.location.search);
  const status = params.get("status");
  const smart = params.get("smart");
  const fb = params.get("fb");
  const v = params.get("v");

  // Page-Body in zwei-Spalten-Layout (Adressbox rechts).
  const grid = document.createElement("div");
  grid.className = "layout-2col";
  const mainCol = document.createElement("div");
  mainCol.className = "col-main";

  if (status) {
    mainCol.appendChild(renderStatusView(status, navigate));
  } else if (smart === "1") {
    mainCol.appendChild(renderSmartUpload(navigate));
  } else if (fb && VALID_FBS.has(fb)) {
    const variante = v && VALID_V.has(v) ? (v as FbIiiVarianteId) : null;
    mainCol.appendChild(renderFbUpload({
      fb: fb as FoerderbereichId,
      variante,
      navigate,
    }));
  } else {
    mainCol.appendChild(renderFbWahl(navigate));
  }

  grid.appendChild(mainCol);
  grid.appendChild(renderAddressBox());
  root!.appendChild(grid);

  // Hochscrollen, damit nach Navigation immer der Header zuerst sichtbar ist.
  window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
}

window.addEventListener("popstate", route);
route();
