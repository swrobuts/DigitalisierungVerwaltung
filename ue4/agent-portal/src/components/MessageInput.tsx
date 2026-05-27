import { useRef, useState, type KeyboardEvent } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { t } from "../lib/i18n";

interface Props {
  onSend: (text: string, files?: File[]) => void;
  disabled: boolean;
  placeholder?: string;
  /**
   * `default` — schmale Bar am unteren Rand (Chat-Verlauf-Modus).
   * `hero`    — prominent zentriert, Google-mäßig, für den Empty-State.
   *             Größeres Eingabefeld, integrierte Toolbar mit Paperclip
   *             links und Send-Button rechts. Dezente Hover-/Focus-
   *             Animation per `civa-hero-input` — KEINE rote Border,
   *             damit das Feld nicht aktiviert wirkt.
   */
  variant?: "default" | "hero";
}

const ACCEPTED_TYPES = ".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function MessageInput({
  onSend,
  disabled,
  placeholder,
  variant = "default",
}: Props) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSend() {
    const trimmed = value.trim();
    if ((!trimmed && files.length === 0) || disabled) return;

    let composed = trimmed;
    if (files.length > 0) {
      const list = files
        .map((f) => `📎 ${f.name} (${formatBytes(f.size)})`)
        .join("\n");
      composed = composed ? `${composed}\n\n${list}` : list;
    }

    onSend(composed, files.length > 0 ? files : undefined);
    setValue("");
    setFiles([]);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFiles(picked: FileList | null) {
    if (!picked) return;
    const accepted: File[] = [];
    for (const f of Array.from(picked)) {
      if (f.size > MAX_FILE_BYTES) {
        alert(
          `„${f.name}" ist ${formatBytes(f.size)} groß — Limit sind 10 MB pro Datei.`,
        );
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  const canSend = (!!value.trim() || files.length > 0) && !disabled;

  if (variant === "hero") {
    return (
      <div className="w-full">
        <div className="civa-hero-input rounded-2xl border border-slate-200 bg-white">
          {files.length > 0 && (
            <FileChipBar files={files} onRemove={removeFile} />
          )}
          <textarea
            data-testid="message-input"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            disabled={disabled}
            placeholder={placeholder ?? t("hero.placeholder")}
            className="w-full resize-none rounded-t-2xl bg-transparent px-5 pt-4 pb-2 text-[16px] leading-relaxed focus:outline-none disabled:bg-slate-50 disabled:text-slate-400 placeholder:text-slate-400"
          />
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100">
            <div className="flex items-center gap-1">
              <ToolButton
                title={t("hero.attach.hint")}
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
              >
                <Paperclip className="w-4 h-4" />
                <span className="text-xs">{t("hero.attach")}</span>
              </ToolButton>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                {t("input.helper")}
              </span>
              <button
                data-testid="send-button"
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="rounded-lg bg-slate-900 text-white pl-4 pr-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all duration-200 inline-flex items-center gap-1.5 enabled:hover:translate-y-[-1px] enabled:hover:shadow-md"
                aria-label={t("hero.send")}
              >
                {t("hero.send")}
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default — schmale Bar am unteren Rand für den Chat-Verlauf-Modus.
  return (
    <div className="border-t border-slate-200 bg-white p-3">
      <div className="max-w-4xl mx-auto">
        {files.length > 0 && (
          <div className="mb-2">
            <FileChipBar files={files} onRemove={removeFile} compact />
          </div>
        )}
        <div className="flex gap-2 items-end">
          <ToolButton
            title={t("hero.attach.hint")}
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            iconOnly
          >
            <Paperclip className="w-4 h-4" />
          </ToolButton>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <textarea
            data-testid="message-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={disabled}
            placeholder={placeholder ?? t("input.placeholder")}
            className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-[15px] focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-400 transition-colors"
          />
          <button
            data-testid="send-button"
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="rounded-lg bg-slate-900 text-white px-5 py-2 font-medium hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {t("hero.send")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  title,
  onClick,
  disabled,
  iconOnly,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled: boolean;
  iconOnly?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        iconOnly
          ? "rounded-lg border border-slate-300 text-slate-500 hover:text-slate-900 hover:border-slate-400 disabled:text-slate-300 disabled:border-slate-200 disabled:cursor-not-allowed p-2 transition-colors"
          : "rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:text-slate-300 disabled:cursor-not-allowed px-2 py-1.5 inline-flex items-center gap-1.5 transition-colors"
      }
    >
      {children}
    </button>
  );
}

function FileChipBar({
  files,
  onRemove,
  compact,
}: {
  files: File[];
  onRemove: (i: number) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex flex-wrap gap-1.5"
          : "flex flex-wrap gap-1.5 px-4 pt-3"
      }
      data-testid="attached-files"
    >
      {files.map((f, i) => (
        <span
          key={`${f.name}-${i}`}
          className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 text-xs rounded-full pl-2.5 pr-1 py-1 max-w-[16rem]"
          title={`${f.name} · ${formatBytes(f.size)}`}
        >
          <Paperclip className="w-3 h-3 shrink-0 text-slate-500" />
          <span className="truncate">{f.name}</span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="rounded-full hover:bg-slate-200 p-0.5 text-slate-500 hover:text-slate-700"
            aria-label={`„${f.name}" entfernen`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
