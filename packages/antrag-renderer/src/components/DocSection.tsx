/**
 * Nummerierter Akten-Abschnitt im Stil eines Verwaltungs-Formulars.
 *
 * Klick auf die Überschrift klappt den Inhalt ein/aus — Sachbearbeitung
 * kann irrelevante Abschnitte zusammenfalten, ohne sie zu verlieren.
 *
 * Visuelle Konvention (aus Pre-Hard-Cut-Layout 7754322):
 *   - Chevron VOR dem §-Präfix (Commit baa6094 hatte das exakt so gefixt)
 *   - §-Präfix in dezentem Slate-Grau, mono-tabular
 *   - Titel größer, klickbar-rot bei Hover
 *   - Subtitle nach Em-Dash, kleiner & grau
 *   - Body eingerückt (ml-[3.75rem]) damit Chevron + § visuell als Marker stehen
 *
 * Optionale `actions`-Slot: kleines Element rechts vom Titel
 * (z.B. SektionPruefung-Status-Switch aus UE2/UE3).
 */
import { useState, type ReactNode } from "react";

interface Props {
  /** Z.B. „§ 1" — wird vor dem Titel angezeigt. */
  num: string;
  title: string;
  subtitle?: string;
  /** Default true. */
  defaultOpen?: boolean;
  /** Slot rechts vom Titel (z.B. Pruef-Status-Toggle). */
  actions?: ReactNode;
  children: ReactNode;
}

export function DocSection({
  num,
  title,
  subtitle,
  defaultOpen = true,
  actions,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <div className="flex items-start gap-2.5 mb-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2 group text-left min-w-0"
          aria-expanded={open}
        >
          <Chevron open={open} />
          <span className="text-slate-400 font-semibold text-[13px] tabular-nums shrink-0">
            {num}
          </span>
          <h2 className="text-[14px] font-semibold text-slate-900 tracking-tight group-hover:text-wue-rot transition-colors truncate">
            {title}
          </h2>
          {subtitle && (
            <span className="text-[11px] text-slate-500 truncate hidden sm:inline">
              — {subtitle}
            </span>
          )}
        </button>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {open && <div className="ml-[3rem]">{children}</div>}
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={
        "h-4 w-4 text-slate-400 group-hover:text-wue-rot transition-transform shrink-0 " +
        (open ? "" : "-rotate-90")
      }
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 8l4 4 4-4"
      />
    </svg>
  );
}
