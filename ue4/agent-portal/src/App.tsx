import { useEffect, useState } from "react";
import { ChatWindow } from "./components/ChatWindow";
import { MessageInput } from "./components/MessageInput";
import { AntragVorschau } from "./components/AntragVorschau";
import { Footer } from "./components/Footer";
import { postAgentChat } from "./lib/agent-api";
import type { AgentSession, ChatMessage } from "./lib/types";
import { loadSession, saveSession, clearSession, newSession } from "./state/session";

/** Ein-Klick-Starter im Empty-State — kürzt der Bürgerin die Tippzeit. */
const STARTER_PROMPTS: Array<{ label: string; text: string }> = [
  {
    label: "Begegnungszentrum",
    text: "Wir möchten ein Begegnungszentrum für ältere Menschen aufbauen — was muss ich tun?",
  },
  {
    label: "Ehrenamt fördern",
    text: "Unser Verein engagiert sich ehrenamtlich für Senioren — gibt es eine Pauschale, die wir beantragen können?",
  },
  {
    label: "Quartiersarbeit",
    text: "Wir planen ein Quartiersmanagement in unserem Stadtteil — welche Fördermöglichkeiten gibt es?",
  },
  {
    label: "Seniorenkreis",
    text: "Wir betreiben einen wöchentlichen Seniorenkreis — können wir dafür Förderung beantragen?",
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

export default function App() {
  const [session, setSession] = useState<AgentSession>(() => loadSession());
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Empty-State = noch kein Turn gelaufen UND der Agent „denkt" auch nicht.
  // Steuert das Layout: Hero (Google-mäßig) vs. Chat (Verlauf + Bar unten).
  const isEmpty = session.messages.length === 0 && !isThinking;

  useEffect(() => {
    saveSession(session);
  }, [session]);

  // `_files` ist Platzhalter für den späteren echten Upload (Multipart
  // ans Backend, Smart-Upload-Pipeline aus Phase 4B nutzen). Heute
  // verlassen wir uns darauf, dass MessageInput die Dateinamen als
  // 📎-Hinweis an die Message-Text gehängt hat — der Agent sieht
  // dadurch zumindest, dass Belege beigelegt sind.
  async function handleSend(text: string, _files?: File[]) {
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
          <div className="flex items-center gap-4">
            {/* Stadtwappen Würzburg — Feder zerstäubt in Pixel
                (visuelle Brücke „klassische Verwaltung → Digitalisierung") */}
            <img
              src="/logo-wue-digital.png"
              alt="Stadt Würzburg · digital"
              className="h-12 w-auto shrink-0"
            />
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
          {isEmpty ? (
            // Empty-State: Google-mäßig prominent. Stadtwappen + Begrüßung
            // + großes Eingabefeld (mit Datei-Upload-Button) vertikal
            // mittig. Darunter Ein-Klick-Starter. Sobald der erste Turn
            // da ist, klappt das Layout in den normalen Chat-Modus
            // (Verlauf oben, schmale Bar unten).
            <div
              data-testid="chat-empty-state"
              className="flex-1 flex items-center justify-center overflow-y-auto p-6"
            >
              <div className="w-full max-w-2xl">
                <div className="text-center mb-8">
                  <img
                    src="/logo-wue-digital.png"
                    alt=""
                    aria-hidden
                    className="h-20 w-auto mx-auto mb-5 opacity-95"
                  />
                  <h2 className="text-3xl font-bold text-wue-grau mb-2 tracking-tight">
                    Hallo, ich bin CIVA.
                  </h2>
                  <p className="text-base text-slate-600 leading-relaxed max-w-xl mx-auto">
                    Beschreiben Sie kurz, was Sie fördern lassen möchten —
                    ich finde den passenden Förderbereich und helfe Ihnen
                    beim Ausfüllen.
                  </p>
                </div>
                <MessageInput
                  onSend={handleSend}
                  disabled={isThinking}
                  variant="hero"
                />
                <div className="mt-5 flex flex-wrap gap-2 justify-center">
                  {STARTER_PROMPTS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleSend(p.text)}
                      disabled={isThinking}
                      data-testid={`starter-${p.label}`}
                      className="text-xs text-slate-600 bg-white border border-slate-200 hover:border-wue-rot/40 hover:text-wue-rot rounded-full px-3.5 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <ChatWindow messages={session.messages} isThinking={isThinking} />
              <MessageInput onSend={handleSend} disabled={isThinking} />
            </>
          )}
        </section>

        {/* Sidebar */}
        <AntragVorschau draft={session.draft} />
      </main>

      <Footer />
    </div>
  );
}
