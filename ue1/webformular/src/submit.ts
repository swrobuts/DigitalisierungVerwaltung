import type { APL2Antrag } from "./types";

/**
 * Format: APL2-<haushaltsjahr>-<traegerkuerzel>-<random6>.
 * Bewusst clientseitig — UE2 ersetzt das durch DB-Sequenz.
 */
export function erzeugeAntragsnummer(antrag: APL2Antrag): string {
  const kuerzel = (antrag.traeger || "XXX")
    .replace(/[^A-Za-zÄÖÜäöüß]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `APL2-${antrag.haushaltsjahr}-${kuerzel}-${rand}`;
}

export function zeigeBestaetigung(
  container: HTMLElement,
  antrag: APL2Antrag,
  nummer: string,
): void {
  container.hidden = false;
  container.innerHTML = `
    <h2>Antrag aufgenommen (Demo)</h2>
    <p>Ihre Antragsnummer:</p>
    <p class="antragsnummer">${nummer}</p>
    <p>
      <strong>Hinweis Demo:</strong> Dies ist ein Lehr-Webformular ohne Backend.
      Die Daten verbleiben in Ihrem Browser und werden <em>nicht</em> an die
      Stadt Würzburg gesendet. In UE2 lernen wir, wie aus diesem Schritt ein
      echter Eingang im Amt wird.
    </p>
    <details>
      <summary>Zusammenfassung der erfassten Daten</summary>
      <pre>${escapeHTML(JSON.stringify(antrag, null, 2))}</pre>
    </details>
    <button type="button" onclick="location.reload()">Neuen Antrag stellen</button>
  `;
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    };
    return map[c] ?? c;
  });
}
