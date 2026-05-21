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
