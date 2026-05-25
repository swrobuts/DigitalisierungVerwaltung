const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

// Anzeige fest in Europe/Berlin — unabhängig von Browser-/Server-Timezone.
// Postgres timestamptz liefert UTC; ohne explizite TZ würde Intl die
// System-TZ des laufenden Hosts verwenden (UE2-Docker-Container = UTC).
const DT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

export function formatEuro(amount: number): string {
  return EUR.format(amount).replace(/ /g, " ");
}

export function formatDateTime(iso: string): string {
  // Defensive: wenn der ISO-String kein TZ-Suffix hat, als UTC interpretieren
  // — sonst nimmt new Date() ihn als lokale Zeit (Bug-Quelle).
  const hasTz = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(iso);
  return DT.format(new Date(hasTz ? iso : iso + "Z"));
}

const D = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Berlin",
});

/** Nur Datum, ohne Uhrzeit. Für Listen-Übersichten — die Uhrzeit ist
 *  in der Inbox meist irrelevant und nimmt nur Spaltenbreite weg. */
export function formatDate(iso: string): string {
  const hasTz = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(iso);
  return D.format(new Date(hasTz ? iso : iso + "Z"));
}

export function formatAdresse(
  strasse: string,
  hausnummer: string,
  plz: string,
  ort: string,
): string {
  return `${strasse} ${hausnummer}, ${plz} ${ort}`;
}

/** Migration 058: Durchlaufzeit als kurzer Anzeige-Text.
 *  - entschieden:  "12 Tage"     (Bewilligung/Ablehnung erfolgt)
 *  - offen:        "läuft seit 12 Tagen"  (noch in Bearbeitung)
 *  - 0 Tage:       "<1 Tag"   (Eingang und Entscheidung am selben Tag) */
export function formatDurchlaufzeit(tage: number, entschieden: boolean): string {
  if (tage <= 0) return entschieden ? "<1 Tag" : "läuft seit <1 Tag";
  const t = tage === 1 ? "1 Tag" : `${tage} Tage`;
  return entschieden ? t : `läuft seit ${tage === 1 ? "1 Tag" : `${tage} Tagen`}`;
}

/** Ampel-Klassifikation für die Durchlaufzeit-Anzeige.
 *  Schwellen: <30 Tage grün, 30–60 Tage gelb, >60 Tage rot.
 *  Offene Anträge bekommen 'gray' wenn unter Schwelle, sonst die jeweilige Farbe. */
export type DurchlaufzeitAmpel = "green" | "yellow" | "red" | "gray";
export function durchlaufzeitAmpel(tage: number, entschieden: boolean): DurchlaufzeitAmpel {
  if (!entschieden && tage < 30) return "gray";
  if (tage < 30) return "green";
  if (tage <= 60) return "yellow";
  return "red";
}
