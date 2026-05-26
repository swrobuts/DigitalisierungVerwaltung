/**
 * Formularfeld im Stil eines amtlichen Antragsformulars:
 * Kleinkapital-Label oben, Wert darunter auf gepunkteter Schreiblinie.
 *
 * Aus dem Pre-Hard-Cut-Layout 7754322 wiederhergestellt.
 */
import type { ReactNode } from "react";

interface Props {
  label: string;
  /** Optional zusätzliche Klassen (z.B. „sm:col-span-2" für volle Breite). */
  className?: string;
  children: ReactNode;
}

export function DocField({ label, className = "", children }: Props) {
  return (
    <div className={className}>
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-slate-500 font-medium mb-1">
        {label}
      </div>
      <div className="text-[15px] text-slate-900 pb-1 border-b border-dotted border-slate-300 min-h-[1.6rem]">
        {children}
      </div>
    </div>
  );
}
