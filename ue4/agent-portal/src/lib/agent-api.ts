/**
 * Wrapper für POST /api/agent/chat.
 *
 * API-Base ist konfigurierbar via VITE_API_BASE — Default: live-Backend
 * (https://pruefung.butscher.cloud). Für lokale Dev-Modi kann man das
 * im .env auf http://localhost:8000 setzen.
 *
 * Halluzinations-Schutz auf Client-Seite: die Response wird nicht
 * blind durchgereicht — `parseFoerderbereich` und `parseDraft`
 * sanitizen den Server-Output (Defense-in-Depth gegen einen MITM oder
 * eine versehentliche Backend-Regression).
 */

import type {
  AgentChatResponse,
  AntragDraft,
  ChatMessage,
  FbIiiVarianteId,
  FoerderbereichId,
} from "./types";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://pruefung.butscher.cloud";

const ALLOWED_FBS: ReadonlySet<FoerderbereichId> = new Set(["I", "II", "III", "IV"]);
const ALLOWED_VARIANTEN: ReadonlySet<FbIiiVarianteId> = new Set(["A", "B", "C", "D"]);

function parseFoerderbereich(v: unknown): FoerderbereichId | undefined {
  if (typeof v !== "string") return undefined;
  return ALLOWED_FBS.has(v as FoerderbereichId) ? (v as FoerderbereichId) : undefined;
}

function parseVariante(v: unknown): FbIiiVarianteId | undefined {
  if (typeof v !== "string") return undefined;
  return ALLOWED_VARIANTEN.has(v as FbIiiVarianteId)
    ? (v as FbIiiVarianteId)
    : undefined;
}

/**
 * Sanitizer: macht aus einem Server-Draft (unknown) ein typsicheres
 * AntragDraft. Unbekannte Felder werden verworfen — niemals halluzinierte
 * FBs in der UI anzeigen.
 */
export function parseDraft(raw: unknown): AntragDraft {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const draft: AntragDraft = {};

  const fb = parseFoerderbereich(r.foerderbereich);
  if (fb) draft.foerderbereich = fb;
  const variante = parseVariante(r.fb_iii_variante);
  if (variante && fb === "III") draft.fb_iii_variante = variante;

  if (r.antragsteller && typeof r.antragsteller === "object") {
    draft.antragsteller = r.antragsteller as AntragDraft["antragsteller"];
  }
  if (r.fb_specific && typeof r.fb_specific === "object") {
    draft.fb_specific = r.fb_specific as AntragDraft["fb_specific"];
  }
  if (typeof r.antrag_id === "string") draft.antrag_id = r.antrag_id;
  if (typeof r.antragsnummer === "string") draft.antragsnummer = r.antragsnummer;
  // Hand-off-URL nur akzeptieren, wenn sie auf eine erwartete UE1-Domain zeigt
  // (Open-Redirect-Schutz: kein blindes window.location.href = serverseitige URL).
  if (typeof r.webformular_url === "string") {
    try {
      const u = new URL(r.webformular_url);
      const allowedHosts = new Set([
        "antrag.butscher.cloud",
        "swrobuts.github.io",
        "localhost",
      ]);
      if (allowedHosts.has(u.hostname) && u.pathname.includes("/antrag/uebernahme-chat")) {
        draft.webformular_url = r.webformular_url;
      }
    } catch {
      /* ungültige URL → ignorieren */
    }
  }
  if (typeof r.status === "string") {
    const s = r.status;
    if (
      s === "neu" || s === "in_progress" || s === "ready_to_submit" ||
      s === "submitted" || s === "ready_for_handoff"
    ) {
      draft.status = s;
    }
  }
  return draft;
}

export interface ChatCallParams {
  sessionId: string;
  history: ChatMessage[];
  userMessage: string;
  currentDraft: AntragDraft;
  /** UI-Sprache als Hint für den Agent (DE / TR / IT / RU / FR).
   *  Default-Antwortsprache, falls aus dem User-Text die Sprache nicht
   *  eindeutig zu erkennen ist. Der Agent ignoriert das, sobald die
   *  Bürgerin in einer anderen Sprache schreibt. */
  sprache?: string;
  signal?: AbortSignal;
}

export async function postAgentChat(
  params: ChatCallParams,
): Promise<AgentChatResponse> {
  const res = await fetch(`${API_BASE}/api/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: params.sessionId,
      history: params.history,
      user_message: params.userMessage,
      current_draft: params.currentDraft,
      sprache: params.sprache,
    }),
    signal: params.signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Agent-API ${res.status}: ${txt || res.statusText}`);
  }
  const data = (await res.json()) as Partial<AgentChatResponse>;
  return {
    session_id: data.session_id ?? params.sessionId,
    assistant_message:
      typeof data.assistant_message === "string" ? data.assistant_message : "",
    updated_draft: parseDraft(data.updated_draft),
    next_action: typeof data.next_action === "string" ? data.next_action : "",
    tool_trace: Array.isArray(data.tool_trace) ? data.tool_trace : [],
  };
}

export const __TEST__ = { parseDraft, parseFoerderbereich, parseVariante, API_BASE };
