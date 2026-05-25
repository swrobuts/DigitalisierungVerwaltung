import type { FoerderbereichKonfig } from "./types";

export const FB_I: FoerderbereichKonfig = {
  id: "I",
  label_kurz: "Aufbau",
  label_lang: "Aufbau niedrigschwelliger Angebote",
  icon: "🌱",
  beschreibung: "Anschubfinanzierung für neue Angebote oder neue bürgerschaftliche Engagement-Strukturen",
  pflichtfelder: ["projekt_titel", "personalkosten_euro", "sachkosten_euro"],
  optional_felder: ["laufzeit", "stadtteil", "drittmittel", "andere_mittel"],
  anlagen: [
    { typ: "projektskizze", pflicht: true, mime: ["application/pdf"], max_mb: 10,
      beschreibung: "Kurze Projektskizze (Konzept, Ziele, Maßnahmen)" }
  ],
  validation_rules: [
    { feld: "personalkosten_euro", regel: "value >= 0",
      fehlermeldung: "Personalkosten dürfen nicht negativ sein" },
    { feld: "sachkosten_euro", regel: "value >= 0",
      fehlermeldung: "Sachkosten dürfen nicht negativ sein" }
  ],
  quelle_pdf: "materialien/wuerzburg-2026/antrag-ahp-1-aufbau-niedrigschwellige-angebote.pdf",
};
