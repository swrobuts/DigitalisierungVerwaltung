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
// (Migration > 007) muss dieser Cache nachgezogen werden.
const TRANSITIONS: Record<Status, Status[]> = {
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
