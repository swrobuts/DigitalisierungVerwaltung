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

export function formatAdresse(
  strasse: string,
  hausnummer: string,
  plz: string,
  ort: string,
): string {
  return `${strasse} ${hausnummer}, ${plz} ${ort}`;
}
