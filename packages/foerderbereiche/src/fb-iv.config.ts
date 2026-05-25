import type { FoerderbereichKonfig } from "./types";

export const FB_IV: FoerderbereichKonfig = {
  id: "IV",
  label_kurz: "Schwerpunkt",
  label_lang: "Struktur- und Schwerpunktförderung",
  icon: "🎯",
  beschreibung: "Individuelle Vorhaben außerhalb der Standard-Förderbereiche — strukturierter Antrag mit Leitfragen",
  pflichtfelder: ["vorhaben_titel", "kurzbeschreibung", "geplante_massnahmen"],
  optional_felder: ["beantragte_summe_euro", "laufzeit"],
  anlagen: [
    { typ: "sonstige", pflicht: false, mime: ["application/pdf"], max_mb: 10,
      beschreibung: "Beliebige Anlagen (Konzept, Kostenplan, etc.)" }
  ],
  validation_rules: [
    { feld: "kurzbeschreibung", regel: "value.length <= 1000",
      fehlermeldung: "Kurzbeschreibung max 1000 Zeichen" }
  ],
  quelle_pdf: "materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf",
};
