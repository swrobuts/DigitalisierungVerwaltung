/**
 * Status-Komponente. Pollt die Supabase-REST-API alle 3 Sekunden auf
 * Änderungen in `apl2.antrag_einreichung`. Drei sichtbare Zustände:
 *
 *   wartend / in_verarbeitung → Spinner mit „Wird verarbeitet"
 *   fertig                    → Erfolgs-Card mit Antragsnummer +
 *                                Vorschau der extrahierten Daten
 *   fehler                    → Fehler-Card mit Hinweis
 */

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "https://supabase.butscher.cloud";
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

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

// Felder, die wir in der Vorschau anzeigen — Reihenfolge wie auf dem Original-PDF.
// `format` darf gesetzt sein, um den Default-Number-Formatter (de-DE 2 Nachkommastellen)
// zu überschreiben — z.B. für Jahreszahlen ("2026" statt "2.026,00").
const PREVIEW_FIELDS: Array<{ key: string; label: string; format?: (v: unknown) => string }> = [
  { key: "haushaltsjahr", label: "Haushaltsjahr", format: formatYear },
  { key: "name", label: "Name der Einrichtung" },
  { key: "traeger", label: "Träger" },
  { key: "strasse", label: "Straße / Hausnummer", format: (_) => "" },
  { key: "plz", label: "PLZ / Ort", format: (_) => "" },
  { key: "ansprechpartner", label: "Ansprechpartner/in" },
  { key: "telefon", label: "Telefon" },
  { key: "email", label: "E-Mail" },
  { key: "iban", label: "IBAN" },
  { key: "bic", label: "BIC" },
  { key: "betriebskosten_vorjahr_euro", label: "Nachgewiesene Betriebskosten Vorjahr (€)" },
  { key: "personalkosten_vorjahr_euro", label: "Nachgewiesene Personalkosten Vorjahr (€)" },
  // PDF-Wortlaut: „Monatliche Mietzahlungen in Höhe von (Kopie Mietvertrag)".
  // OCR liefert den Monatswert — Sachbearbeitung rechnet × 12 = Jahressumme
  // intern (apl2.belegposition belegtyp=miete).
  { key: "monatliche_miete_euro", label: "Monatliche Mietzahlung (€)" },
  { key: "antragsdatum", label: "Antragsdatum (lt. Bürger)" },
];

/** Geldbeträge: deutsche Notation mit 2 Nachkommastellen. */
function formatNumber(v: unknown): string {
  if (typeof v !== "number") return String(v);
  return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Jahreszahlen: 4-stellig ohne Tausender-Trennung, keine Nachkommastellen. */
function formatYear(v: unknown): string {
  if (typeof v !== "number") return String(v);
  return String(Math.trunc(v));
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
        renderFertig(slot, row);
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

function renderFertig(slot: HTMLElement, row: Einreichung) {
  slot.innerHTML = "";
  const card = document.createElement("div");
  card.className = "status-ok";

  const e = row.extrahiert_jsonb ?? {};
  const dauerMs = row.verarbeitet_am
    ? new Date(row.verarbeitet_am).getTime() - new Date(row.eingereicht_am).getTime()
    : null;
  const dauerTxt = dauerMs ? ` (${Math.round(dauerMs / 1000)} Sekunden Verarbeitungszeit)` : "";

  // Antragsnummer holen wir nicht direkt — der antrag_id-Fremdschlüssel reicht
  // als Beleg, dass der Antrag in der DB liegt.
  const antragsnummer = row.antrag_id ? row.antrag_id.slice(0, 8) + "…" : "—";

  card.innerHTML = `
    <div class="status-ok-title">✓ Antrag erfolgreich eingegangen${dauerTxt}</div>
    <p style="margin: 0; font-size: 14px;">
      Vielen Dank — Ihr Antrag wurde maschinell ausgelesen und an die Sachbearbeitung
      übergeben. Sie erhalten in den nächsten Tagen eine schriftliche Eingangs-
      bestätigung. <strong>Interne Antrag-ID: ${antragsnummer}</strong>
    </p>
    <div style="margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid rgba(0,0,0,0.08);">
      <div style="font-size: 13px; font-weight: 600; color: #047857; margin-bottom: 0.3rem;">
        Vorschau der ausgelesenen Daten
      </div>
      <p style="margin: 0 0 0.4rem; font-size: 12.5px; color: #555;">
        Bitte prüfen Sie die Werte. Sollte etwas falsch erkannt worden sein,
        kontaktieren Sie bitte die Sachbearbeitung unter
        <a href="mailto:beratungsstelle-senioren@stadt.wuerzburg.de">
          beratungsstelle-senioren@stadt.wuerzburg.de</a>.
      </p>
      <div class="extr-grid" id="extr-grid"></div>
    </div>
  `;
  slot.appendChild(card);

  const grid = card.querySelector<HTMLDivElement>("#extr-grid")!;
  for (const field of PREVIEW_FIELDS) {
    const lbl = document.createElement("div");
    lbl.className = "extr-label";
    lbl.textContent = field.label;

    const val = document.createElement("div");
    val.className = "extr-value";

    // Spezialfälle für mehrteilige Zeilen
    let raw: unknown;
    if (field.key === "strasse") {
      raw = [e.strasse, e.hausnummer].filter(Boolean).join(" ").trim() || null;
    } else if (field.key === "plz") {
      raw = [e.plz, e.ort].filter(Boolean).join(" ").trim() || null;
    } else {
      raw = (e as Record<string, unknown>)[field.key];
    }

    if (raw === null || raw === undefined || raw === "") {
      val.classList.add("empty");
      val.textContent = "— nicht erkannt";
    } else if (typeof raw === "number") {
      val.textContent = formatNumber(raw);
    } else {
      val.textContent = String(raw);
    }

    grid.appendChild(lbl);
    grid.appendChild(val);
  }

  // Aktion: zurück zur Upload-Seite
  const actions = document.createElement("div");
  actions.className = "actions";
  const back = document.createElement("a");
  back.className = "btn-secondary";
  back.href = window.location.pathname;
  back.textContent = "Weiteren Antrag einreichen";
  actions.appendChild(back);
  slot.appendChild(actions);
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
