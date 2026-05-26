import { getSupabase } from "./supabase-client";
import type {
  Anlage,
  Antrag,
  AntragHistory,
  AntragInbox,
  FbIiEhrenamt,
  FbIiHelfer,
  FbIiiVarianteRow,
  FbIProjekt,
  FbIvFreitext,
  FoerderbereichId,
} from "./db-types";

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
 * Bundle eines Antrags inkl. ALLER FB-Detail-Tabellen, Anlagen und
 * History in EINEM PostgREST-Call (Embed via FK).
 *
 * Performance-Hintergrund: Self-hosted Supabase hat ~600ms TTFB pro
 * Request (Kong+Traefik+CORS-Overhead, siehe Migration 058+task #120).
 * 5 sequenzielle/parallele Requests = 1.5–2s wahrgenommene Lade-Zeit.
 * Mit Embed: 1 Request, alles drin. Postgres-JOINs auf dieselbe
 * Connection sind innerhalb der DB sub-millisekündig.
 *
 * FB-Detail-Tabellen werden alle vier embedded — pro FB ist immer nur
 * EINE non-null, die anderen sind leer. Spart Dispatcher-Logik im UI.
 */
export interface AntragBundleRow extends Antrag {
  fb_i_projekt: FbIProjekt | null;
  fb_ii_ehrenamt: FbIiEhrenamt | null;
  fb_ii_helfer: FbIiHelfer[];
  fb_iii_variante: FbIiiVarianteRow | null;
  fb_iv_freitext: FbIvFreitext | null;
  anlagen: Anlage[];
  antrag_history: AntragHistory[];
}

// ── In-Memory-Cache für Hover-Prefetch ────────────────────────────
//
// Beim Mouseover auf eine Inbox-Zeile wird `prefetchAntragBundle(id)`
// gefeuert; bis der User klickt (typisch 200-1500 ms) liegt das Bundle
// schon im Cache und der eigentliche Aufruf gibt sofort zurück.
//
// TTL bewusst kurz (30 s): Wir wollen Hover-zu-Click-Race abfangen, NICHT
// Antragsdaten verteilt cachen — Frische ist wichtiger als Hit-Rate.

interface CacheEntry {
  promise: Promise<AntragBundleRow | null>;
  expiresAt: number;
}
const _bundleCache = new Map<string, CacheEntry>();
const PREFETCH_TTL_MS = 30_000;

async function _fetchBundle(id: string): Promise<AntragBundleRow | null> {
  const { data, error } = await getSupabase()
    .from("antraege")
    .select(
      "*," +
        "fb_i_projekt(*)," +
        "fb_ii_ehrenamt(*)," +
        "fb_ii_helfer(*)," +
        "fb_iii_variante(*)," +
        "fb_iv_freitext(*)," +
        "anlagen(*)," +
        "antrag_history(*)",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as unknown as AntragBundleRow;
}

/**
 * Lädt das Antrags-Bundle. Cache-aware: wenn `prefetchAntragBundle(id)`
 * kürzlich (innerhalb TTL) gefeuert wurde, gibt der Promise sofort den
 * Cache-Treffer zurück. Sonst startet er einen neuen Call und cached
 * ihn.
 */
export async function getAntragBundle(id: string): Promise<AntragBundleRow | null> {
  const now = Date.now();
  const cached = _bundleCache.get(id);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }
  const promise = _fetchBundle(id);
  _bundleCache.set(id, { promise, expiresAt: now + PREFETCH_TTL_MS });
  // Bei Fehlschlag den Cache räumen, damit der nächste Versuch frisch geht
  promise.catch(() => _bundleCache.delete(id));
  return promise;
}

/**
 * Hover/Focus-Prefetch: feuert den Bundle-Call im Hintergrund (fire-and-
 * forget). Beim späteren `getAntragBundle(id)` ist die Antwort schon im
 * Cache — gefühlte Latenz fällt von ~600 ms auf <50 ms.
 *
 * Idempotent: mehrfache Aufrufe innerhalb TTL teilen denselben Promise.
 */
export function prefetchAntragBundle(id: string): void {
  const now = Date.now();
  const cached = _bundleCache.get(id);
  if (cached && cached.expiresAt > now) return; // schon vorgeladen
  const promise = _fetchBundle(id);
  _bundleCache.set(id, { promise, expiresAt: now + PREFETCH_TTL_MS });
  promise.catch(() => _bundleCache.delete(id));
}

/** Cache leeren (z.B. nach Status-Wechsel, damit Reload echte Daten holt). */
export function invalidateAntragBundle(id: string): void {
  _bundleCache.delete(id);
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
  // Frisch geänderter Antrag → Hover-Cache invalidieren, sonst zeigt
  // der nächste getAntragBundle-Call den alten Status.
  invalidateAntragBundle(antrag_id);
}
