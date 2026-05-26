/**
 * TypeScript-Interfaces zum apl-Schema (Supabase-Migrationen 060-067).
 *
 * Konvention:
 *   - Datums-/Timestamp-Spalten kommen als ISO-Strings aus PostgREST.
 *   - jsonb-Spalten → `Json`-Type (unknown JSON-Form).
 *   - nullable Spalten der View `antrag_inbox` sind explizit `| null`,
 *     weil die FB-Detail-Joins LEFT JOINs sind.
 */

import type { FoerderbereichId } from "@dv/foerderbereiche";

export type { FoerderbereichId };

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

// ── Enums (aus 060/061/062) ────────────────────────────────────────────────
export type StatusEnum =
  | "eingegangen"
  | "in_pruefung"
  | "rueckfrage"
  | "bewilligt"
  | "abgelehnt";

export type FbIiiVarianteId = "A" | "B" | "C" | "D";

export type TreffenSchwelle = "GT_10" | "GT_20" | "GT_40";

export type AnlagenTyp =
  | "projektskizze"
  | "helferliste"
  | "foerderbestaetigung_bund"
  | "programm_flyer"
  | "stundenzettel"
  | "sonstige";

export type Pruefstatus = "offen" | "ok" | "fraglich" | "fehlt";

export type EinreichungStatus = "wartend" | "in_verarbeitung" | "fertig" | "fehler";

export type BescheidEntscheidung = "bewilligt" | "abgelehnt" | "rueckfrage";

// ── apl.antraege ───────────────────────────────────────────────────────────
export interface Antrag {
  id: string;
  antragsnummer: string | null;
  haushaltsjahr: number;
  foerderbereich: FoerderbereichId;

  // Antragsteller-Block
  dachverband: string | null;
  einrichtung: string;
  ansprechpartner: string;
  strasse: string;
  hausnummer: string | null;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  homepage: string | null;
  bankname: string;
  iban: string;
  bic: string;

  // Workflow
  status: StatusEnum;
  submitted_at: string;
  submitted_language: "de" | "tr";
  user_agent: string | null;
  ip_address: string | null;
}

// ── apl.fb_i_projekt (1:1) ─────────────────────────────────────────────────
export interface FbIProjekt {
  antrag_id: string;
  projekt_titel: string;
  laufzeit: string | null;
  stadtteil: string | null;
  personalkosten_euro: number | null;
  sachkosten_euro: number | null;
  drittmittel_jsonb: Json;
  andere_mittel_jsonb: Json;
}

// ── apl.fb_ii_ehrenamt (1:1) ───────────────────────────────────────────────
export interface FbIiEhrenamt {
  antrag_id: string;
  ehrenamt_titel: string;
  anzahl_helfer_vorjahr: number | null;
  gesamt_helferstunden_vorjahr: number | null;
  direkter_kontakt_senioren: boolean;
}

// ── apl.fb_ii_helfer (1:n) ─────────────────────────────────────────────────
export interface FbIiHelfer {
  id: string;
  antrag_id: string;
  position: number;
  name: string;
  vorname: string;
  einsatzbereich: string | null;
  eintritt: string | null;
  austritt: string | null;
  stunden_monat: number | null;
  stunden_jahr: number | null;
}

// ── apl.fb_iii_variante (1:1) ──────────────────────────────────────────────
export interface FbIiiVarianteRow {
  antrag_id: string;
  variante: FbIiiVarianteId;

  // A
  a_anmerkung: string | null;

  // B
  b_anzahl_veranstaltungen: number | null;
  b_teilnehmer_senioren: number | null;
  b_teilnehmer_generationen: number | null;
  b_stadtbewohner_anteil: number | null;
  b_quartierstreffen_teilnahme: boolean | null;
  b_quartiere: string | null;
  b_quartier_person_name: string | null;

  // C
  c_treffen_schwelle: TreffenSchwelle | null;
  c_teilnehmer_durchschnitt: number | null;
  c_quartierstreffen_anzahl: number | null;
  c_quartier_kooperation: string | null;
  c_quartier_person_name: string | null;

  // D
  d_hauptamt_name: string | null;
  d_hauptamt_stunden_woche: number | null;
  d_hauptamt_stunden_monat: number | null;
  d_ehrenamt_personen_jsonb: Json;
}

// ── apl.fb_iv_freitext (1:1) ───────────────────────────────────────────────
//
// Migration 071 hat alle vorher-NOT-NULL-Spalten nullable gemacht und die
// Spalte `dokument_path` ergänzt. FB IV ist laut Stadt Würzburg ein
// FORMLOSER Antrag — Pflicht ist nur das hochgeladene PDF (dokument_path).
// Die alten Felder bleiben als nullable Legacy-Spalten erhalten und
// werden nicht mehr im Anzeige-Schema gefordert
// (siehe docs/PDF-FELDER-AUDIT-2026-05-26.md).
export interface FbIvFreitext {
  antrag_id: string;
  vorhaben_titel: string | null;
  kurzbeschreibung: string | null;
  geplante_massnahmen: string | null;
  beantragte_summe_euro: number | null;
  laufzeit: string | null;
  dokument_path: string | null;
}

// ── apl.anlagen ────────────────────────────────────────────────────────────
export interface Anlage {
  id: string;
  antrag_id: string;
  anlagentyp: AnlagenTyp;
  dateiname: string;
  storage_path: string;
  groesse_bytes: number | null;
  hochgeladen_am: string;
}

// ── apl.antrag_history ─────────────────────────────────────────────────────
export interface AntragHistory {
  id: string;
  antrag_id: string;
  von_status: string | null;
  nach_status: string;
  geaendert_von: string | null;
  geaendert_am: string;
  kommentar: string | null;
}

// ── apl.bescheide ──────────────────────────────────────────────────────────
export interface Bescheid {
  id: string;
  antrag_id: string;
  entscheidung: BescheidEntscheidung;
  bewilligte_summe_euro: number | null;
  begruendung_jsonb: Json;
  bearbeiter_kommentar: string | null;
  ausgestellt_von: string | null;
  ausgestellt_am: string;
  pdf_storage_path: string | null;
  doctree_version: string | null;
}

// ── apl.antrag_einreichung ─────────────────────────────────────────────────
export interface AntragEinreichung {
  id: string;
  storage_path: string;
  dateiname: string | null;
  groesse_bytes: number | null;
  erkannter_fb: FoerderbereichId | null;
  eingereicht_am: string;
  status: EinreichungStatus;
  antrag_id: string | null;
  extrahiert_jsonb: Json | null;
  fehler_text: string | null;
  verarbeitet_am: string | null;
}

// ── View apl.antrag_inbox (LEFT JOINs → alle FB-spez. Felder nullable) ─────
export interface AntragInbox {
  // Antrag-Stamm
  id: string;
  antragsnummer: string | null;
  haushaltsjahr: number;
  foerderbereich: FoerderbereichId;
  dachverband: string | null;
  einrichtung: string;
  ansprechpartner: string;
  strasse: string;
  hausnummer: string | null;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  homepage: string | null;
  bankname: string;
  iban: string;
  bic: string;
  status: StatusEnum;
  submitted_at: string;
  submitted_language: "de" | "tr";
  user_agent: string | null;
  ip_address: string | null;

  // FB I-spezifisch
  fb_i_gesamtkosten_euro: number | null;
  fb_i_projekt_titel: string | null;

  // FB II-spezifisch
  fb_ii_ehrenamt_titel: string | null;
  fb_ii_anzahl_helfer: number | null;
  fb_ii_helferstunden: number | null;

  // FB III-spezifisch
  fb_iii_variante: FbIiiVarianteId | null;
  fb_iii_c_betrag_euro: number | null;

  // FB IV-spezifisch
  fb_iv_vorhaben_titel: string | null;
  fb_iv_beantragte_summe_euro: number | null;

  // Workflow-Aggregate
  entschieden_am: string | null;
  entscheidungs_typ: string | null;
  durchlaufzeit_tage: number;
  anlagen_count: number;
}
