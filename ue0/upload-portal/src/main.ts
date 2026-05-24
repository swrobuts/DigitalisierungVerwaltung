/**
 * UE0 — Antrag-PDF-Upload-Portal (Reifegradstufe 0)
 *
 * Zwei Modi via URL-Query:
 *   /              → Upload-Modus
 *   /?status=ID    → Status-Modus (Polling auf antrag_einreichung.id)
 *
 * Single-Page mit Hash-frei-Routing — passt zu GH-Pages-Static-Hosting.
 */

import "./styles.css";
import { renderUpload } from "./upload";
import { renderStatus } from "./status";

const root = document.getElementById("app");
if (!root) throw new Error("#app nicht gefunden");

function renderTitle(text: string, subtitle?: string) {
  const wrap = document.createElement("div");
  const h1 = document.createElement("h1");
  h1.className = "page-titel";
  h1.textContent = text;
  wrap.appendChild(h1);
  if (subtitle) {
    const p = document.createElement("p");
    p.className = "page-untertitel";
    p.textContent = subtitle;
    wrap.appendChild(p);
  }
  return wrap;
}

function route(): void {
  root!.innerHTML = "";
  const params = new URLSearchParams(window.location.search);
  const trackingId = params.get("status");

  if (trackingId) {
    root!.appendChild(renderTitle(
      "Eingangsbestätigung",
      "Wir verarbeiten Ihren Antrag und übergeben ihn in Kürze an die Sachbearbeitung.",
    ));
    root!.appendChild(renderStatus(trackingId));
  } else {
    root!.appendChild(renderTitle(
      "Altenhilfeplan Nr. 2 — Antrag hochladen",
      "Antrag Altentagesstätten-, Betriebs- und Personalkostenzuschüsse · Sie können das ausgefüllte Original-PDF hier einreichen, ein KI-gestützter Workflow extrahiert die Felder automatisch.",
    ));
    root!.appendChild(renderUpload((trackingId) => {
      const url = new URL(window.location.href);
      url.searchParams.set("status", trackingId);
      window.history.pushState({}, "", url);
      route();
    }));
  }
}

window.addEventListener("popstate", route);
route();
