// submit-antrag v2 — Edge Function für UE1-v2 (belegezentriertes Stepper-Formular)
//
// Architektur: Browser → Traefik (verwaltung.butscher.cloud + PathPrefix-Filter)
//                     → Kong (/functions/v1/submit-antrag)
//                     → Edge Runtime (diese Function)
//                     → fetch zu Kong-intern (http://kong:8000/rest/v1, /storage/v1)
//
// Erwartetes FormData:
//   - "antrag": JSON-Blob (inkl. oeffnungszeiten[] und belegpositionen[])
//   - "file_<sha256>": Binary für jede in belegpositionen referenzierte file_hash
//   - "flyer": Programm-Flyer (separat)

const ALLOWED_ORIGINS = [
  "https://swrobuts.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
];

const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_BELEGTYPEN = ["betriebskosten", "personalkosten", "miete"];
const ALLOWED_WOCHENTAGE = ["mo", "di", "mi", "do", "fr", "sa", "so"];

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SR_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed!,
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

interface BelegpositionPayload {
  belegtyp: string;
  bezeichnung: string;
  betrag_euro: number;
  file_hash: string | null;
}

interface OeffnungszeitPayload {
  wochentag: string;
  oeffnungszeit: string;
  angebot: string;
}

async function insertAntrag(payload: Record<string, unknown>): Promise<{ id: string; antragsnummer: string }> {
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
  if (!res.ok) throw new Error(`insert antraege failed (${res.status}): ${await res.text()}`);
  const rows = await res.json() as Array<{ id: string; antragsnummer: string }>;
  if (!rows[0]) throw new Error("insert antraege returned no rows");
  return rows[0];
}

async function insertOeffnungszeiten(antragId: string, oz: OeffnungszeitPayload[]): Promise<void> {
  const rows = oz
    .filter((o) => ALLOWED_WOCHENTAGE.includes(o.wochentag))
    .filter((o) => o.oeffnungszeit.trim() || o.angebot.trim())
    .map((o) => ({ antrag_id: antragId, wochentag: o.wochentag, oeffnungszeit: o.oeffnungszeit, angebot: o.angebot }));
  if (rows.length === 0) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/oeffnungszeit`, {
    method: "POST",
    headers: { ...SR_HEADERS, "content-type": "application/json", "Accept-Profile": "apl2", "Content-Profile": "apl2", Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`insert oeffnungszeit failed (${res.status}): ${await res.text()}`);
}

async function insertBelegposition(antragId: string, pos: BelegpositionPayload, anlageId: string | null): Promise<void> {
  if (!ALLOWED_BELEGTYPEN.includes(pos.belegtyp)) {
    throw new Error(`invalid belegtyp: ${pos.belegtyp}`);
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/belegposition`, {
    method: "POST",
    headers: { ...SR_HEADERS, "content-type": "application/json", "Accept-Profile": "apl2", "Content-Profile": "apl2", Prefer: "return=minimal" },
    body: JSON.stringify({
      antrag_id: antragId,
      belegtyp: pos.belegtyp,
      bezeichnung: pos.bezeichnung,
      betrag_euro: pos.betrag_euro,
      anlage_id: anlageId,
    }),
  });
  if (!res.ok) throw new Error(`insert belegposition failed (${res.status}): ${await res.text()}`);
}

async function findAnlageByHash(hash: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/anlagen?file_hash=eq.${hash}&select=id&limit=1`, {
    headers: { ...SR_HEADERS, "Accept-Profile": "apl2" },
  });
  if (!res.ok) return null;
  const rows = await res.json() as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

async function uploadFile(path: string, file: File): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/antragsbelege/${path}`, {
    method: "POST",
    headers: { ...SR_HEADERS, "content-type": file.type, "x-upsert": "false" },
    body: file,
  });
  if (!res.ok) throw new Error(`storage upload failed (${res.status}): ${await res.text()}`);
}

async function insertAnlage(payload: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/anlagen`, {
    method: "POST",
    headers: { ...SR_HEADERS, "content-type": "application/json", "Accept-Profile": "apl2", "Content-Profile": "apl2", Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`insert anlage failed (${res.status}): ${await res.text()}`);
  const rows = await res.json() as Array<{ id: string }>;
  if (!rows[0]) throw new Error("insert anlage returned no rows");
  return rows[0].id;
}

async function ensureAnlage(antragId: string, typ: string, file: File, hash: string): Promise<string> {
  const existing = await findAnlageByHash(hash);
  if (existing) return existing;
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path = `${antragId}/${typ}__${hash.slice(0, 12)}__${safeName}`;
  await uploadFile(path, file);
  return await insertAnlage({
    antrag_id: antragId,
    typ,
    dateiname: file.name,
    groesse_bytes: file.size,
    mime_type: file.type,
    storage_path: path,
    file_hash: hash,
  });
}

async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
  if (typeof antragRaw !== "string") return json({ error: "missing 'antrag' field" }, 400, origin);
  let antrag: Record<string, unknown>;
  try {
    antrag = JSON.parse(antragRaw);
  } catch {
    return json({ error: "antrag JSON invalid" }, 400, origin);
  }

  const oeffnungszeiten = (antrag.oeffnungszeiten as OeffnungszeitPayload[]) ?? [];
  const belegpositionen = (antrag.belegpositionen as BelegpositionPayload[]) ?? [];
  // antraege-Insert ohne die Listen (die landen in eigenen Tabellen)
  const antragForInsert: Record<string, unknown> = { ...antrag };
  delete antragForInsert.oeffnungszeiten;
  delete antragForInsert.belegpositionen;

  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent");
  antragForInsert.user_agent = userAgent;
  antragForInsert.ip_address = ip;

  // 1) Insert antrag
  let row: { id: string; antragsnummer: string };
  try {
    row = await insertAntrag(antragForInsert);
  } catch (e) {
    return json({ error: (e as Error).message }, 500, origin);
  }

  // 2) Wochenplan
  try {
    await insertOeffnungszeiten(row.id, oeffnungszeiten);
  } catch (e) {
    await deleteAntrag(row.id);
    return json({ error: `oeffnungszeit insert failed, rolled back: ${(e as Error).message}` }, 500, origin);
  }

  // 3) Belegpositionen + Files (Hash-Dedupe)
  try {
    for (const pos of belegpositionen) {
      let anlageId: string | null = null;
      if (pos.file_hash) {
        const file = form.get(`file_${pos.file_hash}`);
        if (file instanceof File) {
          if (file.size > MAX_BYTES) throw new Error(`file > 10 MB: ${file.name}`);
          if (!ALLOWED_MIME.includes(file.type)) throw new Error(`mime not allowed: ${file.type}`);
          anlageId = await ensureAnlage(row.id, pos.belegtyp, file, pos.file_hash);
        }
      }
      await insertBelegposition(row.id, pos, anlageId);
    }
  } catch (e) {
    await deleteAntrag(row.id);
    return json({ error: `belegposition failed, rolled back: ${(e as Error).message}` }, 500, origin);
  }

  // 4) Programm-Flyer
  try {
    const flyer = form.get("flyer");
    if (flyer instanceof File) {
      if (flyer.size > MAX_BYTES) throw new Error(`flyer > 10 MB`);
      if (!ALLOWED_MIME.includes(flyer.type)) throw new Error(`flyer mime: ${flyer.type}`);
      const flyerHash = await sha256Hex(flyer);
      await ensureAnlage(row.id, "programm-altentagesstaette", flyer, flyerHash);
    }
  } catch (e) {
    await deleteAntrag(row.id);
    return json({ error: `flyer upload failed, rolled back: ${(e as Error).message}` }, 500, origin);
  }

  return json({ antragsnummer: row.antragsnummer, id: row.id }, 200, origin);
});
