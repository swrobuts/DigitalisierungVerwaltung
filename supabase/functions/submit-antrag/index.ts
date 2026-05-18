import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = [
  "https://swrobuts.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
];

const ALLOWED_ANLAGE_TYPEN = [
  "mietvertrag",
  "programm-altentagesstaette",
  "anlage-1-kostennachweis",
  "personalkostenbelege",
];

const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 10 * 1024 * 1024;

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(origin), "content-type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "apl2" } },
  );

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(
      { error: "invalid multipart body" },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  const antragRaw = form.get("antrag");
  if (typeof antragRaw !== "string") {
    return Response.json(
      { error: "missing 'antrag' field" },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  let antrag: Record<string, unknown>;
  try {
    antrag = JSON.parse(antragRaw);
  } catch {
    return Response.json(
      { error: "antrag JSON invalid" },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  const ip = req.headers.get("x-real-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? null;
  const userAgent = req.headers.get("user-agent");

  // 1) Insert antraege
  const { data: row, error: insertErr } = await supabase
    .from("antraege")
    .insert({ ...antrag, user_agent: userAgent, ip_address: ip })
    .select("id, antragsnummer")
    .single();

  if (insertErr || !row) {
    return Response.json(
      { error: `db insert failed: ${insertErr?.message ?? "unknown"}` },
      { status: 500, headers: corsHeaders(origin) },
    );
  }

  // 2) Uploads + anlagen-Rows (transaktional: bei Fehler full rollback)
  const fileEntries = [...form.entries()].filter(([k]) => k.startsWith("file__"));
  const uploadedPaths: string[] = [];
  try {
    for (const [key, value] of fileEntries) {
      if (!(value instanceof File)) continue;
      const typ = key.replace(/^file__/, "");
      if (!ALLOWED_ANLAGE_TYPEN.includes(typ)) {
        throw new Error(`invalid anlage typ: ${typ}`);
      }
      if (value.size > MAX_BYTES) {
        throw new Error(`${typ}: file too large (${value.size} bytes)`);
      }
      if (!ALLOWED_MIME.includes(value.type)) {
        throw new Error(`${typ}: mime type not allowed: ${value.type}`);
      }
      const safeName = value.name.replace(/[^\w.\-]/g, "_");
      const path = `${row.id}/${typ}__${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("antragsbelege")
        .upload(path, value, { contentType: value.type, upsert: false });
      if (upErr) throw upErr;
      uploadedPaths.push(path);

      const { error: anlErr } = await supabase.from("anlagen").insert({
        antrag_id: row.id,
        typ,
        dateiname: value.name,
        groesse_bytes: value.size,
        mime_type: value.type,
        storage_path: path,
      });
      if (anlErr) throw anlErr;
    }
  } catch (e) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from("antragsbelege").remove(uploadedPaths);
    }
    await supabase.from("antraege").delete().eq("id", row.id);
    return Response.json(
      { error: `upload failed, rolled back: ${(e as Error).message}` },
      { status: 500, headers: corsHeaders(origin) },
    );
  }

  return Response.json(
    { antragsnummer: row.antragsnummer, id: row.id },
    { status: 200, headers: corsHeaders(origin) },
  );
});
