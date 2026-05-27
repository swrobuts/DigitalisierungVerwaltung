import { useEffect, useState } from "react";
import { ChatWindow } from "./components/ChatWindow";
import { MessageInput } from "./components/MessageInput";
import { AntragVorschau } from "./components/AntragVorschau";
import { postAgentChat } from "./lib/agent-api";
import type { AgentSession, ChatMessage } from "./lib/types";
import { loadSession, saveSession, clearSession, newSession } from "./state/session";

function nowIso(): string {
  return new Date().toISOString();
}

export default function App() {
  const [session, setSession] = useState<AgentSession>(() => loadSession());
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    saveSession(session);
  }, [session]);

  async function handleSend(text: string) {
    setError(null);
    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: nowIso(),
    };
    const nextMessages = [...session.messages, userMsg];
    setSession((s) => ({ ...s, messages: nextMessages, status: "in_progress" }));
    setIsThinking(true);

    try {
      const res = await postAgentChat({
        sessionId: session.session_id,
        history: nextMessages,
        userMessage: text,
        currentDraft: session.draft,
      });
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.assistant_message,
        timestamp: nowIso(),
      };
      setSession((s) => ({
        ...s,
        messages: [...nextMessages, assistantMsg],
        draft: { ...s.draft, ...res.updated_draft },
        status:
          res.updated_draft.status === "submitted"
            ? "submitted"
            : res.next_action === "ready_to_submit"
              ? "ready_to_submit"
              : "in_progress",
      }));

      // Hand-off ans UE1-Webformular: wenn der Agent das tool
      // `bereite_uebernahme_vor` aufgerufen hat, liefert das Backend eine
      // bereits validierte (Open-Redirect-geschützte) webformular_url. Der
      // Bürger sieht kurz die Abschiedsnachricht des Agenten und wird dann
      // automatisch zum vorausgefüllten UE1-Formular weitergeleitet.
      if (
        res.next_action === "ready_for_handoff" &&
        res.updated_draft.webformular_url
      ) {
        const url = res.updated_draft.webformular_url;
        setTimeout(() => {
          window.location.href = url;
        }, 2500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsThinking(false);
    }
  }

  function handleReset() {
    if (!window.confirm("Aktuelles Gespräch wirklich verwerfen?")) return;
    clearSession();
    setSession(newSession());
    setError(null);
  }

  return (
    <div className="h-full flex flex-col bg-wue-bg">
      {/* Header — angeglichen an UE0/UE1/UE2/UE3-Look (roter Stripe + Stadt-Untertitel) */}
      <header className="bg-white border-b border-slate-200 relative">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-wue-rot" />
        <div className="w-full px-4 py-3 flex items-center justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-wue-rot font-semibold">
              Stadt Würzburg · Sozialreferat
            </div>
            <h1 className="text-xl font-bold leading-tight">
              CIVA — KI-Antrags-Assistent
            </h1>
            <p className="text-sm text-slate-500">
              Konversationelle Antragstellung (Reifegrad 4)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden sm:inline">
              Session: {session.session_id.slice(0, 8)}…
            </span>
            <button
              type="button"
              onClick={handleReset}
              data-testid="reset-button"
              className="text-sm text-wue-rot hover:text-wue-rot-dark border border-wue-rot/30 hover:bg-wue-rot-soft rounded-md px-3 py-1.5 transition-colors"
            >
              Neu starten
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 flex overflow-hidden">
        {/* Chat-Spalte */}
        <section className="flex-1 flex flex-col">
          {error && (
            <div
              data-testid="error-banner"
              className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700"
            >
              Fehler: {error}
            </div>
          )}
          <ChatWindow messages={session.messages} isThinking={isThinking} />
          <MessageInput onSend={handleSend} disabled={isThinking} />
        </section>

        {/* Sidebar */}
        <AntragVorschau draft={session.draft} />
      </main>
    </div>
  );
}
