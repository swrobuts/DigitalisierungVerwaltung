/**
 * FB-IV (Schwerpunktförderung) — Anzeige-Schema.
 *
 * Stadt Würzburg sagt „FB IV: Formlos" — es gibt KEIN offizielles
 * Antragsformular-PDF (Quelle: https://www.wuerzburg.de/themen/gesundheit-
 * soziales/senioren/antragswesen/index.html, Stand 2026-05-26).
 *
 * Pflicht ist nur der PDF-Upload (dokument_path). Die Felder
 * vorhaben_titel + kurzbeschreibung sind optionale KI-Klassifikations-
 * Hilfsfelder. Die Legacy-Spalten geplante_massnahmen,
 * beantragte_summe_euro, laufzeit bleiben in der DB als nullable
 * Legacy-Spalten (Migration 071), werden hier aber nicht mehr angezeigt,
 * weil sie PDF-fremd sind (siehe docs/PDF-FELDER-AUDIT-2026-05-26.md).
 */
import type { FbIvFreitext } from "@dv/data-layer";
import type { SectionSchema } from "../types";

export const FB_IV_SECTIONS: ReadonlyArray<SectionSchema<FbIvFreitext>> = [
  {
    id: "dokument",
    titel: "Formloser Antrag",
    fields: [
      { key: "dokument_path", label: "Hochgeladenes Dokument", type: "text", pflicht: true },
    ],
  },
  {
    id: "klassifikation",
    titel: "KI-Klassifikations-Hilfe (optional)",
    fields: [
      { key: "vorhaben_titel", label: "Vorhaben-Titel", type: "text" },
      { key: "kurzbeschreibung", label: "Kurzbeschreibung", type: "longtext" },
    ],
  },
];
