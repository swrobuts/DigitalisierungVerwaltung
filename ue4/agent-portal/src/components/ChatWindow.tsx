import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../lib/types";

interface Props {
  messages: ChatMessage[];
  isThinking: boolean;
}

/**
 * Chat-Verlauf mit Auto-Scroll. Bubble-Style: User rechts (wue-rot),
 * Assistant links (weißer Bubble mit dünnem Rand).
 */
export function ChatWindow({ messages, isThinking }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isThinking]);

  if (messages.length === 0 && !isThinking) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div
            data-testid="chat-empty-state"
            className="text-5xl mb-4"
            aria-hidden
          >
            ◉
          </div>
          <h2 className="text-xl font-semibold text-wue-grau mb-2">
            Hallo! Ich bin Anna.
          </h2>
          <p className="text-slate-600">
            Beschreiben Sie kurz, was Sie fördern lassen möchten — ich
            helfe Ihnen, den passenden Förderbereich zu finden und den
            Antrag auszufüllen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="chat-window"
      className="flex-1 overflow-y-auto chat-scroll p-4 space-y-3"
    >
      {messages.map((m, i) => (
        <MessageBubble key={`${m.timestamp}-${i}`} message={m} />
      ))}
      {isThinking && <ThinkingBubble />}
      <div ref={endRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      data-testid={`bubble-${message.role}`}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={
          isUser
            ? "max-w-[78%] px-4 py-2 rounded-2xl rounded-br-sm bg-wue-rot text-white shadow-sm"
            : "max-w-[78%] px-4 py-2 rounded-2xl rounded-bl-sm bg-white border border-slate-200 text-slate-800 shadow-sm"
        }
      >
        {!isUser && (
          <div className="text-[11px] font-semibold text-wue-rot mb-0.5">
            Anna · Sozialamt-Assistent
          </div>
        )}
        <div className="whitespace-pre-wrap leading-relaxed text-[15px]">
          {message.content}
        </div>
      </div>
    </div>
  );
}

/**
 * Spinner mit Sekunden-Counter und progressiv genauerem Status-Text.
 *
 * Hintergrund: ein Block-Turn (z.B. „validiere alle 13 Pflichtfelder")
 * dauert 20–30s, weil der Agent mehrere Tool-Iterationen parallel
 * ausführt (Klassifikation + Pflichtfelder-Lookup + N×validate_field +
 * finale Text-Antwort). Ohne sichtbares Lebenszeichen wirkt das wie
 * „die App hängt" — deshalb live counter + erklärender Subtext.
 */
function ThinkingBubble() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, []);

  // Progressiv genauerer Subtext, damit der User weiß: wir arbeiten
  // wirklich, das dauert manchmal — kein Hänger.
  let subtext = "";
  if (seconds >= 25) subtext = "Letzter Schliff — bin gleich fertig.";
  else if (seconds >= 12) subtext = "Validiere Ihre Angaben mit den Förderregeln …";
  else if (seconds >= 4) subtext = "Anna verarbeitet Ihre Eingabe …";

  return (
    <div data-testid="thinking-bubble" className="flex justify-start">
      <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white border border-slate-200 shadow-sm max-w-md">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-wue-rot/60 animate-bounce" />
          <span
            className="w-2 h-2 rounded-full bg-wue-rot/60 animate-bounce"
            style={{ animationDelay: "0.15s" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-wue-rot/60 animate-bounce"
            style={{ animationDelay: "0.3s" }}
          />
          <span className="ml-2 text-sm text-slate-500">
            Anna denkt nach …{" "}
            <span className="tabular-nums text-slate-400">({seconds}s)</span>
          </span>
        </div>
        {subtext && (
          <div className="mt-1 text-xs text-slate-400 pl-1">{subtext}</div>
        )}
      </div>
    </div>
  );
}
