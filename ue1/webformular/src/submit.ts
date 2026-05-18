import type { APL2Antrag } from "./types";

export function zeigeBestaetigung(
  container: HTMLElement,
  antrag: APL2Antrag,
  nummer: string,
): void {
  container.hidden = false;
  container.innerHTML = `
    <h2>Antrag aufgenommen</h2>
    <p>Ihre Antragsnummer:</p>
    <p class="antragsnummer">${nummer}</p>
    <p>Ihr Antrag wurde an die Beratungsstelle für Senioren übermittelt. Sie können diese Nummer für Rückfragen verwenden.</p>
    <details>
      <summary>Zusammenfassung der gesendeten Daten</summary>
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
