import { useState, useRef, useEffect } from "react";
import { Languages, Check } from "lucide-react";
import { getSprache, setSprache, SPRACHEN, type Sprache } from "../lib/i18n";

interface Props {
  /** `compact` (Default) — Dropdown mit aktueller Code-Anzeige (z.B. „DE").
   *  `chip`    — flacher Pill-Stil für die Meta-Bar unter dem Hero-Input. */
  variant?: "compact" | "chip";
}

/**
 * Sprach-Dropdown. Klicks außerhalb schließen das Menü. Auswahl ändert
 * die globale Sprache und triggert (via i18n.setSprache) das CustomEvent
 * — App.tsx remountet die UI über den `key={sprache}`-Trick.
 */
export function LanguageSwitcher({ variant = "compact" }: Props) {
  const [open, setOpen] = useState(false);
  const current: Sprache = getSprache();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const trigger =
    variant === "chip"
      ? "text-xs text-slate-600 bg-white border border-slate-200 hover:border-slate-300 rounded-full pl-3 pr-2.5 py-1.5 inline-flex items-center gap-1.5 transition-colors"
      : "text-xs text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-md px-2.5 py-1.5 inline-flex items-center gap-1.5 transition-colors bg-white";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="language-switcher"
      >
        <Languages className="w-3.5 h-3.5" />
        <span className="tabular-nums font-medium">{current.toUpperCase()}</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 civa-popover-enter"
        >
          {SPRACHEN.map((s) => {
            const aktiv = s.code === current;
            return (
              <button
                key={s.code}
                type="button"
                role="option"
                aria-selected={aktiv}
                onClick={() => {
                  setSprache(s.code);
                  setOpen(false);
                }}
                className={
                  "w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors " +
                  (aktiv ? "text-wue-rot" : "text-slate-700")
                }
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="tabular-nums text-[11px] text-slate-400 w-6">
                    {s.label}
                  </span>
                  <span className="truncate">{s.endonym}</span>
                  {!s.fertig && (
                    <span className="text-[10px] text-slate-400">(β)</span>
                  )}
                </span>
                {aktiv && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            );
          })}
          <div className="border-t border-slate-100 mt-1 pt-1 px-3 pb-1 text-[10px] text-slate-400 leading-snug">
            β: UI noch auf Deutsch — Konversation läuft trotzdem in
            Ihrer Sprache.
          </div>
        </div>
      )}
    </div>
  );
}
