/**
 * IBAN-Prüfung nach ISO 13616 (Mod-97):
 * 1. Leerzeichen entfernen, in Großbuchstaben
 * 2. Die ersten 4 Zeichen ans Ende verschieben
 * 3. Buchstaben → Zahlen (A=10, B=11, ..., Z=35)
 * 4. Resultat mod 97 muss 1 ergeben
 */
export function isValidIBAN(input: string): boolean {
  const iban = input.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) =>
    (c.charCodeAt(0) - 55).toString(),
  );
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input);
}

/**
 * Deutsche PLZ: genau 5 Ziffern.
 */
export function isValidPLZ(input: string): boolean {
  return /^\d{5}$/.test(input ?? "");
}

/**
 * Prüft, ob ein ISO-Datum (YYYY-MM-DD) heute oder in der Vergangenheit liegt.
 * Vorsicht: `new Date("2023-02-29T00:00:00")` rollt **stillschweigend** auf
 * den 1. März 2023 — wir müssen also nach dem Parsen prüfen, ob Y/M/D
 * unverändert sind, sonst akzeptieren wir nicht-existierende Kalenderdaten.
 * Ohne `Z` → lokale Mitternacht; korrekt für DE-Formulare.
 */
export function isValidPastOrTodayISO(input: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const [yearStr, monthStr, dayStr] = input.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(year, month - 1, day);  // lokale Mitternacht
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return false;
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  return date.getTime() <= heute.getTime();
}

export function isPositiveEuro(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
