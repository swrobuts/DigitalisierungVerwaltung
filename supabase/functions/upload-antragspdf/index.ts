// upload-antragspdf — UE0 Edge Function (Reifegradstufe 0)
//
// Bürger lädt ein ausgefülltes Original-Antrags-PDF hoch und OPTIONAL
// die Anlage 1 (Wochenplan). Diese Function:
//   1. Validiert (MIME = application/pdf, Größe ≤ 10 MB) für beide Files
//   2. Speichert das/die PDF(s) im Storage-Bucket `antragseingang-pdf`
//   3. Erzeugt einen Tracking-Eintrag in `apl2.antrag_einreichung`
//      (DB-Trigger feuert n8n-Webhook → Claude Vision OCR-Workflow)
//   4. Returns tracking_id (UUID) → Bürger sieht Status-Seite
//
// Erwartetes FormData:
//   - "datei":   Binary (application/pdf, max 10 MB)             ← Pflicht
//   - "anlage_1": Binary (application/pdf, max 10 MB)            ← optional
//                Wochenplan-PDF — OCR extrahiert Öffnungszeiten.
//
// Antwort:
//   { tracking_id: "uuid-…" }  // 200
//   { error: "…" }            // 4xx/5xx

const ALLOWED_ORIGINS = [
  "https://swrobuts.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
];

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = "application/pdf";

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

async function uploadToStorage(
  storagePath: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/antragseingang-pdf/${storagePath}`,
    {
      method: "POST",
      headers: {
        ...SR_HEADERS,
        "Content-Type": contentType,
        "x-upsert": "false",
      },
      body: bytes,
    },
  );
  if (!res.ok) {
    throw new Error(`Storage-Upload fehlgeschlagen (${res.status}): ${await res.text()}`);
  }
}

async function insertEinreichung(
  storagePath: string,
  dateiname: string,
  bytes: number,
  anlage1Path: string | null,
): Promise<string> {
  const body: Record<string, unknown> = {
    storage_path: storagePath,
    dateiname,
    groesse_bytes: bytes,
    status: "wartend",
  };
  // Nur setzen, wenn vorhanden — DB-Default ist NULL.
  if (anlage1Path) body.anlage_1_storage_path = anlage1Path;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/antrag_einreichung`,
    {
      method: "POST",
      headers: {
        ...SR_HEADERS,
        "Content-Type": "application/json",
        "Accept-Profile": "apl2",
        "Content-Profile": "apl2",
        "Prefer": "return=representation",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`Insert antrag_einreichung fehlgeschlagen (${res.status}): ${await res.text()}`);
  }
  const rows = await res.json();
  if (!rows[0]?.id) throw new Error("Insert antrag_einreichung returned no id");
  return rows[0].id;
}

/** Validiert ein optionales File-Field aus FormData.
 *  Returns das File oder null (Feld nicht gesetzt).
 *  Wirft Error mit user-readable Message bei Fehlern. */
function validateOptionalPdf(form: FormData, key: string): File | null {
  const v = form.get(key);
  if (v === null) return null;
  if (!(v instanceof File)) {
    throw new Error(`Feld '${key}' ist keine Datei`);
  }
  // Browser sendet manchmal leere File-Objekte bei nicht-gesetzten Fields
  if (v.size === 0) return null;
  if (v.type !== ALLOWED_MIME) {
    throw new Error(`MIME-Type nicht erlaubt für '${key}': ${v.type}. Erwartet: ${ALLOWED_MIME}`);
  }
  if (v.size > MAX_BYTES) {
    throw new Error(`Datei '${key}' zu groß: ${v.size} Bytes (max ${MAX_BYTES})`);
  }
  return v;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "POST erwartet" }, 405, origin);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "invalid multipart body" }, 400, origin);
  }

  // ── Hauptantrag (Pflicht) ───────────────────────────────────────
  const datei = form.get("datei");
  if (!(datei instanceof File)) {
    return json({ error: "Feld 'datei' fehlt oder ist keine Datei" }, 400, origin);
  }
  if (datei.type !== ALLOWED_MIME) {
    return json(
      { error: `MIME-Type nicht erlaubt: ${datei.type}. Erwartet: ${ALLOWED_MIME}` },
      400, origin,
    );
  }
  if (datei.size > MAX_BYTES) {
    return json(
      { error: `Datei zu groß: ${datei.size} Bytes (max ${MAX_BYTES})` },
      413, origin,
    );
  }
  if (datei.size === 0) {
    return json({ error: "Datei ist leer" }, 400, origin);
  }

  // ── Anlage 1 (optional) ─────────────────────────────────────────
  let anlage1: File | null = null;
  try {
    anlage1 = validateOptionalPdf(form, "anlage_1");
  } catch (e) {
    return json({ error: (e as Error).message }, 400, origin);
  }

  // Storage-Pfade: YYYY/MM/<uuid>.pdf für Hauptantrag,
  // YYYY/MM/<uuid>-anlage1.pdf für Anlage 1 (separater UUID).
  // Verhindert Bucket-Wildwuchs und ist nicht über den Pfad rekonstruierbar.
  const now = new Date();
  const yyyymm = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const mainUuid = crypto.randomUUID();
  const storagePath = `${yyyymm}/${mainUuid}.pdf`;

  let anlage1Path: string | null = null;
  if (anlage1) {
    const anlageUuid = crypto.randomUUID();
    anlage1Path = `${yyyymm}/${anlageUuid}-anlage1.pdf`;
  }

  // Upload Hauptantrag
  const bytes = new Uint8Array(await datei.arrayBuffer());
  try {
    await uploadToStorage(storagePath, bytes, datei.type);
  } catch (e) {
    return json({ error: (e as Error).message }, 500, origin);
  }

  // Upload Anlage 1 (wenn vorhanden) — beste-Effort: wenn dieser zweite
  // Upload fehlschlägt, ist die Anlage weg, aber der Hauptantrag liegt
  // im Bucket. Wir brechen mit 500 ab, damit der Bürger es nochmal versucht.
  if (anlage1 && anlage1Path) {
    try {
      const anlageBytes = new Uint8Array(await anlage1.arrayBuffer());
      await uploadToStorage(anlage1Path, anlageBytes, anlage1.type);
    } catch (e) {
      return json({
        error: `Anlage-1-Upload fehlgeschlagen: ${(e as Error).message}. ` +
               `Bitte erneut versuchen.`,
      }, 500, origin);
    }
  }

  let trackingId: string;
  try {
    trackingId = await insertEinreichung(
      storagePath, datei.name || "antrag.pdf", datei.size, anlage1Path,
    );
  } catch (e) {
    // Storage-Upload war erfolgreich, aber Tracking-Insert nicht — Datei
    // hängt jetzt im Bucket fest. Sollte selten passieren (RLS-Misskonfig).
    return json({
      error: `Tracking-Insert fehlgeschlagen, PDF wurde aber gespeichert: ${(e as Error).message}`,
    }, 500, origin);
  }

  return json({ tracking_id: trackingId }, 200, origin);
});
