/**
 * Loader für die 1:1-Detail-Tabellen pro Förderbereich (FB I-IV).
 *
 * Jeder Loader liefert `null`, wenn kein Detail-Datensatz existiert
 * (PostgREST-Code PGRST116) — ein Antrag KANN zwischen Insert und
 * Detail-Insert kurz „nackt" sein; UI-seitig ist das ein Placeholder
 * statt eines Fehlers.
 */
import { getSupabase } from "./supabase-client";
import type {
  FbIProjekt,
  FbIiEhrenamt,
  FbIiiVarianteRow,
  FbIvFreitext,
} from "./db-types";

async function loadOne<T>(table: string, antrag_id: string): Promise<T | null> {
  const { data, error } = await getSupabase()
    .from(table)
    .select("*")
    .eq("antrag_id", antrag_id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as T;
}

export const getFbIProjekt = (antrag_id: string) =>
  loadOne<FbIProjekt>("fb_i_projekt", antrag_id);
export const getFbIiEhrenamt = (antrag_id: string) =>
  loadOne<FbIiEhrenamt>("fb_ii_ehrenamt", antrag_id);
export const getFbIiiVariante = (antrag_id: string) =>
  loadOne<FbIiiVarianteRow>("fb_iii_variante", antrag_id);
export const getFbIvFreitext = (antrag_id: string) =>
  loadOne<FbIvFreitext>("fb_iv_freitext", antrag_id);

/** Antrag-History aus `apl.antrag_history`, neueste zuerst. */
export async function listHistory(antrag_id: string) {
  const { data, error } = await getSupabase()
    .from("antrag_history")
    .select("*")
    .eq("antrag_id", antrag_id)
    .order("geaendert_am", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
