const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const DT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatEuro(amount: number): string {
  return EUR.format(amount).replace(/ /g, " ");
}

export function formatDateTime(iso: string): string {
  return DT.format(new Date(iso));
}

export function formatAdresse(
  strasse: string,
  hausnummer: string,
  plz: string,
  ort: string,
): string {
  return `${strasse} ${hausnummer}, ${plz} ${ort}`;
}
