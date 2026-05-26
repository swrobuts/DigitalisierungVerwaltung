/**
 * Zwei-Spalten-Feldraster für klassische Antragsdaten.
 *
 * Visuelle Konvention aus dem Pre-Hard-Cut-Layout 7754322:
 *   - 1 Spalte mobil, 2 Spalten ab `sm`
 *   - Großzügiger Spalten-Gap (10) damit Wert-Schreiblinien Luft haben
 *   - Vertikaler Gap (5) für Lesefluss
 */
import type { ReactNode } from "react";

export function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5">
      {children}
    </div>
  );
}
