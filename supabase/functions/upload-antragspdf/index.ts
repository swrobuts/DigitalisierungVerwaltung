// upload-antragspdf — UE0 Edge Function (Reifegradstufe 0, Multi-FB)
//
// Bürger lädt ein ausgefülltes Original-Antrags-PDF + optionale FB-spezifische
// Anlage hoch. Seit Plan 2026-05-25 (Phase 4) bedient diese Function ALLE
// vier Förderbereiche und den Smart-Upload-Fall (FB-Erkennung im Frontend).
//
// Diese Function:
//   1. Validiert (MIME = application/pdf | xlsx für FB-II-Helferliste,
//      Größe ≤ 10 MB) für Hauptantrag + Anlage
//   2. Speichert die Files im Storage-Bucket `antragseingang-pdf`
//   3. Erzeugt einen Tracking-Eintrag in `apl.antrag_einreichung`
//      (DB-Trigger feuert n8n-Webhook → Claude Vision OCR-Workflow)
//   4. Returns einreichung_id (UUID) → Bürger sieht Status-Seite
//
// Erwartetes FormData:
//   - "datei":          Binary (application/pdf, max 10 MB)        ← Pflicht
//   - "anlage":         Binary (PDF oder XLSX, max 10 MB)          ← optional
//   - "foerderbereich": "I" | "II" | "III" | "IV" | leer           ← optional
//                       Bei FB-Wahl gesetzt, bei Smart-Upload nur dann,
//                       wenn das Frontend bereits klassifiziert hat.
//   - "erkannter_fb":   "I" | "II" | "III" | "IV" | leer           ← optional
//                       Smart-Upload: vom Frontend-Klassifizierer gefüllt.
//                       n8n darf nachträglich überschreiben.
//   - "variante":       "A" | "B" | "C" | "D" | leer (nur FB III)  ← optional
//   - "anlage_typ":     Slot-Typ aus @dv/foerderbereiche, z.B.
//                       "projektskizze"|"helferliste"|"foerderbestaetigung_bund"
//                       |"programm_flyer"|"stundenzettel"|"sonstige"
//
// Antwort:
//   { einreichung_id: "uuid-…", tracking_id: "uuid-…" }   // 200
//     (tracking_id ist Alias für Rückwärtskompatibilität mit altem Frontend.)
//   { error: "…" }                                        // 4xx/5xx

const ALLOWED_ORIGINS = [
  "https://swrobuts.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:5174",
];

const MAX_BYTES = 10 * 1024 * 1024;
const PDF_MIME = "application/pdf";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ALLOWED_ANLAGE_MIME = new Set([PDF_MIME, XLSX_MIME]);

const VALID_FBS = new Set(["I", "II", "III", "IV"]);
const VALID_VARIANTEN = new Set(["A", "B", "C", "D"]);
const VALID_ANLAGE_TYPEN = new Set([
  "projektskizze",
  "helferliste",
  "foerderbestaetigung_bund",
  "programm_flyer",
  "stundenzettel",
  "sonstige",
]);

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

interface AnlageInitial {
  slot_typ: string;
  storage_path: string;
  dateiname: string;
  groesse_bytes: number;
  mime: string;
}

interface InsertArgs {
  storagePath: string;
  dateiname: string;
  bytes: number;
  erkannterFb: string | null;
  variante: string | null;
  anlage: AnlageInitial | null;
}

async function insertEinreichung(args: InsertArgs): Promise<string> {
  // Initial-State für extrahiert_jsonb: enthält Frontend-Hinweise (Variante,
  // Anlagen-Metadaten). n8n überschreibt das jsonb beim Persist mit den
  // OCR-Ergebnissen, mergt aber Anlagen-Pfade hinein.
  const extrahiert: Record<string, unknown> = {};
  if (args.variante) extrahiert.variante = args.variante;
  if (args.anlage) extrahiert.anlagen = [args.anlage];

  const body: Record<string, unknown> = {
    storage_path: args.storagePath,
    dateiname: args.dateiname,
    groesse_bytes: args.bytes,
    status: "wartend",
  };
  if (args.erkannterFb) body.erkannter_fb = args.erkannterFb;
  if (Object.keys(extrahiert).length > 0) body.extrahiert_jsonb = extrahiert;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/antrag_einreichung`,
    {
      method: "POST",
      headers: {
        ...SR_HEADERS,
        "Content-Type": "application/json",
        "Accept-Profile": "apl",
        "Content-Profile": "apl",
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

function stripOrNull(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Validiert ein optionales Anlage-Datei-Field aus FormData.
 *  Returns das File oder null (Feld nicht gesetzt / leer).
 *  Wirft Error mit user-readable Message bei Fehlern. */
function validateOptionalAnlage(form: FormData, key: string): File | null {
  const v = form.get(key);
  if (v === null) return null;
  if (!(v instanceof File)) {
    throw new Error(`Feld '${key}' ist keine Datei`);
  }
  if (v.size === 0) return null;
  if (!ALLOWED_ANLAGE_MIME.has(v.type)) {
    throw new Error(
      `MIME-Type nicht erlaubt für '${key}': ${v.type}. ` +
      `Erlaubt: ${[...ALLOWED_ANLAGE_MIME].join(", ")}`,
    );
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

  // ── Hauptantrag (Pflicht, immer PDF) ────────────────────────────
  const datei = form.get("datei");
  if (!(datei instanceof File)) {
    return json({ error: "Feld 'datei' fehlt oder ist keine Datei" }, 400, origin);
  }
  if (datei.type !== PDF_MIME) {
    return json(
      { error: `MIME-Type nicht erlaubt: ${datei.type}. Erwartet: ${PDF_MIME}` },
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

  // ── FB-Felder (optional, aber validiert wenn gesetzt) ───────────
  const foerderbereich = stripOrNull(form, "foerderbereich");
  const erkannterFbField = stripOrNull(form, "erkannter_fb");
  const variante = stripOrNull(form, "variante");
  const anlageTyp = stripOrNull(form, "anlage_typ");

  // Beide FB-Felder werden in DB-Spalte `erkannter_fb` gemerged: explizite
  // Wahl (foerderbereich) hat Vorrang, sonst Klassifizierer (erkannter_fb).
  const fbToStore = foerderbereich ?? erkannterFbField;
  if (fbToStore && !VALID_FBS.has(fbToStore)) {
    return json({ error: `Ungültiger Förderbereich: ${fbToStore}` }, 400, origin);
  }
  if (variante && !VALID_VARIANTEN.has(variante)) {
    return json({ error: `Ungültige Variante: ${variante}` }, 400, origin);
  }
  if (variante && fbToStore && fbToStore !== "III") {
    return json(
      { error: `Variante darf nur für FB III gesetzt sein (gewählt: ${fbToStore})` },
      400, origin,
    );
  }
  if (anlageTyp && !VALID_ANLAGE_TYPEN.has(anlageTyp)) {
    return json({ error: `Ungültiger Anlage-Typ: ${anlageTyp}` }, 400, origin);
  }

  // ── Anlage (optional, PDF oder XLSX) ────────────────────────────
  let anlageFile: File | null;
  try {
    anlageFile = validateOptionalAnlage(form, "anlage");
  } catch (e) {
    return json({ error: (e as Error).message }, 400, origin);
  }
  if (anlageFile && !anlageTyp) {
    return json(
      { error: "Wenn 'anlage' gesendet wird, muss 'anlage_typ' angegeben sein" },
      400, origin,
    );
  }

  // Storage-Pfade: YYYY/MM/<uuid>.pdf — nicht über den Pfad rekonstruierbar.
  const now = new Date();
  const yyyymm = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const mainUuid = crypto.randomUUID();
  const storagePath = `${yyyymm}/${mainUuid}.pdf`;

  // Upload Hauptantrag
  const bytes = new Uint8Array(await datei.arrayBuffer());
  try {
    await uploadToStorage(storagePath, bytes, datei.type);
  } catch (e) {
    return json({ error: (e as Error).message }, 500, origin);
  }

  // Upload Anlage (wenn vorhanden) — bricht mit 500 ab bei Fehler.
  let anlageInitial: AnlageInitial | null = null;
  if (anlageFile && anlageTyp) {
    const anlageUuid = crypto.randomUUID();
    const ext = anlageFile.type === XLSX_MIME ? "xlsx" : "pdf";
    const anlagePath = `${yyyymm}/${anlageUuid}-anlage.${ext}`;
    try {
      const anlageBytes = new Uint8Array(await anlageFile.arrayBuffer());
      await uploadToStorage(anlagePath, anlageBytes, anlageFile.type);
    } catch (e) {
      return json({
        error: `Anlage-Upload fehlgeschlagen: ${(e as Error).message}. Bitte erneut versuchen.`,
      }, 500, origin);
    }
    anlageInitial = {
      slot_typ: anlageTyp,
      storage_path: anlagePath,
      dateiname: anlageFile.name || `anlage.${ext}`,
      groesse_bytes: anlageFile.size,
      mime: anlageFile.type,
    };
  }

  let einreichungId: string;
  try {
    einreichungId = await insertEinreichung({
      storagePath,
      dateiname: datei.name || "antrag.pdf",
      bytes: datei.size,
      erkannterFb: fbToStore,
      variante,
      anlage: anlageInitial,
    });
  } catch (e) {
    return json({
      error: `Tracking-Insert fehlgeschlagen, PDF wurde aber gespeichert: ${(e as Error).message}`,
    }, 500, origin);
  }

  // tracking_id ist Alias für alte Clients — Multi-FB-Frontend nutzt einreichung_id.
  return json({ einreichung_id: einreichungId, tracking_id: einreichungId }, 200, origin);
});
