import type { APL2Antrag, ValidationErrors, AnlagenTyp } from "./types";

const ANLAGEN_LABEL: Record<AnlagenTyp, string> = {
  "programm-altentagesstaette": "Programm der Altentagesstätte",
  "anlage-1-kostennachweis": "Anlage 1 — Kostennachweis",
  "personalkostenbelege": "Personalkostenbelege",
  "mietvertrag": "Kopie Mietvertrag",
};

const PFLICHT_ANLAGEN: AnlagenTyp[] = [
  "programm-altentagesstaette",
  "anlage-1-kostennachweis",
  "personalkostenbelege",
];

export function validateCrossField(antrag: APL2Antrag): ValidationErrors {
  const errors: ValidationErrors = {};

  if (
    antrag.raeumeVorhanden === "nein" &&
    antrag.raeumeUnentgeltlich === "nein" &&
    antrag.monatlicheMieteEuro <= 0
  ) {
    errors.monatlicheMieteEuro =
      "Ohne eigene oder unentgeltliche Räume muss eine monatliche Miete angegeben werden.";
  }

  if (antrag.monatlicheMieteEuro > 0) {
    const hatMietvertrag = antrag.anlagen.some((a) => a.typ === "mietvertrag");
    if (!hatMietvertrag) {
      errors.mietvertrag = "Bei angegebener Miete ist eine Kopie des Mietvertrags Pflicht.";
    }
  }

  for (const typ of PFLICHT_ANLAGEN) {
    const dabei = antrag.anlagen.some((a) => a.typ === typ);
    if (!dabei) {
      errors[typ] = `Pflichtanlage fehlt: ${ANLAGEN_LABEL[typ]}`;
    }
  }

  return errors;
}
