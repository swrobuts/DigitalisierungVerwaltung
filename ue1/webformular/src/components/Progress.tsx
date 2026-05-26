/**
 * Echter 3-Phasen-Stepper (Wizard-Indikator).
 *
 * Phasen sind im UE1-Wizard fest: 1 Antragsteller · 2 FB-Detail · 3 Anlagen
 * Optisch:
 *   - bereits erledigte Schritte: roter Bubble mit ✓, rote Verbindungslinie
 *   - aktuelle Phase: rote Outline + Soft-Halo
 *   - kommende Phase: graue Outline
 *
 * CSS-Klassen siehe .stepper / .stepper-bubble / .stepper-label / .is-active / .is-done
 */

import { t } from "../lib/i18n";

const PHASEN: ReadonlyArray<{ titelKey: string; kurz: string }> = [
  { titelKey: "phase.1.titel", kurz: "Antragsteller" },
  { titelKey: "phase.2.titel", kurz: "Förderbereich" },
  { titelKey: "phase.3.titel", kurz: "Anlagen & Absenden" },
];

interface ProgressProps {
  /** 1-basiert: aktuell aktive Phase (1, 2 oder 3). */
  step: number;
  /** Falls vorhanden, ignoriert (3 ist fix). Nur für API-Kompat. */
  total?: number;
}

export function Progress({ step }: ProgressProps): JSX.Element {
  return (
    <ol className="stepper" aria-label={`Schritt ${step} von ${PHASEN.length}`}>
      {PHASEN.map((p, i) => {
        const nummer = i + 1;
        const istAktiv = nummer === step;
        const istErledigt = nummer < step;
        const klasse = istErledigt ? "is-done" : istAktiv ? "is-active" : "";
        return (
          <li key={p.titelKey} className={klasse} aria-current={istAktiv ? "step" : undefined}>
            <span className="stepper-bubble" aria-hidden="true">
              <span>{nummer}</span>
            </span>
            <span className="stepper-label">{t(p.titelKey)}</span>
          </li>
        );
      })}
    </ol>
  );
}
