/**
 * Session-Persistenz in localStorage. Eine Session = eine Antragsfahrt.
 * Reset-Button räumt sauber auf.
 */
import type { AgentSession, ChatMessage, AntragDraft } from "../lib/types";

const STORAGE_KEY = "ue4-agent-session-v1";

function genSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newSession(): AgentSession {
  return {
    session_id: genSessionId(),
    messages: [],
    draft: {},
    status: "neu",
  };
}

export function loadSession(): AgentSession {
  try {
    const raw = typeof localStorage !== "undefined"
      ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return newSession();
    const parsed = JSON.parse(raw) as Partial<AgentSession>;
    if (!parsed.session_id || !Array.isArray(parsed.messages)) {
      return newSession();
    }
    return {
      session_id: parsed.session_id,
      messages: parsed.messages as ChatMessage[],
      draft: (parsed.draft as AntragDraft) ?? {},
      status: parsed.status ?? "neu",
    };
  } catch {
    return newSession();
  }
}

export function saveSession(session: AgentSession): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // localStorage voll oder nicht verfügbar — egal, in-memory reicht
  }
}

export function clearSession(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}
