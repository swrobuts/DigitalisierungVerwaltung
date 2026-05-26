import { getSupabase } from "./supabase-client";
import type {
  Anlage,
  Antrag,
  AntragHistory,
  AntragInbox,
  FbIiEhrenamt,
  FbIiHelfer,
  FbIiiVarianteRow,
  FbIProjekt,
  FbIvFreitext,
  FoerderbereichId,
} from "./db-types";

/**
 * Liste aller Anträge (View `antrag_inbox`), optional gefiltert nach FB.
 * Sortierung: neueste zuerst.
 */
export async function listAntraege(
  opts: { foerderbereich?: FoerderbereichId } = {},
): Promise<AntragInbox[]> {
  let q = getSupabase()
    .from("antrag_inbox")
    .select("*")
    .order("submitted_at", { ascending: false });
  if (opts.foerderbereich) q = q.eq("foerderbereich", opts.foerderbereich);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AntragInbox[];
}

/**
 * Einzelner Antrag aus `antraege` (nicht View — vollständiges Schema).
 * Liefert null statt zu werfen, wenn der Antrag nicht gefunden wurde
 * (PostgREST-Code PGRST116).
 */
export async function getAntrag(id: string): Promise<Antrag | null> {
  const { data, error } = await getSupabase()
    .from("antraege")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as Antrag;
}

/**
 * Bundle eines Antrags inkl. ALLER FB-Detail-Tabellen, Anlagen und
 * History in EINEM PostgREST-Call (Embed via FK).
 *
 * Performance-Hintergrund: Self-hosted Supabase hat ~600ms TTFB pro
 * Request (Kong+Traefik+CORS-Overhead, siehe Migration 058+task #120).
 * 5 sequenzielle/parallele Requests = 1.5–2s wahrgenommene Lade-Zeit.
 * Mit Embed: 1 Request, alles drin. Postgres-JOINs auf dieselbe
 * Connection sind innerhalb der DB sub-millisekündig.
 *
 * FB-Detail-Tabellen werden alle vier embedded — pro FB ist immer nur
 * EINE non-null, die anderen sind leer. Spart Dispatcher-Logik im UI.
 */
export interface AntragBundleRow extends Antrag {
  fb_i_projekt: FbIProjekt | null;
  fb_ii_ehrenamt: FbIiEhrenamt | null;
  fb_ii_helfer: FbIiHelfer[];
  fb_iii_variante: FbIiiVarianteRow | null;
  fb_iv_freitext: FbIvFreitext | null;
  anlagen: Anlage[];
  antrag_history: AntragHistory[];
}

export async function getAntragBundle(id: string): Promise<AntragBundleRow | null> {
  const { data, error } = await getSupabase()
    .from("antraege")
    .select(
      "*," +
        "fb_i_projekt(*)," +
        "fb_ii_ehrenamt(*)," +
        "fb_ii_helfer(*)," +
        "fb_iii_variante(*)," +
        "fb_iv_freitext(*)," +
        "anlagen(*)," +
        "antrag_history(*)",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as unknown as AntragBundleRow;
}

/**
 * Status-Wechsel mit Audit-Trail.
 * Führt UPDATE auf `antraege.status` + INSERT in `antrag_history` aus.
 * Hinweis: Sequenz-Calls, nicht atomar — für Single-Submit-UE2 ausreichend.
 * Wenn der History-Insert fehlschlägt, ist der Status bereits umgesetzt.
 */
export async function changeStatus(
  antrag_id: string,
  nach_status: Antrag["status"],
  kommentar?: string,
): Promise<void> {
  const sb = getSupabase();
  const { error: updateError } = await sb
    .from("antraege")
    .update({ status: nach_status })
    .eq("id", antrag_id);
  if (updateError) throw updateError;

  const { error: histError } = await sb.from("antrag_history").insert({
    antrag_id,
    nach_status,
    kommentar: kommentar ?? null,
    geaendert_von: "ui",
  });
  if (histError) throw histError;
}
