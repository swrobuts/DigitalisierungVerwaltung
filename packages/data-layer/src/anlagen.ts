import { getSupabase } from "./supabase-client";
import type { Anlage, AnlagenTyp } from "./db-types";

const BUCKET = "antragsbelege";

/**
 * Datei hochladen + Metadaten-Row in `anlagen` schreiben.
 * Storage-Pfad: `<antrag_id>/<typ>/<timestamp>-<dateiname>` (kollisionssicher).
 */
export async function uploadAnlage(
  antrag_id: string,
  file: File | Blob,
  typ: AnlagenTyp,
  dateiname: string,
): Promise<Anlage> {
  const sb = getSupabase();
  const path = `${antrag_id}/${typ}/${Date.now()}-${dateiname}`;
  const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, file);
  if (uploadError) throw uploadError;

  const groesse = file instanceof Blob ? file.size : undefined;
  const { data, error: insError } = await sb
    .from("anlagen")
    .insert({
      antrag_id,
      anlagentyp: typ,
      dateiname,
      storage_path: path,
      groesse_bytes: groesse ?? null,
    })
    .select()
    .single();
  if (insError) throw insError;
  return data as Anlage;
}

/**
 * Anlagen eines Antrags, älteste zuerst.
 */
export async function listAnlagen(antrag_id: string): Promise<Anlage[]> {
  const { data, error } = await getSupabase()
    .from("anlagen")
    .select("*")
    .eq("antrag_id", antrag_id)
    .order("hochgeladen_am", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Anlage[];
}
