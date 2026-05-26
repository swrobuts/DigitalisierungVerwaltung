/**
 * Aus-/einklappbare Section für lange Antragsformulare.
 *
 * Pattern: WAI-ARIA Disclosure
 *   - <button aria-expanded aria-controls> als Header
 *   - <div id role="region"> als ausklappbarer Inhalt
 *
 * Visuelle Konventionen:
 *   - Section-Header trägt die Nummer (1, 2, 3, …) und den Titel
 *   - Status-Badge rechts (optional): „3/3 ✓" oder „1 Fehler" oder „in Bearbeitung"
 *   - Chevron rotiert 90° beim Aufklappen
 *
 * Steuerung: Bei kontrolliertem Betrieb (`open` + `onToggle`) übernimmt
 * der Parent. Sonst hält die Section ihren eigenen offen/zu-Zustand mit
 * dem von `defaultOpen` vorgegebenen Startwert.
 *
 * Smart-Open bei Validierungsfehlern: Der Parent kann `open={true}`
 * setzen, sobald eine fehlerhafte Section vorliegt — dadurch springt
 * der Bürger nicht ins Leere, wenn der „Weiter"-Button rot wird.
 */

import { useId, useState, type ReactNode } from "react";

export type SectionStatus =
  | { kind: "ok"; label: string }
  | { kind: "todo"; label: string }
  | { kind: "error"; label: string }
  | { kind: "info"; label: string };

interface CollapsibleSectionProps {
  /** Reihenfolge-Nummer im Step (1, 2, 3, …). */
  nummer?: number;
  /** Titel (z.B. „Träger", „Anschrift"). */
  titel: string;
  /** Optionaler kurzer Hinweistext unter dem Titel im Header. */
  beschreibung?: string;
  /** Status-Badge rechts neben dem Titel. */
  status?: SectionStatus | null;
  /** Startzustand, wenn unkontrolliert. */
  defaultOpen?: boolean;
  /** Kontrollierter Open-Zustand (überschreibt internen State). */
  open?: boolean;
  /** Callback wenn der Header geklickt wird (auch im kontrollierten Modus). */
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}

export function CollapsibleSection({
  nummer,
  titel,
  beschreibung,
  status = null,
  defaultOpen = false,
  open,
  onToggle,
  children,
}: CollapsibleSectionProps): JSX.Element {
  const reactId = useId();
  const panelId = `coll-${reactId}`;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const istOffen = open ?? internalOpen;

  const toggle = () => {
    const naechster = !istOffen;
    if (open === undefined) setInternalOpen(naechster);
    onToggle?.(naechster);
  };

  return (
    <section className={`coll${istOffen ? " is-open" : ""}`}>
      <button
        type="button"
        className="coll-head"
        aria-expanded={istOffen}
        aria-controls={panelId}
        onClick={toggle}
      >
        {typeof nummer === "number" && (
          <span className="coll-nummer" aria-hidden="true">
            {nummer}
          </span>
        )}
        <span className="coll-titel-wrap">
          <span className="coll-titel">{titel}</span>
          {beschreibung && <span className="coll-beschreibung">{beschreibung}</span>}
        </span>
        {status && (
          <span className={`coll-status coll-status-${status.kind}`}>
            {status.kind === "ok" && (
              <span className="coll-status-icon" aria-hidden="true">✓</span>
            )}
            {status.kind === "error" && (
              <span className="coll-status-icon" aria-hidden="true">!</span>
            )}
            <span>{status.label}</span>
          </span>
        )}
        <span className="coll-chevron" aria-hidden="true">›</span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-label={titel}
        className="coll-panel"
        hidden={!istOffen}
      >
        <div className="coll-panel-inner">{children}</div>
      </div>
    </section>
  );
}
