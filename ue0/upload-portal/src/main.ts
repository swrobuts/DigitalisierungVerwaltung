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
  `;

  // Gemeinsamer OCR-Hinweis für beide Anträge — nur einmal angezeigt
  const ocrHint = document.createElement("p");
  ocrHint.className = "upload-hint-global";
  ocrHint.innerHTML = `
    📤 <em>Demo-Service:</em> Ausgefüllte PDFs (auch handschriftlich) können Sie
    jeweils direkt über den Button hinter dem Download-Link hochladen. Ein KI-Workflow
    liest die Felder per OCR aus und übermittelt sie an die Sachbearbeitung.
  `;
  main.appendChild(ocrHint);

  // Upload-Komponente rendert selbst zwei optisch klar getrennte Boxen:
  //   ① Hauptantrag (rot, Pflicht)
  //   ② Anlage 1 — Wochenplan (grau, Optional)
  // Beide Files werden in einem POST gesendet (FormData: datei + anlage_1)
  // → ein gemeinsamer tracking_id, n8n verarbeitet beide.
  main.appendChild(renderUpload(
    (trackingId) => {
      const url = new URL(window.location.href);
      url.searchParams.set("status", trackingId);
      window.history.pushState({}, "", url);
      route();
    },
    {
      dokumentBeschreibung: "Antrag APL 2 — Altentagesstätten - Betriebs- und Personalkostenzuschüsse",
      ueberschrift: "So funktioniert der digitale Antrag",
      primary: {
        nummer: 1,
        sektionTitel: "Hauptantrag",
        pdfUrl: "https://github.com/swrobuts/DigitalisierungVerwaltung/raw/main/materialien/antrag-apl2.pdf",
        pdfLabel: "Antrag APL 2 — Altentagesstätten - Betriebs- und Personalkostenzuschüsse",
        hint: "Nur PDF, max. 10 MB",
      },
      secondary: {
        fieldName: "anlage_1",
        nummer: 2,
        sektionTitel: "Anlage 1 — Wochenplan",
        pdfUrl: "https://github.com/swrobuts/DigitalisierungVerwaltung/raw/main/materialien/anlage-antrag-apl2.pdf",
        pdfLabel: "Anlage 1 — Wochenplan (Öffnungszeiten + Angebot)",
        hint: "PDF, max. 10 MB — wenn vorhanden, extrahiert die KI auch die Öffnungszeiten",
      },
    },
  ));

  // Trenner + Weiterführende Informationen
  const weiter = document.createElement("div");
  weiter.innerHTML = `
    <hr />
    <h2>Weiterführende Informationen zum Thema</h2>
    <p>
      🔗 <a href="https://www.wuerzburg.de/themen/soziales-und-gesellschaft/aelterwerden-in-wuerzburg/index.html"
            target="_blank" rel="noopener noreferrer">Antragswesen / Altenhilfeplan</a>
    </p>
  `;
  main.appendChild(weiter);

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
