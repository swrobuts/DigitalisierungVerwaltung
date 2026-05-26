/**
 * FB-I (Aufbau niedrigschwelliger Angebote) — Anzeige-Schema.
 *
 * Spiegelt 1:1 die DB-Tabelle `apl.fb_i_projekt` plus berechnete Felder.
 * Quelle: materialien/wuerzburg-2026/antrag-ahp-1-aufbau.pdf
 */
import type { FbIProjekt } from "@dv/data-layer";
import type { SectionSchema } from "../types";

export const FB_I_SECTIONS: ReadonlyArray<SectionSchema<FbIProjekt>> = [
  {
    id: "projekt",
    titel: "Projekt-Eckdaten",
    fields: [
      { key: "projekt_titel", label: "Projekt-Titel", type: "text", pflicht: true },
      { key: "laufzeit", label: "Laufzeit", type: "text" },
      { key: "stadtteil", label: "Stadtteil", type: "text" },
    ],
  },
  {
    id: "kosten",
    titel: "Kostenplan",
    fields: [
      { key: "personalkosten_euro", label: "Personalkosten", type: "euro", pflicht: true },
      { key: "sachkosten_euro", label: "Sachkosten", type: "euro", pflicht: true },
      {
        key: "gesamtkosten",
        label: "Gesamtkosten",
        type: "computed",
        compute: (d) =>
          (d.personalkosten_euro ?? 0) + (d.sachkosten_euro ?? 0),
      },
    ],
  },
  {
    id: "drittmittel",
    titel: "Drittmittel & andere Förderungen",
    fields: [
      {
        key: "drittmittel_jsonb",
        label: "Drittmittel",
        type: "list",
        itemSchema: [
          { key: "geber", label: "Geber", type: "text" },
          { key: "betrag_euro", label: "Betrag", type: "euro" },
        ],
      },
      {
        key: "andere_mittel_jsonb",
        label: "Andere Mittel",
        type: "list",
        itemSchema: [
          { key: "geber", label: "Geber", type: "text" },
          { key: "betrag_euro", label: "Betrag", type: "euro" },
        ],
      },
    ],
  },
];
