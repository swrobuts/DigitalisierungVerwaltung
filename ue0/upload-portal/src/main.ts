/**
 * UE0 — Antrag-PDF-Upload-Portal (Reifegradstufe 0)
 *
 * Layout 1:1 inspiriert von wuerzburg.de/rathaus/formularcenter:
 * Titel + Beschreibung links, Adressbox rechts.
 *
 * Zwei Modi via URL-Query:
 *   /              → Upload-Modus (Formularcenter-Optik)
 *   /?status=ID    → Status-Modus (Polling auf antrag_einreichung.id)
 */

import "./styles.css";
import { renderUpload } from "./upload";
import { renderStatus } from "./status";

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

function renderUploadView(): HTMLElement {
  const view = document.createElement("div");

  // Titel + Beschreibung — wörtlich vom Original
  const titel = document.createElement("h1");
  titel.className = "page-titel";
  titel.textContent = "Altenhilfeplan";
  view.appendChild(titel);

  const sub = document.createElement("p");
  sub.className = "page-untertitel";
  sub.textContent = "Antrag Altentagesstätten- , Betriebs- und Personalkostenzuschüsse";
  view.appendChild(sub);

  // Zwei-Spalten-Layout
  const grid = document.createElement("div");
  grid.className = "layout-2col";

  const main = document.createElement("div");
  main.className = "col-main";

  main.innerHTML = `
    <h2>Formulare und/oder Online-Service zum Thema:</h2>
    <a class="pdf-link" href="https://github.com/swrobuts/DigitalisierungVerwaltung/raw/main/materialien/antrag-apl2.pdf" target="_blank" rel="noopener noreferrer">
      <span class="pdf-icon">PDF</span>
      Antrag APL 2 - Altentagesstätten - Betriebs- und Personalkostenzuschüsse
    </a>
    <a class="pdf-link" href="https://github.com/swrobuts/DigitalisierungVerwaltung/raw/main/materialien/anlage-antrag-apl2.pdf" target="_blank" rel="noopener noreferrer">
      <span class="pdf-icon">PDF</span>
      Anlage Antrag APL 2 - Altentagesstätten - Betriebs- und Personalkostenzuschüsse
    </a>

    <hr />
    <h2>Weiterführende Informationen zum Thema</h2>
    <p>
      🔗 <a href="https://www.wuerzburg.de/themen/soziales-und-gesellschaft/aelterwerden-in-wuerzburg/index.html"
            target="_blank" rel="noopener noreferrer">Antragswesen / Altenhilfeplan</a>
    </p>

    <hr />
  `;

  // UE0-spezifischer Block: Online-Einreichung via Upload
  const uploadCard = document.createElement("div");
  uploadCard.className = "upload-card";
  uploadCard.innerHTML = `
    <h3 class="upload-card-h3">📤 Antrag online einreichen (Demo-Service)</h3>
    <p class="upload-card-body">
      Sie haben das offizielle PDF (siehe oben) ausgefüllt — auch
      handschriftlich? Laden Sie es hier hoch. Ein KI-gestützter
      Workflow extrahiert die Felder automatisch und übermittelt sie
      an die Sachbearbeitung. Sie erhalten eine Eingangsbestätigung
      mit einer Antrags-ID, mit der Sie den Bearbeitungsstand
      verfolgen können.
    </p>
  `;
  uploadCard.appendChild(renderUpload((trackingId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("status", trackingId);
    window.history.pushState({}, "", url);
    route();
  }));
  main.appendChild(uploadCard);

  // Zurück-Link wie im Original
  const back = document.createElement("a");
  back.className = "back-link";
  back.href = "#";
  back.textContent = ">>> Zurück zur Ergebnisliste";
  main.appendChild(back);

  grid.appendChild(main);

  // Rechte Spalte: Adress-Box
  grid.appendChild(renderAddressBox());

  view.appendChild(grid);
  return view;
}

function renderStatusView(trackingId: string): HTMLElement {
  const view = document.createElement("div");

  const titel = document.createElement("h1");
  titel.className = "page-titel";
  titel.textContent = "Eingangsbestätigung";
  view.appendChild(titel);

  const sub = document.createElement("p");
  sub.className = "page-untertitel";
  sub.textContent =
    "Ihr Antrag wird verarbeitet. Diese Seite aktualisiert sich automatisch, sobald die Bearbeitung abgeschlossen ist.";
  view.appendChild(sub);

  const grid = document.createElement("div");
  grid.className = "layout-2col";

  const main = document.createElement("div");
  main.className = "col-main";
  main.appendChild(renderStatus(trackingId));

  const back = document.createElement("a");
  back.className = "back-link";
  back.href = window.location.pathname;
  back.textContent = ">>> Neuen Antrag einreichen";
  main.appendChild(back);

  grid.appendChild(main);
  grid.appendChild(renderAddressBox());

  view.appendChild(grid);
  return view;
}

function route(): void {
  root!.innerHTML = "";
  const params = new URLSearchParams(window.location.search);
  const trackingId = params.get("status");

  if (trackingId) {
    root!.appendChild(renderStatusView(trackingId));
  } else {
    root!.appendChild(renderUploadView());
  }
}

window.addEventListener("popstate", route);
route();
