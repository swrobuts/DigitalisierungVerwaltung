import type { APL2Antrag, Anlage } from "./types";
import { getSprache } from "./i18n";

// Lazy-read: Guard erst in submitAntrag() — so lässt sich toSnakeCase in Tests
// ohne echte ENV-Vars importieren und testen.
function getConfig(): { url: string; anonKey: string } {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) {
    throw new Error(
      "VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY müssen in .env stehen — siehe .env.example",
    );
  }
  return { url, anonKey };
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
  const { url, anonKey } = getConfig();
  const fd = new FormData();
  fd.append("antrag", JSON.stringify(toSnakeCase(antrag)));
  for (const a of anlagen) {
    if (a.file) fd.append(`file__${a.typ}`, a.file, a.dateiname);
  }

  try {
    const res = await fetch(`${url}/functions/v1/submit-antrag`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
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
