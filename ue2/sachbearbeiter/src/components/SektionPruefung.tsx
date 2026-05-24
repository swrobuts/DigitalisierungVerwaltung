import { useEffect, useRef, useState } from "react";
import { StickyNote } from "lucide-react";
import { cn } from "../lib/cn";
import {
  useManuellePruefungContext,
  type PruefStatus,
} from "../hooks/useManuellePruefung";

interface SektionPruefungProps {
  antragId: string;
  paragraph: string;
}

const STATUS_LABELS: Record<PruefStatus, string> = {
  offen: "offen",
  ok: "ok",
  fraglich: "fraglich",
  fehlt: "fehlt",
};

const STATUS_CHIP_CLASSES: Record<PruefStatus, string> = {
  offen: "bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200",
  ok: "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200",
  fraglich: "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200",
  fehlt: "bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200",
};

const STATUS_OPTIONS: PruefStatus[] = ["offen", "ok", "fraglich", "fehlt"];

function formatGeprueftTooltip(geprueftAm: string | null): string | undefined {
  if (!geprueftAm) return undefined;
  const d = new Date(geprueftAm);
  if (Number.isNaN(d.getTime())) return undefined;
  return `zuletzt geprüft am ${d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * Kleiner Inline-Vermerk pro §-Sektion:
 *  - Chip mit Prüfstatus (offen|ok|fraglich|fehlt) — Klick öffnet Dropdown
 *  - Notiz-Toggle mit Textarea (gespeichert onBlur)
 *
 * Bezieht alle Daten aus dem ManuellePruefungProvider, der einmal pro
 * Antrags-Öffnung lädt — kein N+1-Request.
 */
export function SektionPruefung({ antragId: _antragId, paragraph }: SektionPruefungProps) {
  const { loading, get, save } = useManuellePruefungContext();
  const entry = get(paragraph);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState<string>(entry.kommentar ?? "");
  const [savingError, setSavingError] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);

  // Sync draft when the entry-comment changes externally
  useEffect(() => {
    setDraft(entry.kommentar ?? "");
  }, [entry.kommentar]);

  // Click-outside closes the status menu
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(ev: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(ev.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  async function selectStatus(next: PruefStatus) {
    setMenuOpen(false);
    const res = await save(paragraph, next, entry.kommentar);
    setSavingError(res.error);
  }

  async function persistNote() {
    if ((draft ?? "") === (entry.kommentar ?? "")) return;
    const res = await save(paragraph, entry.status, draft);
    setSavingError(res.error);
  }

  const tooltip = formatGeprueftTooltip(entry.geprueft_am);
  const hasNote = !!entry.kommentar && entry.kommentar.trim().length > 0;

  return (
    <div className="not-prose inline-flex flex-col items-end gap-1 text-xs">
      <div className="flex items-center gap-1.5">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={loading}
            title={tooltip}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            aria-label={`Prüfstatus ${paragraph}: ${STATUS_LABELS[entry.status]}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              STATUS_CHIP_CLASSES[entry.status],
            )}
          >
            {STATUS_LABELS[entry.status]}
          </button>

          {menuOpen && (
            <ul
              role="listbox"
              className="absolute right-0 z-30 mt-1 w-32 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
            >
              {STATUS_OPTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={entry.status === s}
                    onClick={() => selectStatus(s)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] uppercase tracking-wide hover:bg-slate-50",
                      entry.status === s
                        ? "font-semibold text-slate-900"
                        : "text-slate-600",
                    )}
                  >
                    <span>{STATUS_LABELS[s]}</span>
                    {entry.status === s && (
                      <span aria-hidden="true" className="text-slate-400">
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={() => setNoteOpen((v) => !v)}
          disabled={loading}
          aria-pressed={noteOpen}
          aria-label={
            hasNote
              ? `Notiz zu ${paragraph} bearbeiten`
              : `Notiz zu ${paragraph} hinzufügen`
          }
          title={hasNote ? "Notiz vorhanden" : "Notiz hinzufügen"}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-md border text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed",
            hasNote
              ? "border-amber-300 text-amber-600"
              : "border-slate-200",
          )}
        >
          <StickyNote
            className={cn("h-3.5 w-3.5", hasNote && "fill-current")}
            aria-hidden="true"
          />
        </button>
      </div>

      {noteOpen && (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={persistNote}
          rows={2}
          placeholder={`Notiz zu ${paragraph} …`}
          aria-label={`Notiz zu ${paragraph}`}
          className="w-64 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
      )}

      {savingError && (
        <div className="text-[11px] text-rose-700" role="alert">
          Fehler: {savingError}
        </div>
      )}
    </div>
  );
}
