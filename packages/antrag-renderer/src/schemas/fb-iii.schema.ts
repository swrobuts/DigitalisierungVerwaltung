/**
 * FB-III (Bewährte Strukturen) — Anzeige-Schema pro Variante A/B/C/D.
 *
 * Eine Variante ist immer aktiv (gewählt im Antrag). Conditionals
 * sorgen dafür, dass die Sachbearbeitung nur die variantenrelevanten
 * Felder sieht.
 *
 * Labels bewusst NICHT abgekürzt — sie spiegeln 1:1 die Felder im
 * PDF-Antragsformular wider (siehe c_treffen_schwelle Enum-Labels).
 * Quelle: materialien/wuerzburg-2026/antrag-ahp-3-bewaehrte-strukturen.pdf
 */
import type { FbIiiVarianteRow } from "@dv/data-layer";
import type { SectionSchema } from "../types";

const TREFFEN_SCHWELLE_LABELS: Record<string, string> = {
  GT_10: "Über 10 Treffen / Vorjahr",
  GT_20: "Über 20 Treffen / Vorjahr",
  GT_40: "Über 40 Treffen / Vorjahr",
};

export const FB_III_SECTIONS: ReadonlyArray<SectionSchema<FbIiiVarianteRow>> = [
  // ── Gewählte Variante immer anzeigen ────────────────────────────────
  {
    id: "variante",
    titel: "Variante",
    fields: [
      { key: "variante", label: "Gewählte Variante", type: "text", pflicht: true },
    ],
  },
  // ── Variante A: Mehrgenerationenhaus ────────────────────────────────
  {
    id: "variante-a",
    titel: "Variante A — Mehrgenerationenhaus",
    conditional: (d) => d.variante === "A",
    fields: [
      { key: "a_anmerkung", label: "Anmerkung", type: "longtext" },
    ],
  },
  // ── Variante B: Begegnungszentrum / Bildungsträger ──────────────────
  {
    id: "variante-b",
    titel: "Variante B — Begegnungszentrum / Bildungsträger",
    conditional: (d) => d.variante === "B",
    fields: [
      { key: "b_anzahl_veranstaltungen", label: "Anzahl Veranstaltungen", type: "number", pflicht: true },
      { key: "b_teilnehmer_senioren", label: "Teilnehmer Senioren", type: "number", pflicht: true },
      { key: "b_teilnehmer_generationen", label: "Teilnehmer generationenübergreifend", type: "number" },
      { key: "b_stadtbewohner_anteil", label: "Stadtbewohner-Anteil", type: "percent", pflicht: true },
      { key: "b_quartierstreffen_teilnahme", label: "Quartierstreffen-Teilnahme", type: "bool" },
      { key: "b_quartiere", label: "Quartiere", type: "text" },
      { key: "b_quartier_person_name", label: "Quartier-Person", type: "text" },
    ],
  },
  // ── Variante C: Seniorenkreis / Seniorentreffen ─────────────────────
  {
    id: "variante-c",
    titel: "Variante C — Seniorenkreis / Seniorentreffen",
    conditional: (d) => d.variante === "C",
    fields: [
      {
        key: "c_treffen_schwelle",
        label: "Treffen-Schwelle",
        type: "enum",
        pflicht: true,
        enumLabels: TREFFEN_SCHWELLE_LABELS,
      },
      { key: "c_teilnehmer_durchschnitt", label: "Teilnehmer:innen durchschnittlich pro Treffen", type: "number", pflicht: true },
      { key: "c_quartierstreffen_anzahl", label: "Quartierstreffen-Anzahl", type: "number" },
      { key: "c_quartier_kooperation", label: "Quartier-Kooperation", type: "text" },
      { key: "c_quartier_person_name", label: "Quartier-Person", type: "text" },
    ],
  },
  // ── Variante D: Quartiersmanagement ─────────────────────────────────
  {
    id: "variante-d",
    titel: "Variante D — Quartiersmanagement",
    conditional: (d) => d.variante === "D",
    fields: [
      { key: "d_hauptamt_name", label: "Hauptamt-Name", type: "text", pflicht: true },
      { key: "d_hauptamt_stunden_woche", label: "Hauptamt Stunden/Woche", type: "number", pflicht: true },
      { key: "d_hauptamt_stunden_monat", label: "Hauptamt Stunden/Monat", type: "number" },
      {
        key: "d_ehrenamt_personen_jsonb",
        label: "Ehrenamt-Personen (Aufwandsentschädigung)",
        type: "list",
        itemSchema: [
          { key: "name", label: "Name", type: "text" },
          { key: "stunden_woche", label: "Std./Woche", type: "number" },
        ],
      },
    ],
  },
];
