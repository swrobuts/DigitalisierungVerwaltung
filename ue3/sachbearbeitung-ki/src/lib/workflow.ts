export type Status =
  | "eingegangen"
  | "in_pruefung"
  | "rueckfrage"
  | "bewilligt"
  | "abgelehnt";

export const STATUS_ORDER: Status[] = [
  "eingegangen",
  "in_pruefung",
  "rueckfrage",
  "bewilligt",
  "abgelehnt",
];

export const STATUS_LABELS: Record<Status, string> = {
  eingegangen: "Eingegangen",
  in_pruefung: "In Prüfung",
  rueckfrage: "Rückfrage",
  bewilligt: "Bewilligt",
  abgelehnt: "Abgelehnt",
};

// Spiegel der DB-Tabelle apl2.workflow_transition. Bei DB-Änderung
// muss dieser Cache nachgezogen werden (zuletzt Migration 036).
const TRANSITIONS: Record<Status, Status[]> = {
  eingegangen: ["in_pruefung"],
  in_pruefung: ["rueckfrage", "bewilligt", "abgelehnt", "eingegangen"],
  // Rückfrage kann direkt zu Endentscheidung oder zurück zur Prüfung:
  rueckfrage: ["in_pruefung", "bewilligt", "abgelehnt"],
  // Endstatus können direkt zu einem anderen Endstatus korrigiert werden
  // oder zurück zur Bearbeitung (Migration 035 + 036):
  bewilligt: ["in_pruefung", "abgelehnt", "rueckfrage"],
  abgelehnt: ["in_pruefung", "bewilligt", "rueckfrage"],
};

/** Übergänge, die einen Status nach VORN bewegen (= eine neue Entscheidung
 * oder Bearbeitungs-Schritt, mit Bescheid-Generierung wenn Endstatus).
 *
 * Reverse = nur echte Aufhebungen / Zurücksetzen (Endstatus → in_pruefung,
 * in_pruefung → eingegangen, rueckfrage → in_pruefung). Quer-Übergänge
 * zwischen Endstatus (z.B. abgelehnt → bewilligt) sind KEINE Reverse —
 * sie sind eine neue Entscheidung und erzeugen einen neuen Bescheid. */
const FORWARD: Record<Status, Status[]> = {
  eingegangen: ["in_pruefung"],
  in_pruefung: ["rueckfrage", "bewilligt", "abgelehnt"],
  rueckfrage: ["bewilligt", "abgelehnt"],
  bewilligt: ["abgelehnt", "rueckfrage"],
  abgelehnt: ["bewilligt", "rueckfrage"],
};

export function allowedTransitions(from: Status): Status[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** True wenn der Übergang ein Rück-/Korrektur-Schritt ist (z.B.
 * abgelehnt → in_pruefung). Wird in der UI verwendet, um Reverse-Buttons
 * dezenter zu rendern und einen Pflicht-Kommentar zu verlangen. */
export function isReverseTransition(from: Status, to: Status): boolean {
  if (!canTransition(from, to)) return false;
  return !(FORWARD[from]?.includes(to) ?? false);
}
