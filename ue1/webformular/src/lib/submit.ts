// Submit-Client. Schickt FormData an die Edge Function `submit-antrag`.
// Erwartet:
//   antrag: JSON-Blob (siehe Edge Function für Schema)
//   file_<index>: Binary für jede Anlage
//
// SUPABASE_URL kommt aus VITE_SUPABASE_URL — in Dev via .env.local,
// in Prod über GH-Pages-Build via Workflow-Secret.

import type { AntragState } from "../state/AntragContext";
import { getSprache } from "./i18n";

export interface SubmitOk {
  antrag_id: string;
  antragsnummer: string;
}

export interface SubmitError {
  error: string;
}

function getSupabaseUrl(): string {
  // Fallback auf Self-Hosted; Production-Build überschreibt via VITE_-Var.
  return import.meta.env.VITE_SUPABASE_URL ?? "https://verwaltung.butscher.cloud";
}

function getAnonKey(): string {
  return import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
}

function toNum(v: string): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toInt(v: string): number | null {
  if (v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Wandelt den UI-State in das Edge-Function-Schema.
 * String-Number-Felder → number | null, leere Optionalia → null.
 */
export function buildPayload(state: AntragState): Record<string, unknown> {
  if (!state.foerderbereich) throw new Error("Kein Förderbereich gewählt");

  const base: Record<string, unknown> = {
    foerderbereich: state.foerderbereich,
    haushaltsjahr: state.haushaltsjahr,
    dachverband: state.dachverband || null,
    einrichtung: state.einrichtung,
    ansprechpartner: state.ansprechpartner,
    strasse: state.strasse,
    hausnummer: state.hausnummer || null,
    plz: state.plz,
    ort: state.ort,
    telefon: state.telefon,
    email: state.email,
    homepage: state.homepage || null,
    bankname: state.bankname,
    iban: state.iban.replace(/\s+/g, "").toUpperCase(),
    bic: state.bic.toUpperCase(),
    submitted_language: getSprache(),
  };

  if (state.foerderbereich === "I") {
    base.fb_i_projekt = {
      projekt_titel: state.fb_i.projekt_titel,
      laufzeit: state.fb_i.laufzeit || null,
      stadtteil: state.fb_i.stadtteil || null,
      personalkosten_euro: toNum(state.fb_i.personalkosten_euro),
      sachkosten_euro: toNum(state.fb_i.sachkosten_euro),
      drittmittel_jsonb: state.fb_i.drittmittel.map((d) => ({
        geber: d.geber, betrag_euro: toNum(d.betrag_euro),
      })),
    };
  } else if (state.foerderbereich === "II") {
    base.fb_ii_ehrenamt = {
      ehrenamt_titel: state.fb_ii.ehrenamt_titel,
      anzahl_helfer_vorjahr: toInt(state.fb_ii.anzahl_helfer_vorjahr),
      gesamt_helferstunden_vorjahr: toInt(state.fb_ii.gesamt_helferstunden_vorjahr),
      direkter_kontakt_senioren: state.fb_ii.direkter_kontakt_senioren,
    };
    base.fb_ii_helfer = state.fb_ii.helfer.map((h, i) => ({
      position: i + 1,
      name: h.name, vorname: h.vorname,
      einsatzbereich: h.einsatzbereich || null,
      eintritt: h.eintritt || null,
      austritt: h.austritt || null,
      stunden_monat: toNum(h.stunden_monat),
      stunden_jahr: toNum(h.stunden_jahr),
    }));
  } else if (state.foerderbereich === "III") {
    const v = state.fb_iii.variante;
    if (!v) throw new Error("Keine Variante gewählt");
    const row: Record<string, unknown> = { variante: v };
    if (v === "A") {
      row.a_anmerkung = state.fb_iii.a_anmerkung || null;
    } else if (v === "B") {
      row.b_anzahl_veranstaltungen = toInt(state.fb_iii.b_anzahl_veranstaltungen);
      row.b_teilnehmer_senioren = toInt(state.fb_iii.b_teilnehmer_senioren);
      row.b_teilnehmer_generationen = toInt(state.fb_iii.b_teilnehmer_generationen);
      row.b_stadtbewohner_anteil = toNum(state.fb_iii.b_stadtbewohner_anteil);
      row.b_quartierstreffen_teilnahme = state.fb_iii.b_quartierstreffen_teilnahme;
      row.b_quartiere = state.fb_iii.b_quartiere || null;
      row.b_quartier_person_name = state.fb_iii.b_quartier_person_name || null;
    } else if (v === "C") {
      row.c_treffen_schwelle = state.fb_iii.c_treffen_schwelle || null;
      row.c_teilnehmer_durchschnitt = toInt(state.fb_iii.c_teilnehmer_durchschnitt);
      row.c_quartierstreffen_anzahl = toInt(state.fb_iii.c_quartierstreffen_anzahl);
      row.c_quartier_kooperation = state.fb_iii.c_quartier_kooperation || null;
      row.c_quartier_person_name = state.fb_iii.c_quartier_person_name || null;
    } else if (v === "D") {
      row.d_hauptamt_name = state.fb_iii.d_hauptamt_name;
      row.d_hauptamt_stunden_woche = toNum(state.fb_iii.d_hauptamt_stunden_woche);
      row.d_hauptamt_stunden_monat = toNum(state.fb_iii.d_hauptamt_stunden_monat);
    }
    base.fb_iii_variante = row;
  } else if (state.foerderbereich === "IV") {
    base.fb_iv_freitext = {
      vorhaben_titel: state.fb_iv.vorhaben_titel,
      kurzbeschreibung: state.fb_iv.kurzbeschreibung,
      geplante_massnahmen: state.fb_iv.geplante_massnahmen,
      beantragte_summe_euro: toNum(state.fb_iv.beantragte_summe_euro),
      laufzeit: state.fb_iv.laufzeit || null,
    };
  }

  // Anlagen-Metadaten: Files werden separat als file_<index> hochgeladen.
  base.anlagen = state.anlagen.map((a, i) => ({
    anlagentyp: a.anlagentyp,
    dateiname: a.dateiname,
    groesse_bytes: a.groesse_bytes,
    upload_key: `file_${i}`,
  }));

  return base;
}

export async function submitAntrag(state: AntragState): Promise<SubmitOk> {
  const url = `${getSupabaseUrl()}/functions/v1/submit-antrag`;
  const fd = new FormData();
  fd.append("antrag", JSON.stringify(buildPayload(state)));
  state.anlagen.forEach((a, i) => {
    if (a.file) fd.append(`file_${i}`, a.file, a.dateiname);
  });

  const headers: Record<string, string> = {};
  const anon = getAnonKey();
  if (anon) {
    headers.apikey = anon;
    headers.Authorization = `Bearer ${anon}`;
  }

  const res = await fetch(url, { method: "POST", body: fd, headers });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* empty */ }
  if (!res.ok) {
    const err = (parsed as SubmitError | null)?.error ?? text ?? `HTTP ${res.status}`;
    throw new Error(err);
  }
  return parsed as SubmitOk;
}
