/**
 * Smart-Upload (UE0 ↔ UE3-Reifegrad-Brücke).
 *
 * Bürger lädt 1-N PDFs ohne Förderbereich-Wahl hoch. Pro PDF:
 *   1. Spinner während Klassifikations-Call zu `pruefung.butscher.cloud/api/klassifiziere-pdf`
 *   2. Ergebnis: erkannter FB + (ggf.) Variante + Konfidenz + Begründung
 *   3. Bürger kann den Vorschlag „übernehmen" oder via Dropdown korrigieren
 *   4. "Alle einreichen" → Edge-Function-Calls pro Datei (sequenziell, ein
 *      einreichung_id pro Datei) — bei nur 1 Datei → Status-Page; bei N → Liste
 *      der einreichung_ids.
 */

import {
  ALL_FOERDERBEREICHE,
  FB_III_VARIANTEN,
} from "@dv/foerderbereiche";
import type { FoerderbereichId, FbIiiVarianteId } from "@dv/foerderbereiche";
import {
  einreichen,
  klassifizierePdf,
  type KlassifikationResult,
} from "../lib/api";
import { createDropZone, filePreview } from "../lib/upload-zone";

interface SmartItem {
  id: string;
  file: File;
  /** "pending" → noch nicht klassifiziert, "done" → fertig, "err" → Klassifikation fehlgeschlagen */
  state: "pending" | "done" | "err";
  klass?: KlassifikationResult;
  /** Vom Bürger ggf. überschriebener FB + Variante (sonst gleich klass.fb / klass.variante). */
  effectiveFb: FoerderbereichId | null;
  effectiveVariante: FbIiiVarianteId | null;
  /** Wenn submitted: einreichung_id vom Backend. */
  einreichungId?: string;
  /** Fehler-Message wenn upload oder klassifikation gescheitert. */
  fehler?: string;
}

export function renderSmartUpload(navigate: (search: string) => void): HTMLElement {
  const view = document.createElement("div");

  const back = document.createElement("a");
  back.className = "back-link";
  back.href = "#";
  back.textContent = "‹ Zurück zur Förderbereich-Wahl";
  back.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("");
  });
  view.appendChild(back);

  const titel = document.createElement("h1");
  titel.className = "page-titel";
  titel.textContent = "🤖 Smart-Upload";
  view.appendChild(titel);

  const sub = document.createElement("p");
  sub.className = "page-untertitel";
  sub.textContent =
    "Laden Sie ein oder mehrere ausgefüllte Antrags-PDFs hoch. Die KI erkennt pro Datei den Förderbereich und (bei FB III) die Variante. Sie können den Vorschlag vor dem Absenden noch korrigieren.";
  view.appendChild(sub);

  const itemList = document.createElement("div");
  itemList.className = "smart-item-list";

  const items: SmartItem[] = [];

  const errBox = document.createElement("div");
  errBox.className = "status-fail";
  errBox.style.display = "none";

  function showError(msg: string) {
    errBox.style.display = "block";
    errBox.innerHTML = `<div class="status-fail-title">Hinweis</div><p style="margin:0;font-size:13.5px;">${msg}</p>`;
  }

  // ── Drop-Zone (multiple) ────────────────────────────────────────
  const zoneBox = document.createElement("div");
  zoneBox.className = "antrag-row";
  zoneBox.innerHTML = `
    <div class="antrag-section-head">
      <span class="antrag-section-num">1</span>
      <h2 class="antrag-section-title">PDFs hochladen</h2>
      <span class="antrag-section-badge">Pflicht</span>
    </div>
  `;
  zoneBox.appendChild(createDropZone({
    hint: "Mehrere PDFs gleichzeitig möglich. Pro Datei erkennt die KI Förderbereich + Variante.",
    accept: ["application/pdf"],
    multiple: true,
    onFiles: (files) => {
      for (const f of files) addItem(f);
    },
    onError: showError,
  }));
  view.appendChild(zoneBox);
  view.appendChild(itemList);
  view.appendChild(errBox);

  // ── Submit-Card ─────────────────────────────────────────────────
  const submitCard = document.createElement("div");
  submitCard.className = "card";
  submitCard.style.marginTop = "1rem";
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.style.display = "none";
  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "btn-primary";
  submitBtn.textContent = "Alle einreichen";
  actions.appendChild(submitBtn);
  submitCard.appendChild(actions);
  view.appendChild(submitCard);

  function refreshSubmitVisibility() {
    // Sichtbar, wenn mindestens 1 Item klassifiziert ist und (optional vom
    // Bürger via Korrigieren-Dropdown) einen FB hat.
    const ready = items.some((i) => i.effectiveFb !== null && !i.einreichungId);
    actions.style.display = ready ? "flex" : "none";
  }

  function renderItem(item: SmartItem): HTMLElement {
    const card = document.createElement("div");
    card.className = "smart-item";

    // Header: Dateiname + Entfernen
    const header = document.createElement("div");
    header.className = "smart-item-header";
    const name = document.createElement("strong");
    name.textContent = item.file.name;
    const size = document.createElement("span");
    size.className = "file-preview-size";
    size.textContent = ` (${(item.file.size / 1024).toFixed(0)} KB)`;
    header.append(name, size);
    if (!item.einreichungId) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "file-preview-remove";
      remove.textContent = "Entfernen";
      remove.addEventListener("click", () => removeItem(item.id));
      header.appendChild(remove);
    }
    card.appendChild(header);

    // Body je nach State
    const body = document.createElement("div");
    body.className = "smart-item-body";
    if (item.state === "pending") {
      body.innerHTML = `
        <div class="status-spinner" style="width:20px;height:20px;display:inline-block;vertical-align:middle"></div>
        <span style="margin-left:.6rem;color:#555;">Wird klassifiziert …</span>
      `;
    } else if (item.state === "err") {
      body.innerHTML = `
        <div class="status-fail-title">Klassifikation fehlgeschlagen</div>
        <p style="margin:0;font-size:13px;color:#555;">${item.fehler ?? "Unbekannter Fehler"}</p>
        <p style="margin:.4rem 0 0;font-size:13px;">Bitte wählen Sie den Förderbereich manuell:</p>
      `;
      body.appendChild(renderFbCorrectionUi(item));
    } else if (item.state === "done") {
      const k = item.klass!;
      const isLowConfidence = k.konfidenz < 0.5 || !k.fb;
      const fbLabel = item.effectiveFb
        ? `FB ${item.effectiveFb} — ${ALL_FOERDERBEREICHE[item.effectiveFb].label_kurz}`
        : "— (keine sichere Erkennung)";
      const variantLabel = item.effectiveFb === "III" && item.effectiveVariante
        ? ` · Variante ${item.effectiveVariante} (${FB_III_VARIANTEN[item.effectiveVariante].label})`
        : "";
      const konfidenz = `${Math.round(k.konfidenz * 100)} %`;
      body.innerHTML = `
        <div class="${isLowConfidence ? "status-fail" : "status-ok"}" style="padding:.8rem 1rem;">
          <div class="${isLowConfidence ? "status-fail-title" : "status-ok-title"}">
            ${isLowConfidence ? "⚠ Unsichere Erkennung" : "✓ Erkannt"}: ${fbLabel}${variantLabel}
          </div>
          <p style="margin:.3rem 0 0;font-size:13px;color:#555;">
            Konfidenz ${konfidenz} — ${escapeHtml(k.begruendung)}
          </p>
        </div>
      `;
      if (!item.einreichungId) body.appendChild(renderFbCorrectionUi(item));
      else body.innerHTML += `<p style="margin:.6rem 0 0;font-size:13px;color:#047857;">✓ Eingereicht (ID ${item.einreichungId.slice(0, 8)}…)</p>`;
    }
    card.appendChild(body);
    return card;
  }

  function renderFbCorrectionUi(item: SmartItem): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "smart-item-correction";

    const fbLabel = document.createElement("label");
    fbLabel.textContent = "Förderbereich: ";
    const fbSel = document.createElement("select");
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "— bitte wählen —";
    fbSel.appendChild(blank);
    for (const id of ["I", "II", "III", "IV"] as FoerderbereichId[]) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `FB ${id} — ${ALL_FOERDERBEREICHE[id].label_lang}`;
      if (item.effectiveFb === id) opt.selected = true;
      fbSel.appendChild(opt);
    }
    fbLabel.appendChild(fbSel);
    wrap.appendChild(fbLabel);

    // Varianten-Select (nur FB III) — initial gemäß effectiveFb sichtbar/versteckt
    const vLabel = document.createElement("label");
    vLabel.style.marginLeft = "1rem";
    vLabel.textContent = "Variante: ";
    const vSel = document.createElement("select");
    const vBlank = document.createElement("option");
    vBlank.value = "";
    vBlank.textContent = "— bitte wählen —";
    vSel.appendChild(vBlank);
    for (const id of ["A", "B", "C", "D"] as FbIiiVarianteId[]) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `${id} — ${FB_III_VARIANTEN[id].label}`;
      if (item.effectiveVariante === id) opt.selected = true;
      vSel.appendChild(opt);
    }
    vLabel.appendChild(vSel);
    wrap.appendChild(vLabel);
    vLabel.style.display = item.effectiveFb === "III" ? "inline" : "none";

    fbSel.addEventListener("change", () => {
      item.effectiveFb = (fbSel.value || null) as FoerderbereichId | null;
      if (item.effectiveFb !== "III") item.effectiveVariante = null;
      vLabel.style.display = item.effectiveFb === "III" ? "inline" : "none";
      rerender();
    });
    vSel.addEventListener("change", () => {
      item.effectiveVariante = (vSel.value || null) as FbIiiVarianteId | null;
      refreshSubmitVisibility();
    });

    return wrap;
  }

  function rerender() {
    itemList.innerHTML = "";
    for (const item of items) itemList.appendChild(renderItem(item));
    refreshSubmitVisibility();
  }

  function addItem(file: File) {
    const id = crypto.randomUUID();
    const item: SmartItem = {
      id,
      file,
      state: "pending",
      effectiveFb: null,
      effectiveVariante: null,
    };
    items.push(item);
    rerender();
    klassifizierePdf(file).then((k) => {
      item.klass = k;
      item.state = "done";
      // Frontend übernimmt LLM-Vorschlag als Default — Bürger kann ändern.
      item.effectiveFb = k.fb;
      item.effectiveVariante = k.fb === "III" ? k.variante : null;
      rerender();
    }).catch((err) => {
      item.state = "err";
      item.fehler = (err as Error).message;
      rerender();
    });
  }

  function removeItem(id: string) {
    const i = items.findIndex((x) => x.id === id);
    if (i >= 0) items.splice(i, 1);
    rerender();
  }

  submitBtn.addEventListener("click", async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = "Wird hochgeladen …";
    errBox.style.display = "none";

    const queue = items.filter((i) => i.effectiveFb !== null && !i.einreichungId);
    if (queue.length === 0) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Alle einreichen";
      showError("Bitte mindestens eine Datei mit gewähltem Förderbereich vorbereiten.");
      return;
    }

    for (const item of queue) {
      try {
        const res = await einreichen({
          datei: item.file,
          // Smart-Upload: erkannter_fb spiegelt den FE-Klassifizierer wider.
          // Wenn der Bürger den FB nachträglich geändert hat, ist effectiveFb der „neue" Wert
          // und wird primär als Klassifikations-Ergebnis akzeptiert; n8n kann re-validieren.
          erkannter_fb: item.effectiveFb,
          variante: item.effectiveFb === "III" ? item.effectiveVariante : null,
        });
        item.einreichungId = res.einreichung_id;
      } catch (e) {
        item.fehler = (e as Error).message;
      }
      rerender();
    }

    submitBtn.disabled = false;
    submitBtn.textContent = "Alle einreichen";

    // Single-File-Convenience: direkt zur Status-Page.
    if (queue.length === 1 && queue[0]?.einreichungId) {
      navigate(`?status=${encodeURIComponent(queue[0].einreichungId)}`);
      return;
    }
    // Multi-File: User bleibt auf der Seite, sieht pro Item den Status + Link.
    const successCount = queue.filter((i) => i.einreichungId).length;
    if (successCount > 0) {
      showError(`${successCount} von ${queue.length} Anträgen eingereicht. Klicken Sie auf eine eingereichte Datei für den Status (siehe unten).`);
      // Status-Links unter jedem erfolgreichen Item rendern
      for (const item of queue) {
        if (!item.einreichungId) continue;
        const link = document.createElement("a");
        link.href = `?status=${encodeURIComponent(item.einreichungId)}`;
        link.textContent = `Status zu „${item.file.name}" ansehen ›`;
        link.style.display = "block";
        link.style.marginTop = "0.6rem";
        link.addEventListener("click", (e) => {
          e.preventDefault();
          navigate(`?status=${encodeURIComponent(item.einreichungId!)}`);
        });
        view.appendChild(link);
      }
    }
  });

  return view;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] ?? c));
}
