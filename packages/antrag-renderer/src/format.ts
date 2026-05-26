/**
 * Format-Helper für AntragViewer. Wiederholungsfreie Anzeige-Logik:
 * dieselben Helper laufen in UE2 + UE3 + (perspektivisch) UE1-Read-Mode.
 */

export function formatEuro(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  // DB-Werte sind 0..1 als Dezimal — UI zeigt XX %
  return `${Math.round(value * 100)} %`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("de-DE").format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // ISO YYYY-MM-DD → DD.MM.YYYY
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export function formatBool(value: boolean | null | undefined): string {
  if (value == null) return "—";
  return value ? "ja" : "nein";
}

export function formatText(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  return value;
}
