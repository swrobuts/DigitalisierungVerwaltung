/**
 * Format-Helfer für deutsche Eingaben.
 *
 * parseEuro: nimmt User-Input (z.B. "1.234,56 €") und liefert eine Zahl.
 * - Tausenderpunkte werden entfernt
 * - Komma → Dezimalpunkt
 * - €-Zeichen und Whitespace werden entfernt
 * - Leerer String → 0 (kein Eintrag = 0 €)
 * - Nicht parsebare Eingabe → NaN (Caller entscheidet Fehlerbehandlung)
 */
export function parseEuro(input: string): number {
  if (input === "" || input == null) return 0;
  const cleaned = input
    .replace(/€/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isNaN(n) ? NaN : n;
}

/**
 * formatEuro: gibt Cent-genaue deutsche Anzeige zurück.
 * - withCurrency=true: "1.234,56 €" (Anzeige in Summen, Übersicht)
 * - withCurrency=false: "1.234,56" (in Input-Feldern, das € rendert die UI separat)
 * Negative oder NaN → "" (leere Eingabe), 0 → je nach Flag "0,00 €" oder "0,00".
 */
export function formatEuro(n: number, withCurrency = true): string {
  if (!Number.isFinite(n)) return "";
  const num = n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withCurrency ? `${num} €` : num;
}
