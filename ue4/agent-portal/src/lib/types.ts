/**
 * UE4-Frontend-Typen — mirror der Backend-Responses aus
 * /api/agent/chat (pruefung/src/pruefung/agent_chat.py).
 *
 * Halluzinations-Schutz: FoerderbereichId ist STRIKT auf die vier
 * bekannten FBs eingeschränkt. Wenn das Backend was anderes liefert
 * (sollte nicht passieren — agent_tools.py validiert hart), wird der
 * Wert beim Anzeigen ignoriert (siehe AntragVorschau).
 */

export type FoerderbereichId = "I" | "II" | "III" | "IV";
export type FbIiiVarianteId = "A" | "B" | "C" | "D";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  timestamp: string;
}

export interface AntragstellerBlock {
  einrichtung?: string;
  ansprechpartner?: string;
  strasse?: string;
  hausnummer?: string;
  plz?: string;
  ort?: string;
  telefon?: string;
  email?: string;
  bankname?: string;
  iban?: string;
  bic?: string;
  haushaltsjahr?: string;
}

export interface AntragDraft {
  foerderbereich?: FoerderbereichId;
  fb_iii_variante?: FbIiiVarianteId;
  antragsteller?: AntragstellerBlock;
  fb_specific?: Record<string, string | number | undefined>;
  anlagen?: Array<{ dateiname: string; storage_path: string; anlagentyp: string }>;
  status?: "neu" | "in_progress" | "ready_to_submit" | "submitted";
  antrag_id?: string;
  antragsnummer?: string;
}

export interface ToolTraceEntry {
  name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

export interface AgentChatResponse {
  session_id: string;
  assistant_message: string;
  updated_draft: AntragDraft;
  next_action: string;
  tool_trace: ToolTraceEntry[];
}

export interface AgentSession {
  session_id: string;
  messages: ChatMessage[];
  draft: AntragDraft;
  status: "neu" | "in_progress" | "ready_to_submit" | "submitted";
}
