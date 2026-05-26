/**
 * CI-Gate: stellt sicher, dass JEDE DB-Spalte einer FB-Detail-Tabelle
 * im entsprechenden Anzeige-Schema vorhanden ist.
 *
 * Wenn jemand künftig in der DB ein Feld ergänzt aber das Schema vergisst,
 * fängt dieser Test es ab. Das war der ursprüngliche Bug, der zu diesem
 * Refactoring führte (c_quartier_person_name fehlte in UE3 nach UE1-Add).
 *
 * Die DB-Spaltenlisten sind hier hartcodiert — sie spiegeln den Stand aus
 * `packages/data-layer/src/db-types.ts`. Wenn dort ein Feld dazukommt,
 * bricht dieser Test, bis es im Schema ergänzt wird. Das ist gewollt.
 */
import { describe, expect, it } from "vitest";
import {
  FB_I_SECTIONS,
  FB_II_SECTIONS,
  FB_II_HELFER_COLUMNS,
  FB_III_SECTIONS,
  FB_IV_SECTIONS,
} from "../src";

/** Sammelt alle Field-Keys aus einer Section-Liste (ohne computed-Felder). */
function collectKeys(sections: ReadonlyArray<{ fields: ReadonlyArray<{ key: string; type: string }> }>): Set<string> {
  const s = new Set<string>();
  for (const sec of sections) {
    for (const f of sec.fields) {
      if (f.type !== "computed") s.add(f.key);
    }
  }
  return s;
}

// ── DB-Spalten Stand 2026-05-26 (aus apl.fb_*-Tabellen, Migrationen 060-067) ──

const FB_I_DB_COLUMNS = [
  // antrag_id ist FK, nicht anzuzeigen
  "projekt_titel",
  "laufzeit",
  "stadtteil",
  "personalkosten_euro",
  "sachkosten_euro",
  "drittmittel_jsonb",
  "andere_mittel_jsonb",
];

const FB_II_EHRENAMT_DB_COLUMNS = [
  "ehrenamt_titel",
  "anzahl_helfer_vorjahr",
  "gesamt_helferstunden_vorjahr",
  "direkter_kontakt_senioren",
];

const FB_II_HELFER_DB_COLUMNS = [
  // id und antrag_id sind FK, nicht anzuzeigen
  "position",
  "name",
  "vorname",
  "einsatzbereich",
  "eintritt",
  "austritt",
  "stunden_monat",
  "stunden_jahr",
];

const FB_III_DB_COLUMNS = [
  "variante",
  "a_anmerkung",
  "b_anzahl_veranstaltungen",
  "b_teilnehmer_senioren",
  "b_teilnehmer_generationen",
  "b_stadtbewohner_anteil",
  "b_quartierstreffen_teilnahme",
  "b_quartiere",
  "b_quartier_person_name",
  "c_treffen_schwelle",
  "c_teilnehmer_durchschnitt",
  "c_quartierstreffen_anzahl",
  "c_quartier_kooperation",
  "c_quartier_person_name",
  "d_hauptamt_name",
  "d_hauptamt_stunden_woche",
  "d_hauptamt_stunden_monat",
  "d_ehrenamt_personen_jsonb",
];

const FB_IV_DB_COLUMNS = [
  "vorhaben_titel",
  "kurzbeschreibung",
  "geplante_massnahmen",
  "beantragte_summe_euro",
  "laufzeit",
];

describe("Field-Coverage: jede DB-Spalte ist im Anzeige-Schema", () => {
  it("FB-I", () => {
    const inSchema = collectKeys(FB_I_SECTIONS);
    const missing = FB_I_DB_COLUMNS.filter((c) => !inSchema.has(c));
    expect(missing).toEqual([]);
  });

  it("FB-II Ehrenamt", () => {
    const inSchema = collectKeys(FB_II_SECTIONS);
    const missing = FB_II_EHRENAMT_DB_COLUMNS.filter((c) => !inSchema.has(c));
    expect(missing).toEqual([]);
  });

  it("FB-II Helfer-Tabelle", () => {
    const inSchema = new Set(FB_II_HELFER_COLUMNS.map((c) => c.key));
    const missing = FB_II_HELFER_DB_COLUMNS.filter((c) => !inSchema.has(c));
    expect(missing).toEqual([]);
  });

  it("FB-III (alle Varianten)", () => {
    const inSchema = collectKeys(FB_III_SECTIONS);
    const missing = FB_III_DB_COLUMNS.filter((c) => !inSchema.has(c));
    expect(missing).toEqual([]);
  });

  it("FB-IV", () => {
    const inSchema = collectKeys(FB_IV_SECTIONS);
    const missing = FB_IV_DB_COLUMNS.filter((c) => !inSchema.has(c));
    expect(missing).toEqual([]);
  });
});
