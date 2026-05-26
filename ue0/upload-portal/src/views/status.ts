/**
 * Tracking-Page `/?status=<einreichung_id>`.
 * Pollt `apl.antrag_einreichung` alle 3 s. Zustände:
 *   wartend | in_verarbeitung → Spinner
 *   fertig                    → kurze Erfolgs-Card + Auto-Redirect nach UE1 (prefill)
 *   fehler                    → Fehler-Card mit Hinweis + Retry-Link
 */

import { ANON_KEY, SUPABASE_URL, UE1_BASE_URL } from "../lib/api";
import { t, tx } from "../lib/i18n";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const REDIRECT_DELAY_MS = 2000;

interface Einreichung {
  id: string;
  status: "wartend" | "in_verarbeitung" | "fertig" | "fehler";
  storage_path: string;
  dateiname: string | null;
  erkannter_fb: "I" | "II" | "III" | "IV" | null;
  eingereicht_am: string;
  verarbeitet_am: string | null;
  antrag_id: string | null;
  extrahiert_jsonb: Record<string, unknown> | null;
  fehler_text: string | null;
}

export function renderStatusView(einreichungId: string, navigate: (s: string) => void): HTMLElement {
  const wrap = document.createElement("div");

  const back = document.createElement("a");
  back.className = "back-link";
  back.href = "#";
  back.textContent = t("status.back");
  back.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("");
  });
  wrap.appendChild(back);

  const titel = document.createElement("h1");
  titel.className = "page-titel";
  titel.textContent = t("status.titel");
  wrap.appendChild(titel);

  const sub = document.createElement("p");
  sub.className = "page-untertitel";
  sub.textContent = t("status.lead");
  wrap.appendChild(sub);

  const card = document.createElement("div");
  card.className = "card";
  wrap.appendChild(card);

  const idCard = document.createElement("div");
  idCard.style.fontSize = "13px";
  idCard.style.color = "#6b6b6b";
  idCard.style.marginBottom = "0.5rem";
  idCard.innerHTML = `${t("status.tracking_id")} <code>${einreichungId}</code>`;
  card.appendChild(idCard);

  const slot = document.createElement("div");
  card.appendChild(slot);
  renderWartend(slot);

  const startedAt = Date.now();
  let stopped = false;

  async function poll() {
    if (stopped) return;
    if (!ANON_KEY) {
      renderError(slot, t("status.config_fail"));
      return;
    }
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      renderError(slot, t("status.timeout"), true);
      return;
    }

    try {
      const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/antrag_einreichung?id=eq.${encodeURIComponent(einreichungId)}&select=*`;
      const res = await fetch(url, {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          "Accept-Profile": "apl",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()) as Einreichung[];
      const row = rows[0];
      if (!row) {
        renderError(slot, tx("status.not_found", { id: einreichungId }), true);
        return;
      }

      if (row.status === "fertig") {
        stopped = true;
        renderRedirectingToUe1(slot, row);
        return;
      }
      if (row.status === "fehler") {
        stopped = true;
        renderError(slot, row.fehler_text || t("status.unknown_err"), true);
        return;
      }
      // wartend / in_verarbeitung → weiter pollen
    } catch (e) {
      console.warn("Polling-Fehler:", e);
    }

    setTimeout(poll, POLL_INTERVAL_MS);
  }

  poll();
  return wrap;
}

function renderWartend(slot: HTMLElement) {
  slot.innerHTML = `
    <div class="status-card">
      <div class="status-spinner" aria-hidden="true"></div>
      <div class="status-title">${t("status.wartend.titel")}</div>
      <div class="status-detail">${t("status.wartend.detail")}</div>
    </div>
  `;
}

function renderRedirectingToUe1(slot: HTMLElement, row: Einreichung) {
  // UE1 PrefillBootstrap erwartet `antrag_id` als Path-Param. Wenn der
  // n8n-Workflow `antrag_id` (noch) nicht gesetzt hat (Race-Condition oder
  // OCR ohne anschließenden Antrag-Insert), fallen wir auf den Einstieg zurück.
  const ue1Url = row.antrag_id
    ? `${UE1_BASE_URL}/antrag/uebernahme/${encodeURIComponent(row.antrag_id)}`
    : `${UE1_BASE_URL}/`;
  const titel = row.erkannter_fb
    ? tx("status.ok.title_fb", { fb: row.erkannter_fb })
    : t("status.ok.title");
  slot.innerHTML = `
    <div class="status-ok">
      <div class="status-ok-title">${titel}</div>
      <p style="margin: 0; font-size: 14px;">${t("status.ok.lead")}</p>
      <p style="margin: 0.8rem 0 0; font-size: 12.5px; color: #555;">
        <a href="${ue1Url}">${t("status.ok.manual")}</a>
      </p>
    </div>
  `;
  setTimeout(() => { window.location.href = ue1Url; }, REDIRECT_DELAY_MS);
}

function renderError(slot: HTMLElement, msg: string, showRetry = false) {
  slot.innerHTML = `
    <div class="status-fail">
      <div class="status-fail-title">${t("status.fail.title")}</div>
      <p style="margin: 0 0 0.5rem; font-size: 14px;">${msg}</p>
      <p style="margin: 0; font-size: 12.5px; color: #6b6b6b;">
        ${t("status.fail.kontakt")}
        <a href="mailto:seniorenarbeit@stadt.wuerzburg.de">seniorenarbeit@stadt.wuerzburg.de</a>.
      </p>
    </div>
  `;
  if (showRetry) {
    const actions = document.createElement("div");
    actions.className = "actions";
    const retry = document.createElement("a");
    retry.className = "btn-secondary";
    retry.href = window.location.pathname;
    retry.textContent = t("status.retry");
    actions.appendChild(retry);
    slot.appendChild(actions);
  }
}
