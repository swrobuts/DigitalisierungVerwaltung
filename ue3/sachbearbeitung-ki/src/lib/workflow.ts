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
// muss dieser Cache nachgezogen werden (zuletzt Migration 035).
const TRANSITIONS: Record<Status, Status[]> = {
  eingegangen: ["in_pruefung"],
  in_pruefung: ["rueckfrage", "bewilligt", "abgelehnt", "eingegangen"],
  rueckfrage: ["in_pruefung"],
  // Reverse-Pfade zur Korrektur einer Entscheidung (Migration 035):
  bewilligt: ["in_pruefung"],
  abgelehnt: ["in_pruefung"],
};

/** Übergänge, die einen Status nach VORN bewegen (normaler Workflow). */
const FORWARD: Record<Status, Status[]> = {
  eingegangen: ["in_pruefung"],
  in_pruefung: ["rueckfrage", "bewilligt", "abgelehnt"],
  rueckfrage: ["in_pruefung"],
  bewilligt: [],
  abgelehnt: [],
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
