import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { ChatWindow } from "./components/ChatWindow";
import { MessageInput } from "./components/MessageInput";
import { AntragVorschau } from "./components/AntragVorschau";
import { Footer } from "./components/Footer";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { postAgentChat } from "./lib/agent-api";
import type { AgentSession, ChatMessage } from "./lib/types";
import { loadSession, saveSession, clearSession, newSession } from "./state/session";
import {
  getSprache,
  SPRACHE_CHANGED_EVENT,
  hinweisUnfertig,
  t,
  type Sprache,
} from "./lib/i18n";

function nowIso(): string {
  return new Date().toISOString();
}

/** Ein-Klick-Starter im Empty-State — i18n-Keys, damit wir je Sprache
 *  unterschiedliche Beispiel-Anliegen formulieren können. */
const STARTER_KEYS: ReadonlyArray<{ id: string; labelKey: string; promptKey: string }> = [
  { id: "begegnung", labelKey: "starter.begegnung", promptKey: "starter.begegnung.prompt" },
  { id: "ehrenamt", labelKey: "starter.ehrenamt", promptKey: "starter.ehrenamt.prompt" },
  { id: "quartier", labelKey: "starter.quartier", promptKey: "starter.quartier.prompt" },
  {
    id: "seniorenkreis",
    labelKey: "starter.seniorenkreis",
    promptKey: "starter.seniorenkreis.prompt",
  },
];

export default function App() {
  const [session, setSession] = useState<AgentSession>(() => loadSession());
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sprach-Reaktivität analog UE1: setSprache() in i18n.ts dispatcht ein
  // CustomEvent → wir bumpen einen Counter, der als React-Key am Root-
  // Div hängt → kompletter Re-Mount, alle t()-Aufrufe lesen frisch.
  const [sprachTick, setSprachTick] = useState(0);

  useEffect(() => {
    function onChange() {
      setSprachTick((n) => n + 1);
    }
    document.addEventListener(SPRACHE_CHANGED_EVENT, onChange);
    return () => document.removeEventListener(SPRACHE_CHANGED_EVENT, onChange);
  }, []);

  const aktuelleSprache: Sprache = getSprache();
  const sprachHinweis = hinweisUnfertig(aktuelleSprache);

  // Empty-State = noch kein Turn gelaufen UND der Agent „denkt" auch nicht.
  const isEmpty = session.messages.length === 0 && !isThinking;

  useEffect(() => {
    saveSession(session);
  }, [session]);

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
        sprache: aktuelleSprache,
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

      // Hand-off ans UE1-Webformular (Open-Redirect-geschützt durch
      // parseDraft in agent-api).
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
    if (!window.confirm(t("meta.reset.confirm"))) return;
    clearSession();
    setSession(newSession());
    setError(null);
  }

  return (
    <div key={sprachTick} className="h-full flex flex-col bg-wue-bg">
      {/* Header — Stadt-Würzburg-Stil. Reset-Button bewusst NICHT mehr
          hier — er sitzt jetzt unter der Eingabe, dort wo Metadaten
          hingehören. Im Header rechts nur noch der Sprach-Picker. */}
      <header className="bg-white border-b border-slate-200 relative">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-wue-rot" />
        <div className="w-full px-4 py-3 flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <img
              src="/logo-wue-digital.png"
              alt="Stadt Würzburg · digital"
              className="h-12 w-auto shrink-0"
            />
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-wue-rot font-semibold">
                {t("header.kommune")}
              </div>
              <h1 className="text-xl font-bold leading-tight">
                {t("header.titel")}
              </h1>
              <p className="text-sm text-slate-500">{t("header.subtitel")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
          </div>
        </div>
        {sprachHinweis && (
          <div className="bg-amber-50 border-t border-amber-200 text-amber-800 text-xs px-4 py-1.5 text-center">
            {sprachHinweis}
          </div>
        )}
      </header>

      {/* Body */}
      <main className="flex-1 flex overflow-hidden">
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
            // Empty-State: Stadtwappen + knappe Begrüßung + großes
            // Eingabefeld vertikal mittig. Darunter Starter-Chips,
            // ganz unten eine dezente Meta-Bar mit „Neues Gespräch"
            // und Session-Kürzel — nicht mehr im Header.
            <div
              data-testid="chat-empty-state"
              className="flex-1 flex items-center justify-center overflow-y-auto p-6"
            >
              <div className="w-full max-w-2xl">
                <div className="text-center mb-8 civa-rise">
                  <img
                    src="/logo-wue-digital.png"
                    alt=""
                    aria-hidden
                    className="h-20 w-auto mx-auto mb-5 opacity-95"
                  />
                  <h2 className="text-3xl font-semibold text-wue-grau mb-2 tracking-tight">
                    {t("hero.greeting")}
                  </h2>
                  <p className="text-base text-slate-600 leading-relaxed max-w-xl mx-auto">
                    {t("hero.subtitle")}
                  </p>
                </div>
                <div className="civa-rise civa-rise-delay-1">
                  <MessageInput
                    onSend={handleSend}
                    disabled={isThinking}
                    variant="hero"
                  />
                </div>
                <div className="mt-5 flex flex-wrap gap-2 justify-center civa-rise civa-rise-delay-2">
                  <span className="text-[11px] text-slate-400 w-full text-center mb-1">
                    {t("hero.examples")}
                  </span>
                  {STARTER_KEYS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSend(t(p.promptKey))}
                      disabled={isThinking}
                      data-testid={`starter-${p.id}`}
                      className="text-xs text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:text-slate-900 hover:-translate-y-px rounded-full px-3.5 py-1.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t(p.labelKey)}
                    </button>
                  ))}
                </div>
                <div className="mt-8 flex items-center justify-center gap-3 text-[11px] text-slate-400 civa-rise civa-rise-delay-3">
                  <button
                    type="button"
                    onClick={handleReset}
                    data-testid="reset-button"
                    className="inline-flex items-center gap-1.5 hover:text-slate-700 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t("meta.reset")}
                  </button>
                  <span className="text-slate-300">·</span>
                  <span className="tabular-nums">
                    {t("meta.session")}: {session.session_id.slice(0, 8)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <ChatWindow messages={session.messages} isThinking={isThinking} />
              <MessageInput onSend={handleSend} disabled={isThinking} />
              {/* Meta-Bar zwischen Input und Footer — Reset + Session
                  bleiben auch im Chat-Modus erreichbar, ohne den Header
                  zu überfrachten. */}
              <div className="border-t border-slate-100 bg-white px-4 py-1.5 flex items-center justify-end gap-3 text-[11px] text-slate-400">
                <button
                  type="button"
                  onClick={handleReset}
                  data-testid="reset-button"
                  className="inline-flex items-center gap-1.5 hover:text-slate-700 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  {t("meta.reset")}
                </button>
                <span className="text-slate-300">·</span>
                <span className="tabular-nums">
                  {t("meta.session")}: {session.session_id.slice(0, 8)}
                </span>
              </div>
            </>
          )}
        </section>

        <AntragVorschau draft={session.draft} />
      </main>

      <Footer />
    </div>
  );
}
