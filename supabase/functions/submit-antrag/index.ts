// submit-antrag v3 — Multi-FB Edge Function für UE1 (Schema apl.*).
//
// Pipeline:
//   Browser → Traefik (verwaltung.butscher.cloud + PathPrefix-Filter)
//          → Kong (/functions/v1/submit-antrag)
//          → Edge Runtime (diese Function)
//          → PostgREST (apl.*) + Storage (antragsbelege)
//
// Eingabe (FormData):
//   - "antrag":  JSON-Blob mit Schema (foerderbereich + Antragsteller-Block
//                + FB-spez. Sub-Object + anlagen-Metadaten mit upload_key).
//   - "file_<n>": Binary für jede Anlage (n = Index aus anlagen[].upload_key).
//
// Antwort:
//   200 { antrag_id: "<uuid>", antragsnummer: "<APL-…>" }
//   4xx { error: "<message>" }
//   5xx { error: "<message>" }
//
// Bei Fehlern nach erfolgreichem INSERT in apl.antraege wird der Antrag
// gelöscht — apl.fb_* + apl.anlagen hängen per CASCADE dran und werden
// mit aufgeräumt.

const ALLOWED_ORIGINS = [
  "https://swrobuts.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
];

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
];
const ALLOWED_FB = ["I", "II", "III", "IV"];
const ALLOWED_VARIANTEN = ["A", "B", "C", "D"];
const ALLOWED_TYPEN = [
  "projektskizze", "helferliste", "foerderbestaetigung_bund",
  "programm_flyer", "stundenzettel", "sonstige",
];

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SR_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

// Alle Schreib-/Lese-Calls gegen das apl-Schema müssen PostgREST über die
// Content-/Accept-Profile-Header informieren, sonst landen sie in `public`.
const APL_HEADERS = {
  "Accept-Profile": "apl",
  "Content-Profile": "apl",
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

interface AnlageMeta {
  anlagentyp: string;
  dateiname: string;
  groesse_bytes: number;
  upload_key: string;
}

async function postgrest(
  path: string,
  body: unknown,
  prefer: "return=representation" | "return=minimal" = "return=minimal",
): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      ...SR_HEADERS, ...APL_HEADERS,
      "content-type": "application/json",
      Prefer: prefer,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`PostgREST POST ${path} failed (${res.status}): ${await res.text()}`);
  }
  return prefer === "return=representation" ? res.json() : null;
}

async function deleteAntrag(id: string): Promise<void> {
  // Best-effort Cleanup. apl.fb_* + apl.anlagen hängen per CASCADE.
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/antraege?id=eq.${id}`, {
      method: "DELETE",
      headers: { ...SR_HEADERS, ...APL_HEADERS },
    });
  } catch (e) {
    console.error("rollback delete failed:", e);
  }
}

async function uploadFile(antragId: string, typ: string, file: File): Promise<string> {
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const storagePath = `${antragId}/${typ}/${Date.now()}-${safeName}`;
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/antragsbelege/${storagePath}`,
    {
      method: "POST",
      headers: { ...SR_HEADERS, "content-type": file.type, "x-upsert": "false" },
      body: file,
    },
  );
  if (!res.ok) {
    throw new Error(`storage upload failed (${res.status}): ${await res.text()}`);
  }
  return storagePath;
}

function validateAntragsteller(a: Record<string, unknown>): string | null {
  const required = [
    "foerderbereich", "haushaltsjahr", "einrichtung", "ansprechpartner",
    "strasse", "plz", "ort", "telefon", "email", "bankname", "iban", "bic",
  ];
  for (const k of required) {
    if (a[k] === undefined || a[k] === null || a[k] === "") {
      return `Pflichtfeld fehlt: ${k}`;
    }
  }
  if (!ALLOWED_FB.includes(a.foerderbereich as string)) {
    return `Unbekannter Förderbereich: ${a.foerderbereich}`;
  }
  if (!/^[0-9]{5}$/.test(String(a.plz))) return "PLZ muss 5-stellig sein";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(a.email))) return "Ungültige E-Mail";
  const hh = Number(a.haushaltsjahr);
  if (!Number.isFinite(hh) || hh < 2020 || hh > 2030) {
    return "haushaltsjahr ausserhalb des erlaubten Bereichs";
  }
  return null;
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

  const validationErr = validateAntragsteller(antrag);
  if (validationErr) return json({ error: validationErr }, 400, origin);

  const fb = String(antrag.foerderbereich) as "I" | "II" | "III" | "IV";
  const fbIProjekt = antrag.fb_i_projekt as Record<string, unknown> | undefined;
  const fbIiEhrenamt = antrag.fb_ii_ehrenamt as Record<string, unknown> | undefined;
  const fbIiHelfer = (antrag.fb_ii_helfer as Array<Record<string, unknown>>) ?? [];
  const fbIiiVariante = antrag.fb_iii_variante as Record<string, unknown> | undefined;
  const fbIvFreitext = antrag.fb_iv_freitext as Record<string, unknown> | undefined;
  const anlagenMeta = (antrag.anlagen as AnlageMeta[]) ?? [];

  if (fb === "I" && !fbIProjekt) return json({ error: "fb_i_projekt fehlt für FB I" }, 400, origin);
  if (fb === "II" && !fbIiEhrenamt) return json({ error: "fb_ii_ehrenamt fehlt für FB II" }, 400, origin);
  if (fb === "III") {
    if (!fbIiiVariante) return json({ error: "fb_iii_variante fehlt" }, 400, origin);
    if (!ALLOWED_VARIANTEN.includes(String(fbIiiVariante.variante))) {
      return json({ error: "fb_iii_variante.variante invalid" }, 400, origin);
    }
  }
  if (fb === "IV" && !fbIvFreitext) return json({ error: "fb_iv_freitext fehlt" }, 400, origin);

  // Pre-Check der Anlagen (MIME + Size + Type) bevor wir den Antrag anlegen.
  for (const a of anlagenMeta) {
    if (!ALLOWED_TYPEN.includes(a.anlagentyp)) {
      return json({ error: `Unbekannter Anlagentyp: ${a.anlagentyp}` }, 400, origin);
    }
    const file = form.get(a.upload_key);
    if (!(file instanceof File)) {
      return json({ error: `Datei fehlt: ${a.upload_key}` }, 400, origin);
    }
    if (file.size > MAX_BYTES) {
      return json({ error: `Datei zu groß (max 10 MB): ${a.dateiname}` }, 400, origin);
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return json({ error: `MIME nicht erlaubt: ${file.type}` }, 400, origin);
    }
  }

  // Audit-Felder.
  const ip = req.headers.get("x-real-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? null;
  const userAgent = req.headers.get("user-agent");

  // 1) INSERT apl.antraege
  const antragInsert: Record<string, unknown> = {
    foerderbereich: fb,
    haushaltsjahr: antrag.haushaltsjahr,
    dachverband: antrag.dachverband ?? null,
    einrichtung: antrag.einrichtung,
    ansprechpartner: antrag.ansprechpartner,
    strasse: antrag.strasse,
    hausnummer: antrag.hausnummer ?? null,
    plz: antrag.plz,
    ort: antrag.ort,
    telefon: antrag.telefon,
    email: antrag.email,
    homepage: antrag.homepage ?? null,
    bankname: antrag.bankname,
    iban: antrag.iban,
    bic: antrag.bic,
    submitted_language: antrag.submitted_language ?? "de",
    user_agent: userAgent,
    ip_address: ip,
  };

  let antragRow: { id: string; antragsnummer: string };
  try {
    const rows = await postgrest("antraege", antragInsert, "return=representation") as
      Array<{ id: string; antragsnummer: string }>;
    if (!rows[0]) throw new Error("antraege insert returned no rows");
    antragRow = rows[0];
  } catch (e) {
    return json({ error: (e as Error).message }, 500, origin);
  }

  const antragId = antragRow.id;

  // 2) INSERT FB-spezifische Detail-Tabelle (1:1).
  try {
    if (fb === "I" && fbIProjekt) {
      await postgrest("fb_i_projekt", { antrag_id: antragId, ...fbIProjekt });
    } else if (fb === "II" && fbIiEhrenamt) {
      await postgrest("fb_ii_ehrenamt", { antrag_id: antragId, ...fbIiEhrenamt });
      if (fbIiHelfer.length > 0) {
        await postgrest("fb_ii_helfer", fbIiHelfer.map((h) => ({ ...h, antrag_id: antragId })));
      }
    } else if (fb === "III" && fbIiiVariante) {
      await postgrest("fb_iii_variante", { antrag_id: antragId, ...fbIiiVariante });
    } else if (fb === "IV" && fbIvFreitext) {
      await postgrest("fb_iv_freitext", { antrag_id: antragId, ...fbIvFreitext });
    }
  } catch (e) {
    await deleteAntrag(antragId);
    return json({ error: `FB-Detail insert failed: ${(e as Error).message}` }, 500, origin);
  }

  // 3) Anlagen hochladen + Metadaten in apl.anlagen.
  try {
    for (const a of anlagenMeta) {
      const file = form.get(a.upload_key) as File;
      const storagePath = await uploadFile(antragId, a.anlagentyp, file);
      await postgrest("anlagen", {
        antrag_id: antragId,
        anlagentyp: a.anlagentyp,
        dateiname: a.dateiname,
        storage_path: storagePath,
        groesse_bytes: a.groesse_bytes,
      });
    }
  } catch (e) {
    await deleteAntrag(antragId);
    return json({ error: `Anlagen-Upload failed: ${(e as Error).message}` }, 500, origin);
  }

  return json(
    { antrag_id: antragId, antragsnummer: antragRow.antragsnummer },
    200,
    origin,
  );
});
