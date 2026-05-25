import type { AnlagenSlot, FoerderbereichKonfig } from "./types";

export type FbIiiVarianteId = "A" | "B" | "C" | "D";

export interface FbIiiVarianteKonfig {
  id: FbIiiVarianteId;
  label: string;
  icon: string;
  pflichtfelder: readonly string[];
  optional_felder: readonly string[];
  variantenspezifische_anlagen: readonly AnlagenSlot[];
  foerderhoechstgrenze_euro?: number;
}

export const FB_III_VARIANTEN: Record<FbIiiVarianteId, FbIiiVarianteKonfig> = {
  A: {
    id: "A", label: "Mehrgenerationenhaus", icon: "🏘️",
    pflichtfelder: [],
    optional_felder: ["a_anmerkung"],
    variantenspezifische_anlagen: [
      { typ: "foerderbestaetigung_bund", pflicht: true,
        mime: ["application/pdf"], max_mb: 10,
        beschreibung: "Förderbestätigung Bundesprogramm + Programm-Teil Senior:innen" }
    ],
    foerderhoechstgrenze_euro: 10000,
  },
  B: {
    id: "B", label: "Begegnungszentrum / Bildungsträger", icon: "🏛️",
    pflichtfelder: ["b_anzahl_veranstaltungen", "b_teilnehmer_senioren", "b_stadtbewohner_anteil"],
    optional_felder: ["b_teilnehmer_generationen", "b_quartierstreffen_teilnahme", "b_quartiere", "b_quartier_person_name"],
    variantenspezifische_anlagen: [
      { typ: "programm_flyer", pflicht: true,
        mime: ["application/pdf"], max_mb: 10,
        beschreibung: "Programm-Nachweis (Flyer / Wochenplan)" }
    ],
    foerderhoechstgrenze_euro: 10000,
  },
  C: {
    id: "C", label: "Seniorenkreis / Seniorentreffen", icon: "☕",
    pflichtfelder: ["c_treffen_schwelle", "c_teilnehmer_durchschnitt"],
    optional_felder: ["c_quartierstreffen_anzahl", "c_quartier_kooperation", "c_quartier_person_name"],
    variantenspezifische_anlagen: [
      { typ: "programm_flyer", pflicht: true,
        mime: ["application/pdf"], max_mb: 10,
        beschreibung: "Programm-Nachweis der Treffen" }
    ],
    foerderhoechstgrenze_euro: 2000,
  },
  D: {
    id: "D", label: "Quartiersmanagement", icon: "🗺️",
    pflichtfelder: ["d_hauptamt_name", "d_hauptamt_stunden_woche"],
    optional_felder: ["d_hauptamt_stunden_monat", "d_ehrenamt_personen_jsonb"],
    variantenspezifische_anlagen: [
      { typ: "stundenzettel", pflicht: true,
        mime: ["application/pdf"], max_mb: 10,
        beschreibung: "Stundenzettel für aufwandsentschädigte Personen" }
    ],
    foerderhoechstgrenze_euro: 7500,
  },
};

export const FB_III: FoerderbereichKonfig = {
  id: "III",
  label_kurz: "Bewährte Strukturen",
  label_lang: "Förderung bewährter Strukturen",
  icon: "🏛️",
  beschreibung: "Laufende Förderung etablierter Strukturen — Mehrgenerationenhaus, Begegnungszentrum, Seniorenkreis oder Quartiersmanagement",
  pflichtfelder: ["variante"],
  optional_felder: [],
  anlagen: [],
  validation_rules: [
    { feld: "variante", kind: "enum", values: ["A", "B", "C", "D"],
      fehlermeldung: "Bitte genau eine Variante (A/B/C/D) wählen" }
  ],
  quelle_pdf: "materialien/wuerzburg-2026/antrag-ahp-3-bewaehrte-strukturen.pdf",
};
