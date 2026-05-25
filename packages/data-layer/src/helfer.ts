import { getSupabase } from "./supabase-client";
import type { FbIiHelfer } from "./db-types";

/**
 * Helfer-Liste eines FB II-Antrags, aufsteigend nach `position`.
 */
export async function listHelfer(antrag_id: string): Promise<FbIiHelfer[]> {
  const { data, error } = await getSupabase()
    .from("fb_ii_helfer")
    .select("*")
    .eq("antrag_id", antrag_id)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FbIiHelfer[];
}

/**
 * Helfer-Liste replace-sicher schreiben:
 *   1. alle bisherigen Helfer für den Antrag löschen,
 *   2. die neue Liste mit fortlaufenden Positionen einfügen.
 *
 * Bewusst sequenziell (nicht atomar) — für UE1-Single-Submit ausreichend.
 * Eine atomare Variante würde eine RPC-Funktion in Postgres benötigen.
 */
export async function upsertHelfer(
  antrag_id: string,
  helfer: Omit<FbIiHelfer, "id" | "antrag_id">[],
): Promise<void> {
  const sb = getSupabase();
  const { error: delError } = await sb
    .from("fb_ii_helfer")
    .delete()
    .eq("antrag_id", antrag_id);
  if (delError) throw delError;

  if (helfer.length === 0) return;

  const rows = helfer.map((h, i) => ({
    ...h,
    antrag_id,
    position: h.position ?? i + 1,
  }));
  const { error: insError } = await sb.from("fb_ii_helfer").insert(rows);
  if (insError) throw insError;
}
