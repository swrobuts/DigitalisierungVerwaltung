/**
 * Eine Zeile in der Antrags-Detailansicht: Label links, Wert rechts.
 * Identisches Layout wie aktuell in UE2/UE3 FbBlocks.tsx — damit das
 * Refactoring optisch keinen Unterschied macht.
 */
import type { ReactNode } from "react";

interface Props {
  label: string;
  pflicht?: boolean;
  children: ReactNode;
}

export function FieldRow({ label, pflicht, children }: Props) {
  return (
    <div className="grid grid-cols-[12rem_1fr] gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
        {pflicht && <span className="ml-1 text-rose-500" title="Pflichtfeld">*</span>}
      </div>
      <div className="text-sm text-slate-900">{children}</div>
    </div>
  );
}
