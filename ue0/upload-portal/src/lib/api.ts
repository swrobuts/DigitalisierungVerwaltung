/**
 * Backend-Endpoints für UE0:
 *
 *   1) Supabase Edge Function `upload-antragspdf` — Hauptantrag + optionale
 *      Anlage hochladen + Tracking-Eintrag erzeugen.
 *
 *   2) Klassifikations-Service `https://pruefung.butscher.cloud/api/klassifiziere-pdf`
 *      — Smart-Upload-Erkennung des Förderbereichs.
 *
 * Beide Calls sind ohne Login (anon-key) erreichbar; CORS ist im Backend
 * für `https://swrobuts.github.io` + localhost gewhitelistet.
 */

export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://supabase.butscher.cloud";

export const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const UPLOAD_ENDPOINT = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/upload-antragspdf`;

export const KLASSIFIZIERE_ENDPOINT =
  (import.meta.env.VITE_KLASSIFIZIERE_URL as string | undefined) ??
  "https://pruefung.butscher.cloud/api/klassifiziere-pdf";

export const UE1_BASE_URL =
  (import.meta.env.VITE_UE1_URL as string | undefined) ??
  "https://swrobuts.github.io/DigitalisierungVerwaltung/ue1/webformular";

export type FoerderbereichId = "I" | "II" | "III" | "IV";
export type FbIiiVarianteId = "A" | "B" | "C" | "D";

export interface KlassifikationResult {
  fb: FoerderbereichId | null;
  variante: FbIiiVarianteId | null;
  konfidenz: number;
  begruendung: string;
}

export interface UploadPayload {
  /** Hauptantrag-PDF (Pflicht). */
  datei: File;
  /** Vom Bürger explizit gewählter FB. Bei Smart-Upload mit ungewissem Vorschlag NULL. */
  foerderbereich?: FoerderbereichId | null;
  /** Frontend-Klassifizierer-Ergebnis (Smart-Upload). Wird in apl.antrag_einreichung.erkannter_fb gespeichert. */
  erkannter_fb?: FoerderbereichId | null;
  /** Nur FB III. */
  variante?: FbIiiVarianteId | null;
  /** Optionale Anlage (FB-spezifisch — siehe @dv/foerderbereiche). */
  anlage?: File | null;
  /** Slot-Typ aus AnlagenSlot.typ. Pflicht wenn `anlage` gesetzt. */
  anlage_typ?: string | null;
}

export interface UploadResponse {
  einreichung_id: string;
  tracking_id: string; // Alias, Rückwärtskompatibilität
}

/**
 * Lädt ein einzelnes PDF zum Klassifikations-Endpoint hoch.
 * Wirft Error mit lesbarer Message bei Netzwerk- / 5xx-Fehlern.
 */
export async function klassifizierePdf(file: File): Promise<KlassifikationResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(KLASSIFIZIERE_ENDPOINT, { method: "POST", body: fd });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Klassifikation fehlgeschlagen (HTTP ${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as KlassifikationResult;
}

/**
 * Reicht den Antrag bei der Supabase Edge Function ein.
 * Server erzeugt UUID, INSERT in apl.antrag_einreichung, DB-Trigger → n8n.
 */
export async function einreichen(p: UploadPayload): Promise<UploadResponse> {
  if (!ANON_KEY) {
    throw new Error(
      "Konfigurationsfehler: VITE_SUPABASE_ANON_KEY fehlt beim Build. " +
      "Bitte den Repo-Maintainer informieren.",
    );
  }
  const fd = new FormData();
  fd.append("datei", p.datei);
  if (p.foerderbereich) fd.append("foerderbereich", p.foerderbereich);
  if (p.erkannter_fb) fd.append("erkannter_fb", p.erkannter_fb);
  if (p.variante) fd.append("variante", p.variante);
  if (p.anlage && p.anlage_typ) {
    fd.append("anlage", p.anlage);
    fd.append("anlage_typ", p.anlage_typ);
  }
  const res = await fetch(UPLOAD_ENDPOINT, {
    method: "POST",
    headers: { apikey: ANON_KEY },
    body: fd,
  });
  const data = (await res.json().catch(() => ({}))) as Partial<UploadResponse> & { error?: string };
  if (!res.ok || !data.einreichung_id) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return { einreichung_id: data.einreichung_id, tracking_id: data.tracking_id ?? data.einreichung_id };
}
