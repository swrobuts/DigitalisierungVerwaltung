/**
 * FB-II (Engagement & Ehrenamt) — Anzeige-Schema.
 *
 * Spalten 1:1 wie `apl.fb_ii_ehrenamt`. Die Helfer-Liste (1:n) wird vom
 * AntragViewer separat behandelt — eine Tabelle statt einer Row.
 *
 * Helfer-Spalten: Pos | Name | Vorname | Einsatzbereich | Eintritt |
 *                 Austritt | Std./Monat | Std./Jahr
 * Quelle: materialien/wuerzburg-2026/anlage-ahp-2-helferliste.pdf
 */
import type { FbIiEhrenamt, FbIiHelfer } from "@dv/data-layer";
import type { FieldSchema, SectionSchema } from "../types";

export const FB_II_SECTIONS: ReadonlyArray<SectionSchema<FbIiEhrenamt>> = [
  {
    id: "ehrenamt",
    titel: "Ehrenamtsprojekt",
    fields: [
      { key: "ehrenamt_titel", label: "Ehrenamt-Titel", type: "text", pflicht: true },
      { key: "anzahl_helfer_vorjahr", label: "Helfer im Vorjahr", type: "number" },
      { key: "gesamt_helferstunden_vorjahr", label: "Helferstunden gesamt", type: "number" },
      {
        key: "direkter_kontakt_senioren",
        label: "Direkter Kontakt zu Senioren",
        type: "bool",
      },
    ],
  },
];

/** Spalten-Schema für die Helfer-Tabelle (1:n). */
export const FB_II_HELFER_COLUMNS: ReadonlyArray<FieldSchema<FbIiHelfer>> = [
  { key: "position", label: "Pos", type: "number" },
  { key: "name", label: "Name", type: "text" },
  { key: "vorname", label: "Vorname", type: "text" },
  { key: "einsatzbereich", label: "Einsatz", type: "text" },
  { key: "eintritt", label: "Eintritt", type: "date" },
  { key: "austritt", label: "Austritt", type: "date" },
  { key: "stunden_monat", label: "Std./Monat", type: "number" },
  { key: "stunden_jahr", label: "Std./Jahr", type: "number" },
];
