/**
 * UE0 — Antrag-PDF-Upload-Portal (Reifegradstufe 0, Multi-FB).
 *
 * URL-Routing (Query-Strings, weil GitHub Pages keine SPA-Routes):
 *   /                       → Förderbereich-Wahl (4 Karten + Smart-Upload-Brücke)
 *   /?fb=I|II|III|IV        → FB-spezifischer Upload
 *   /?fb=III&v=A|B|C|D      → FB III mit gewählter Variante
 *   /?smart=1               → Smart-Upload (Klassifikation pro PDF)
 *   /?status=<einreichung>  → Tracking-Page mit Polling
 *
 * Sprach-Handling (DE/TR vollständig, IT/RU/FR fallen auf DE zurück):
 *   - Sprach-Dropdown im Header (`#lang-select`) wird hier initialisiert
 *   - applyDomI18n übersetzt alle [data-i18n]-Elemente
 *   - Beim Sprachwechsel: applyDomI18n + route() neu (Views rendern in akt. Sprache)
 */

import "./styles.css";
import { renderFbWahl } from "./views/fb-wahl";
import { renderFbUpload } from "./views/fb-upload";
import { renderSmartUpload } from "./views/smart-upload";
import { renderStatusView } from "./views/status";

import type { FoerderbereichId, FbIiiVarianteId } from "@dv/foerderbereiche";
import {
  SPRACHEN,
  SPRACHE_CHANGED_EVENT,
  applyDomI18n,
  getSprache,
  hinweisUnfertig,
  istUebersetzt,
  setSprache,
  t,
  type Sprache,
} from "./lib/i18n";

const VALID_FBS = new Set(["I", "II", "III", "IV"]);
const VALID_V = new Set(["A", "B", "C", "D"]);

const root = document.getElementById("app");
if (!root) throw new Error("#app nicht gefunden");

// ── Sprach-Dropdown im Header befüllen + verkabeln ─────────────────
function initLangPicker(): void {
  const sel = document.getElementById("lang-select") as HTMLSelectElement | null;
  if (!sel) return;
  sel.innerHTML = "";
  const aktuell = getSprache();
  for (const s of SPRACHEN) {
    const opt = document.createElement("option");
    opt.value = s.code;
    opt.textContent = `${s.label} · ${s.endonym}${s.fertig ? "" : "  ⚠"}`;
    if (s.code === aktuell) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => {
    setSprache(sel.value as Sprache);
  });
}

function updateFallbackBanner(): void {
  const banner = document.getElementById("lang-fallback");
  const text = document.getElementById("lang-fallback-text");
  if (!banner || !text) return;
  const s = getSprache();
  if (istUebersetzt(s)) {
    banner.setAttribute("hidden", "");
  } else {
    banner.removeAttribute("hidden");
    banner.setAttribute("lang", s);
    text.textContent = hinweisUnfertig(s);
  }
}

function renderAddressBox(): HTMLElement {
  const box = document.createElement("aside");
  box.className = "address-box";
  box.innerHTML = `
    <div class="address-box-head">
      ${t("addr.titel")}
      <span style="color:#b0b0b0;font-weight:400;">▾</span>
    </div>
    <div class="address-box-body">
      <p>
        ${t("addr.org")}<br />
        Semmelstraße 2<br />
        97070 Würzburg
      </p>
      <p>
        ${t("addr.tel_label")}: 37 35 15<br />
        ${t("addr.fax_label")}: 0931 - 37 38 42<br />
        ${t("addr.email_label")}: <a href="mailto:seniorenarbeit@stadt.wuerzburg.de">${t("addr.email_link")}</a>
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

  // Nach jedem Render: alle [data-i18n]-Elemente im Subtree übersetzen
  // (Views erzeugen meist statische Strings direkt via t()/tx(), aber
  // verschachtelte innerHTML mit data-i18n profitieren von dieser Schleife).
  applyDomI18n(document);

  window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
}

// ── Initialisierung ────────────────────────────────────────────────
initLangPicker();
// Initial html.lang auf gespeicherte Sprache setzen + Fallback-Banner
setSprache(getSprache());
applyDomI18n(document);
updateFallbackBanner();

// Bei jeder Sprachänderung: Banner + Dropdown + komplette App neu rendern
document.addEventListener(SPRACHE_CHANGED_EVENT, () => {
  initLangPicker();
  applyDomI18n(document);
  updateFallbackBanner();
  route();
});

window.addEventListener("popstate", route);
route();
