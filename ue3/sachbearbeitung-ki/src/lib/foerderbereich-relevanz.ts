/**
 * Welche Bemessungsgröße ist für welchen Förderbereich nach AHP-Richtlinie
 * relevant? Single Source of Truth ist pruefung/src/pruefung/bescheid_subsumtion.py
 * (ANTEIL_RELEVANTE_FOERDERBEREICHE) — wir spiegeln das hier im Frontend,
 * damit die Inbox und das AntragDetail klar unterscheiden, wann ein
 * angezeigter Wert ausschlaggebend für die Bewilligungsentscheidung ist
 * und wann er nur Beiwerk ist.
 *
 * Robert-Wunsch nach Klarstellungs-Episode 2026-05-25: ein angezeigter
 * "Stadt-Anteil 0,55" bei Förderbereich „Seniorenkreise" wirkt wie eine
 * Halluzination, weil die anteilige Auszahlung dort gar nicht greift.
 * Mit diesem Mapping zeigt die UI "n/a (FB-X)" statt einer irreführenden
 * Zahl.
 */

export type Foerderbereich =
  | "aufbau_niedrigschwellige_angebote"
  | "buergerschaftliches_engagement"
  | "mehrgenerationenhaeuser"
  | "begegnungszentren"
  | "bildungstraeger"
  | "seniorenkreise"
  | "quartiersmanagement_altenarbeit"
  | "struktur_schwerpunktfoerderung";

/** AHP 2.3 Pkt. 2 + 3 — anteilige Auszahlung gem. Stadtbewohner-Anteil.
 *  Quelle: pruefung.bescheid_subsumtion.ANTEIL_RELEVANTE_FOERDERBEREICHE. */
export const STADT_ANTEIL_AUSSCHLAGGEBEND: ReadonlySet<Foerderbereich> = new Set([
  "begegnungszentren",
  "bildungstraeger",
]);

/** AHP 2.3.4 Treffen-Staffel — bestimmt direkt die Förderhöhe für
 *  Seniorenkreise (≥10 → 750 €, ≥20 → 1.250 €, ≥46 → 2.000 €).
 *  Für Begegnungszentren ist die Treffen-Zahl Bemessungsfaktor in der
 *  Budgetgewichtung, aber nicht Staffel-bindend. */
export const TREFFEN_STAFFEL_BINDEND: ReadonlySet<Foerderbereich> = new Set([
  "seniorenkreise",
]);

/** Treffen als Gewichtungsfaktor (zusätzlich zur Staffel). */
export const TREFFEN_GEWICHTUNG_RELEVANT: ReadonlySet<Foerderbereich> = new Set([
  "seniorenkreise",
  "begegnungszentren",
]);

/** Kurz-Label für „n/a"-Tooltip: erklärt, für welchen FB der Wert
 *  ausschlaggebend WÄRE, wenn der aktuelle Antrag dort einsortiert wäre. */
export const FB_KURZLABEL: Record<Foerderbereich, string> = {
  aufbau_niedrigschwellige_angebote: "Aufbau-Angebote (FB I)",
  buergerschaftliches_engagement:    "bürgerschaftl. Engagement (FB II)",
  mehrgenerationenhaeuser:           "Mehrgenerationenhaus (FB III)",
  begegnungszentren:                 "Begegnungszentrum (FB III)",
  bildungstraeger:                   "Bildungsträger (FB III)",
  seniorenkreise:                    "Seniorenkreis (FB III)",
  quartiersmanagement_altenarbeit:   "Quartiersmgmt. (FB III)",
  struktur_schwerpunktfoerderung:    "Struktur-/Schwerpunkt (FB IV)",
};

export function fbLabel(fb: Foerderbereich | null | undefined): string {
  if (!fb) return "Förderbereich nicht klassifiziert";
  return FB_KURZLABEL[fb] ?? fb;
}

/** True, wenn der Stadt-Anteil-Wert für die Auszahlungsberechnung
 *  ausschlaggebend ist. Bei NULL-Förderbereich (noch nicht klassifiziert):
 *  konservativ true, damit der Wert nicht versteckt wird, bevor die
 *  Sachbearbeitung den Förderbereich vergeben hat. */
export function istStadtAnteilRelevant(fb: Foerderbereich | null | undefined): boolean {
  if (!fb) return true;
  return STADT_ANTEIL_AUSSCHLAGGEBEND.has(fb);
}

/** True, wenn die Treffen-Zahl für Förderhöhe oder Gewichtung relevant ist. */
export function istTreffenRelevant(fb: Foerderbereich | null | undefined): boolean {
  if (!fb) return true;
  return TREFFEN_GEWICHTUNG_RELEVANT.has(fb);
}

/** Erklärungstext für „n/a"-Anzeigen. */
export function naTooltip(
  groesse: "stadt_anteil" | "treffen",
  fb: Foerderbereich,
): string {
  const fbName = FB_KURZLABEL[fb] ?? fb;
  if (groesse === "stadt_anteil") {
    return (
      `Stadt-Anteil ist für ${fbName} nicht ausschlaggebend. ` +
      `Die anteilige Auszahlung gem. AHP 2.3 Pkt. 2 gilt nur für ` +
      `Begegnungszentren und Bildungsträger.`
    );
  }
  return (
    `Treffen-Anzahl ist für ${fbName} nicht ausschlaggebend. ` +
    `Die Treffen-Staffel (AHP 2.3.4) bindet die Förderhöhe nur ` +
    `für Seniorenkreise; bei Begegnungszentren als Gewichtungsfaktor.`
  );
}
