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

  // Hinweis (Final-Sweep 2026-05-24): Bis vorher gab es zwei getrennte
  // antragRow()-Aufrufe mit jeweils eigenem Upload (zwei tracking_ids).
  // Jetzt: EINE Upload-Komponente, beide PDFs in einem Submit, ein
  // tracking_id — Hauptantrag + Anlage 1 logisch zusammengehörig.

  // Hauptantrag (Pflicht) + Anlage 1 (optional) in EINER Upload-Komponente.
  // Beide Files werden in einem POST gesendet (FormData: datei + anlage_1)
  // → ein gemeinsamer tracking_id, n8n erkennt Anlage-1-Pfad und
  // extrahiert dort den Wochenplan (Final-Sweep 2026-05-24).
  const hauptantragRow = document.createElement("div");
  hauptantragRow.className = "antrag-row";

  // Section-Header
  const head1 = document.createElement("div");
  head1.className = "antrag-section-head";
  const num1 = document.createElement("span");
  num1.className = "antrag-section-num";
  num1.textContent = "1";
  const title1 = document.createElement("h2");
  title1.className = "antrag-section-title";
  title1.textContent = "Antrag APL 2 (mit optionaler Anlage 1)";
  const badge1 = document.createElement("span");
  badge1.className = "antrag-section-badge";
  badge1.textContent = "Pflicht";
  head1.append(num1, title1, badge1);
  hauptantragRow.appendChild(head1);

  // Zwei PDF-Download-Links untereinander — Bürger lädt sich beide Vorlagen
  const pdfBlock = document.createElement("div");
  pdfBlock.style.cssText = "display:flex; flex-direction:column; gap:0.4rem;";
  const linkMain = document.createElement("a");
  linkMain.className = "pdf-link";
  linkMain.href = "https://github.com/swrobuts/DigitalisierungVerwaltung/raw/main/materialien/antrag-apl2.pdf";
  linkMain.target = "_blank";
  linkMain.rel = "noopener noreferrer";
  linkMain.innerHTML = `<span class="pdf-icon">PDF</span> Antrag APL 2 — Altentagesstätten - Betriebs- und Personalkostenzuschüsse`;
  pdfBlock.appendChild(linkMain);
  const linkAnlage = document.createElement("a");
  linkAnlage.className = "pdf-link";
  linkAnlage.href = "https://github.com/swrobuts/DigitalisierungVerwaltung/raw/main/materialien/anlage-antrag-apl2.pdf";
  linkAnlage.target = "_blank";
  linkAnlage.rel = "noopener noreferrer";
  linkAnlage.innerHTML = `<span class="pdf-icon">PDF</span> Anlage 1 — Wochenplan (optional, Öffnungszeiten + Angebot)`;
  pdfBlock.appendChild(linkAnlage);
  hauptantragRow.appendChild(pdfBlock);

  // Upload-Komponente mit zwei Drop-Zonen (Hauptantrag Pflicht + Anlage 1 optional)
  hauptantragRow.appendChild(renderUpload(
    (trackingId) => {
      const url = new URL(window.location.href);
      url.searchParams.set("status", trackingId);
      window.history.pushState({}, "", url);
      route();
    },
    {
      dokumentBeschreibung: "Antrag APL 2 — Altentagesstätten - Betriebs- und Personalkostenzuschüsse",
      ueberschrift: "So funktioniert der digitale Antrag",
      secondaryFile: {
        fieldName: "anlage_1",
        label: "Anlage 1 — Wochenplan (optional)",
        hint: "PDF, max. 10 MB — wenn vorhanden, extrahiert die KI auch die Öffnungszeiten.",
      },
    },
  ));
  main.appendChild(hauptantragRow);

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
