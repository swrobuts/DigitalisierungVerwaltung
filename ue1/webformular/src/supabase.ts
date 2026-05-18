import type { APL2Antrag, Anlage } from "./types";
import { getSprache } from "./i18n";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY müssen in .env stehen — siehe .env.example",
  );
}

export interface SubmitErfolg { antragsnummer: string; id: string; }
export interface SubmitFehler { error: string; }
export type SubmitErgebnis = SubmitErfolg | SubmitFehler;

export function toSnakeCase(antrag: APL2Antrag): Record<string, unknown> {
  return {
    haushaltsjahr: antrag.haushaltsjahr,
    name: antrag.name,
    anschrift: antrag.anschrift,
    traeger: antrag.traeger,
    bankverbindung: antrag.bankverbindung,
    iban: antrag.iban,
    bic: antrag.bic || null,
    ansprechpartner: antrag.ansprechpartner,
    telefon: antrag.telefon,
    email: antrag.email,
    betriebskosten_vorjahr_euro: antrag.betriebskostenVorjahrEuro,
    personalkosten_vorjahr_euro: antrag.personalkostenVorjahrEuro,
    raeume_vorhanden: antrag.raeumeVorhanden,
    raeume_unentgeltlich: antrag.raeumeUnentgeltlich,
    monatliche_miete_euro: antrag.monatlicheMieteEuro,
    antragsdatum: antrag.antragsdatum,
    submitted_language: getSprache(),
  };
}

export async function submitAntrag(antrag: APL2Antrag, anlagen: Anlage[]): Promise<SubmitErgebnis> {
  const fd = new FormData();
  fd.append("antrag", JSON.stringify(toSnakeCase(antrag)));
  for (const a of anlagen) {
    if (a.file) fd.append(`file__${a.typ}`, a.file, a.dateiname);
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-antrag`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: fd,
    });
    const json = await res.json();
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return json as SubmitErfolg;
  } catch (e) {
    return { error: `Netzwerkfehler: ${(e as Error).message}` };
  }
}
