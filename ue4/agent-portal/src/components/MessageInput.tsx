import { useState, type KeyboardEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder?: string;
}

/**
 * Multi-Line-Input mit Enter zum Senden (Shift+Enter = Newline).
 * Disabled während der Agent denkt — wir wollen keine Double-Submits.
 */
export function MessageInput({ onSend, disabled, placeholder }: Props) {
  const [value, setValue] = useState("");

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-slate-200 bg-white p-3">
      <div className="flex gap-2 items-end max-w-4xl mx-auto">
        <textarea
          data-testid="message-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={disabled}
          placeholder={
            placeholder ?? "Ihre Nachricht … (Enter zum Senden, Shift+Enter für neue Zeile)"
          }
          className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-[15px] focus:outline-none focus:border-wue-rot focus:ring-1 focus:ring-wue-rot disabled:bg-slate-100 disabled:text-slate-400"
        />
        <button
          data-testid="send-button"
          type="button"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="rounded-lg bg-wue-rot text-white px-5 py-2 font-semibold hover:bg-wue-rot-dark disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          Senden
        </button>
      </div>
    </div>
  );
}
