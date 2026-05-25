import type { FoerderbereichKonfig } from "./types";

export const FB_II: FoerderbereichKonfig = {
  id: "II",
  label_kurz: "Engagement",
  label_lang: "Förderung bürgerschaftlichen Engagements",
  icon: "🤝",
  beschreibung: "Pauschale Förderung von Helferkreisen, Besuchsdiensten, Nachbarschaftshilfen",
  pflichtfelder: ["ehrenamt_titel", "anzahl_helfer_vorjahr", "gesamt_helferstunden_vorjahr"],
  optional_felder: ["direkter_kontakt_senioren"],
  anlagen: [
    { typ: "helferliste", pflicht: false,
      mime: ["application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      max_mb: 10,
      beschreibung: "Helferliste (PDF amtliche Vorlage oder Excel-Schablone) — nur wenn Tabelle im Webform nicht ausgefüllt" }
  ],
  validation_rules: [
    { feld: "anzahl_helfer_vorjahr", kind: "min", value: 0,
      fehlermeldung: "Anzahl Helfer kann nicht negativ sein" },
    { feld: "gesamt_helferstunden_vorjahr", kind: "min", value: 0,
      fehlermeldung: "Helferstunden können nicht negativ sein" }
  ],
  quelle_pdf: "materialien/wuerzburg-2026/antrag-ahp-2-buergerschaftliches-engagement.pdf",
};
