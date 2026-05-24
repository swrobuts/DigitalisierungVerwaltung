/**
 * Status-Komponente. Pollt die Supabase-REST-API alle 3 Sekunden auf
 * Änderungen in `apl2.antrag_einreichung`. Drei sichtbare Zustände:
 *
 *   wartend / in_verarbeitung → Spinner mit „Wird verarbeitet"
 *   fertig                    → Kurze „Wird weitergeleitet"-Card,
 *                                dann window.location.href = UE1?prefill=<id>
 *   fehler                    → Fehler-Card mit Hinweis
 *
 * Architektur A (2026-05-24): OCR-Daten bleiben in antrag_einreichung.extrahiert_jsonb.
 * Erst der finale UE1-Submit erzeugt einen Antrag in apl2.antraege.
 */

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "https://supabase.butscher.cloud";
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

// UE1-URL fürs Prefill-Redirect. Production-Default zeigt auf GH Pages;
// Dev-Override via VITE_UE1_URL (z.B. http://localhost:5173).
const UE1_BASE_URL =
  (import.meta.env.VITE_UE1_URL as string | undefined) ??
  "https://swrobuts.github.io/DigitalisierungVerwaltung/ue1/webformular";

const REDIRECT_DELAY_MS = 2000;

interface Einreichung {
  id: string;
  status: "wartend" | "in_verarbeitung" | "fertig" | "fehler";
  storage_path: string;
  dateiname: string | null;
  eingereicht_am: string;
  verarbeitet_am: string | null;
  antrag_id: string | null;
  extrahiert_jsonb: Record<string, unknown> | null;
  fehler_text: string | null;
}

export function renderStatus(trackingId: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "card";

  // Initial: Spinner
  const slot = document.createElement("div");
  wrap.appendChild(slot);

  renderWartend(slot);

  const startedAt = Date.now();
  let stopped = false;

  async function poll() {
    if (stopped) return;
    if (!ANON_KEY) {
      renderError(slot, "Konfigurationsfehler: ANON_KEY fehlt beim Build.");
      return;
    }
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      renderError(slot,
        "Zeitüberschreitung — die Verarbeitung dauert ungewöhnlich lange. " +
        "Bitte später noch einmal die Seite neu laden oder den Support kontaktieren.",
        true,
      );
      return;
    }

    try {
      const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/antrag_einreichung?id=eq.${encodeURIComponent(trackingId)}&select=*`;
      const res = await fetch(url, {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          "Accept-Profile": "apl2",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json() as Einreichung[];
      const row = rows[0];
      if (!row) {
        renderError(slot, `Keine Einreichung mit ID ${trackingId} gefunden.`, true);
        return;
      }

      if (row.status === "fertig") {
        stopped = true;
        renderRedirectingToUe1(slot, row.id);
        return;
      }
      if (row.status === "fehler") {
        stopped = true;
        renderError(slot, row.fehler_text || "Unbekannter Fehler bei der Verarbeitung.", true);
        return;
      }
      // wartend / in_verarbeitung → weiter pollen
    } catch (e) {
      // Netzwerk-Fehler: einmalig warnen, dann weiter pollen
      console.warn("Polling-Fehler:", e);
    }

    setTimeout(poll, POLL_INTERVAL_MS);
  }

  poll();

  return wrap;
}

function renderWartend(slot: HTMLElement) {
  slot.innerHTML = "";
  const card = document.createElement("div");
  card.className = "status-card";
  card.innerHTML = `
    <div class="status-spinner" aria-hidden="true"></div>
    <div class="status-title">Antrag wird verarbeitet …</div>
    <div class="status-detail">
      Die KI liest gerade die Felder aus Ihrem PDF.
      Das dauert typischerweise 10–30 Sekunden.
      Diese Seite aktualisiert sich automatisch.
    </div>
  `;
  slot.appendChild(card);
}

/**
 * Zeigt kurz einen Erfolgs-Hinweis und leitet dann automatisch zur
 * UE1-Bestätigungsseite weiter (?prefill=<einreichungId>).
 */
function renderRedirectingToUe1(slot: HTMLElement, einreichungId: string) {
  const ue1Url = `${UE1_BASE_URL}/?prefill=${encodeURIComponent(einreichungId)}`;

  slot.innerHTML = "";
  const card = document.createElement("div");
  card.className = "status-ok";
  card.innerHTML = `
    <div class="status-ok-title">✓ OCR abgeschlossen</div>
    <p style="margin: 0; font-size: 14px;">
      Ihr PDF wurde maschinell ausgelesen. Sie werden gleich zur Prüfung
      und Bestätigung weitergeleitet — bitte kontrollieren Sie dort die
      erkannten Werte und senden Sie den Antrag final ab.
    </p>
    <p style="margin: 0.8rem 0 0; font-size: 12.5px; color: #555;">
      Falls die Weiterleitung nicht automatisch erfolgt:
      <a href="${ue1Url}">Hier klicken, um zur Bestätigung zu wechseln</a>.
    </p>
  `;
  slot.appendChild(card);

  // Kurzer Moment, damit der Bürger den Hinweis lesen kann.
  setTimeout(() => {
    window.location.href = ue1Url;
  }, REDIRECT_DELAY_MS);
}

function renderError(slot: HTMLElement, msg: string, showRetry = false) {
  slot.innerHTML = "";
  const card = document.createElement("div");
  card.className = "status-fail";
  card.innerHTML = `
    <div class="status-fail-title">Verarbeitung fehlgeschlagen</div>
    <p style="margin: 0 0 0.5rem; font-size: 14px;">${msg}</p>
    <p style="margin: 0; font-size: 12.5px; color: #6b6b6b;">
      Bitte kontaktieren Sie die Sachbearbeitung unter
      <a href="mailto:beratungsstelle-senioren@stadt.wuerzburg.de">
        beratungsstelle-senioren@stadt.wuerzburg.de</a>.
    </p>
  `;
  slot.appendChild(card);

  if (showRetry) {
    const actions = document.createElement("div");
    actions.className = "actions";
    const retry = document.createElement("a");
    retry.className = "btn-secondary";
    retry.href = window.location.pathname;
    retry.textContent = "Neuen Antrag hochladen";
    actions.appendChild(retry);
    slot.appendChild(actions);
  }
}
