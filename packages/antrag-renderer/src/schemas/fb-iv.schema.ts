/**
 * FB-IV (Schwerpunktförderung) — Anzeige-Schema.
 *
 * Schlankes Freitext-Antragsformat. Spalten wie `apl.fb_iv_freitext`.
 * Quelle: materialien/wuerzburg-2026/antrag-ahp-4-schwerpunkt.pdf
 */
import type { FbIvFreitext } from "@dv/data-layer";
import type { SectionSchema } from "../types";

export const FB_IV_SECTIONS: ReadonlyArray<SectionSchema<FbIvFreitext>> = [
  {
    id: "vorhaben",
    titel: "Vorhaben",
    fields: [
      { key: "vorhaben_titel", label: "Vorhaben-Titel", type: "text", pflicht: true },
      { key: "kurzbeschreibung", label: "Kurzbeschreibung", type: "longtext", pflicht: true },
      { key: "geplante_massnahmen", label: "Geplante Maßnahmen", type: "longtext", pflicht: true },
    ],
  },
  {
    id: "foerderung",
    titel: "Förderung & Laufzeit",
    fields: [
      { key: "beantragte_summe_euro", label: "Beantragte Summe", type: "euro", pflicht: true },
      { key: "laufzeit", label: "Laufzeit", type: "text" },
    ],
  },
];
