import { getSupabase } from "./supabase-client";
import type { Antrag, AntragInbox, FoerderbereichId } from "./db-types";

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
