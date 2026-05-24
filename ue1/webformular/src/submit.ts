import type { FormState } from "./types";

// URL der Edge Function — vorzugsweise aus VITE_SUPABASE_URL (Konvention aus
// supabase.ts), Fallback auf butscher.cloud-Default.
const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "https://verwaltung.butscher.cloud";
const FUNCTION_URL = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/submit-antrag`;
const ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_ANON_KEY as string | undefined) ??
  "";

/**
 * Sendet den Stepper-State an die submit-antrag-Edge-Function (v3 — PDF-Voll-Sync).
 * - FormData mit `antrag` (JSON), `file_<sha256>` pro Beleg, `flyer` + `mietvertrag` separat.
 * - Belegpositionen werden zusätzlich aus den primitiven Vorjahres-Feldern
 *   (Betriebskosten, Personalkosten, Miete×12) synthetisch erzeugt.
 * - Wirft bei Non-2xx-Response; Aufrufer entscheidet über UI-Behandlung.
 */
export async function submitAntrag(state: FormState): Promise<{ antragsnummer: string; id: string }> {
  if (!ANON_KEY) {
    throw new Error(
      "Fehlt: VITE_SUPABASE_ANON_KEY zur Build-Zeit. Kong wird ohne apikey 401 zurückgeben.",
    );
  }
  const form = new FormData();

  // Belegpositionen aus primitiven Feldern erzeugen (PDF-Voll-Sync).
  const synthetischeBelege: Array<{
    belegtyp: "betriebskosten" | "personalkosten" | "miete";
    bezeichnung: string;
    betrag_euro: number;
    file_hash: null;
  }> = [];
  if (state.betriebskosten_vorjahr_euro !== null && state.betriebskosten_vorjahr_euro > 0) {
    synthetischeBelege.push({
      belegtyp: "betriebskosten",
      bezeichnung: "Betriebskosten Vorjahr (aus Antragsformular)",
      betrag_euro: state.betriebskosten_vorjahr_euro,
      file_hash: null,
    });
  }
  if (state.personalkosten_vorjahr_euro !== null && state.personalkosten_vorjahr_euro > 0) {
    synthetischeBelege.push({
      belegtyp: "personalkosten",
      bezeichnung: "Personalkosten Vorjahr (aus Antragsformular)",
      betrag_euro: state.personalkosten_vorjahr_euro,
      file_hash: null,
    });
  }
  if (state.monatliche_miete_euro !== null && state.monatliche_miete_euro > 0) {
    synthetischeBelege.push({
      belegtyp: "miete",
      bezeichnung: "Jahresmiete (12 × Monatsmiete)",
      betrag_euro: state.monatliche_miete_euro * 12,
      file_hash: null,
    });
  }

  const belegpositionen = [
    ...synthetischeBelege,
    ...state.belegpositionen.map((b) => ({
      belegtyp: b.belegtyp,
      bezeichnung: b.bezeichnung,
      betrag_euro: b.betrag_euro,
      file_hash: b.file_hash,
    })),
  ];

  const antragPayload = {
    haushaltsjahr: state.haushaltsjahr,
    name: state.name,
    traeger: state.traeger,
    strasse: state.strasse,
    hausnummer: state.hausnummer,
    plz: state.plz,
    ort: state.ort,
    // PDF-Voll-Sync: telefon, bankverbindung, bic sind Pflicht — keine
    // null-Toleranz mehr.
    bankverbindung: state.bankverbindung,
    iban: state.iban.replace(/\s+/g, ""),
    bic: state.bic,
    ansprechpartner: state.ansprechpartner,
    telefon: state.telefon,
    email: state.email,
    raeume_vorhanden: state.raeume_vorhanden,
    raeume_unentgeltlich: state.raeume_unentgeltlich,
    antragsdatum: state.antragsdatum,
    submitted_language: state.language,
    // Bemessungsgrundlage gem. AHP 2.3 FB III Pkt. 2 (Begegnungszentren).
    // DB-Spaltennamen tragen kein '_vorjahr'-Suffix; im FormState heißen
    // die Felder bewusst '*_vorjahr', weil die Richtlinie explizit auf
    // den Vorjahres-Zeitraum referenziert — die DB-Konvention ist älter
    // und neutraler.
    anzahl_teilnehmer: state.anzahl_teilnehmer_vorjahr,
    stadtbewohner_anteil: state.stadtbewohner_anteil_vorjahr,
    anzahl_treffen_jahr: state.anzahl_veranstaltungen_vorjahr,
    oeffnungszeiten: state.oeffnungszeiten.filter(
      (o) => o.oeffnungszeit.trim() || o.angebot.trim(),
    ),
    belegpositionen,
  };
  form.append("antrag", JSON.stringify(antragPayload));

  // Hash-deduplizierte Files anhängen (file_<sha256>-Schema).
  const seen = new Set<string>();
  for (const pos of state.belegpositionen) {
    if (pos.file && pos.file_hash && !seen.has(pos.file_hash)) {
      form.append(`file_${pos.file_hash}`, pos.file, pos.file.name);
      seen.add(pos.file_hash);
    }
  }

  if (state.programm_flyer) {
    form.append("flyer", state.programm_flyer, state.programm_flyer.name);
  }

  if (state.mietvertrag_file) {
    form.append("mietvertrag", state.mietvertrag_file, state.mietvertrag_file.name);
  }

  const r = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { apikey: ANON_KEY },
    body: form,
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Submit failed: ${r.status} ${txt}`);
  }
  return r.json();
}
