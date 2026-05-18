// submit-antrag — Edge Function (kein 3rd-party-ESM, direkter fetch an Kong)
//
// Architektur: Browser → Traefik (verwaltung.butscher.cloud + PathPrefix-Filter)
//                     → Kong (/functions/v1/submit-antrag)
//                     → Edge Runtime (diese Function)
//                     → fetch zu Kong-intern (http://kong:8000/rest/v1, /storage/v1)
//
// Transaktion: insert antrag → uploads + insert anlagen → bei Fehler full rollback

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SR_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "content-type": "application/json" },
  });
}

async function insertAntrag(payload: Record<string, unknown>): Promise<{id: string, antragsnummer: string}> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/antraege`, {
    method: "POST",
    headers: {
      ...SR_HEADERS,
      "content-type": "application/json",
      "Accept-Profile": "apl2",
      "Content-Profile": "apl2",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`insert antraege failed (${res.status}): ${txt}`);
  }
  const arr = await res.json();
  return arr[0];
}

async function insertAnlage(row: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/anlagen`, {
    method: "POST",
    headers: {
      ...SR_HEADERS,
      "content-type": "application/json",
      "Accept-Profile": "apl2",
      "Content-Profile": "apl2",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`insert anlagen failed (${res.status}): ${await res.text()}`);
  }
}

async function uploadFile(path: string, file: File): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/antragsbelege/${path}`, {
    method: "POST",
    headers: {
      ...SR_HEADERS,
      "content-type": file.type,
      "x-upsert": "false",
    },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`storage upload failed (${res.status}): ${await res.text()}`);
  }
}

async function removeUploads(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await fetch(`${SUPABASE_URL}/storage/v1/object/antragsbelege`, {
    method: "DELETE",
    headers: { ...SR_HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
}

async function deleteAntrag(id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/antraege?id=eq.${id}`, {
    method: "DELETE",
    headers: { ...SR_HEADERS, "Accept-Profile": "apl2" },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405, origin);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "invalid multipart body" }, 400, origin);
  }

  const antragRaw = form.get("antrag");
  if (typeof antragRaw !== "string") {
    return json({ error: "missing 'antrag' field" }, 400, origin);
  }
  let antrag: Record<string, unknown>;
  try {
    antrag = JSON.parse(antragRaw);
  } catch {
    return json({ error: "antrag JSON invalid" }, 400, origin);
  }

  const ip = req.headers.get("x-real-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? null;
  const userAgent = req.headers.get("user-agent");

  // 1) Insert antraege
  let row: { id: string, antragsnummer: string };
  try {
    row = await insertAntrag({ ...antrag, user_agent: userAgent, ip_address: ip });
  } catch (e) {
    return json({ error: (e as Error).message }, 500, origin);
  }

  // 2) Uploads + Anlagen-Rows (transaktional)
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
      await uploadFile(path, value);
      uploadedPaths.push(path);
      await insertAnlage({
        antrag_id: row.id,
        typ,
        dateiname: value.name,
        groesse_bytes: value.size,
        mime_type: value.type,
        storage_path: path,
      });
    }
  } catch (e) {
    await removeUploads(uploadedPaths);
    await deleteAntrag(row.id);
    return json({ error: `upload failed, rolled back: ${(e as Error).message}` }, 500, origin);
  }

  return json({ antragsnummer: row.antragsnummer, id: row.id }, 200, origin);
});
