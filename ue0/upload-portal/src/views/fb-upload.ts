/**
 * FB-spezifische Upload-Page (nach FB-Wahl).
 *
 * URL-Parameter:
 *   ?fb=I|II|III|IV          Pflicht
 *   &v=A|B|C|D               Nur FB III (variantenspezifischer Anlage-Slot)
 *
 * Rendert:
 *   1. Hauptantrag-Slot (Pflicht, PDF)
 *   2. Bei FB III ohne `v`: Varianten-Auswahl (A/B/C/D) bevor Anlage-Slot kommt
 *   3. FB-spezifischer Anlage-Slot (optional / je nach Plugin)
 *   4. Submit-Button → POST /functions/v1/upload-antragspdf
 */

import {
  ALL_FOERDERBEREICHE,
  FB_III_VARIANTEN,
} from "@dv/foerderbereiche";
import type {
  FoerderbereichId,
  AnlagenSlot,
  FbIiiVarianteId,
} from "@dv/foerderbereiche";
import { einreichen } from "../lib/api";
import { createDropZone, filePreview } from "../lib/upload-zone";
import { t, tx } from "../lib/i18n";

interface RenderOpts {
  fb: FoerderbereichId;
  variante: FbIiiVarianteId | null;
  /** Navigation zu einer anderen ?-Query (für Variante-Wechsel + Status-Redirect). */
  navigate: (search: string) => void;
}

export function renderFbUpload(opts: RenderOpts): HTMLElement {
  const view = document.createElement("div");
  const fb = ALL_FOERDERBEREICHE[opts.fb];

  // ── Header mit Zurück-Link + FB-Titel ───────────────────────────
  const back = document.createElement("a");
  back.className = "back-link";
  back.href = "#";
  back.textContent = t("fbup.back");
  back.addEventListener("click", (e) => {
    e.preventDefault();
    opts.navigate("");
  });
  view.appendChild(back);

  const titel = document.createElement("h1");
  titel.className = "page-titel";
  titel.textContent = tx("fbup.heading", { fb: fb.id, label: fb.label_lang });
  view.appendChild(titel);

  const sub = document.createElement("p");
  sub.className = "page-untertitel";
  sub.textContent = t(`fb_beschreibung.${fb.id}`);
  view.appendChild(sub);

  // ── FB III: Variante-Auswahl (wenn nicht in URL) ────────────────
  if (fb.id === "III" && !opts.variante) {
    view.appendChild(renderVariantenWahl(opts.navigate));
    return view;
  }

  // ── Hauptantrag-Slot (immer Pflicht, immer PDF) ─────────────────
  let mainFile: File | null = null;
  let anlageFile: File | null = null;

  const errBox = document.createElement("div");
  errBox.className = "status-fail";
  errBox.style.display = "none";

  function showError(msg: string) {
    errBox.style.display = "block";
    errBox.innerHTML = `
      <div class="status-fail-title">${t("fbup.err_title")}</div>
      <p style="margin: 0; font-size: 13.5px;">${msg}</p>
    `;
  }

  const mainBox = buildSlot({
    nummer: 1,
    pflicht: true,
    titel: t("fbup.slot.hauptantrag"),
    pdfUrl: `https://github.com/swrobuts/DigitalisierungVerwaltung/raw/main/${fb.quelle_pdf}`,
    pdfLabel: tx("fbup.slot.hauptantrag_pdf", { fb: fb.id }),
    accept: ["application/pdf"],
    hintText: t("fbup.slot.hauptantrag_hint"),
    onFile: (f) => {
      mainFile = f;
      updateSubmit();
    },
    onError: showError,
  });
  view.appendChild(mainBox);

  // ── Anlage-Slot (FB-spezifisch) ─────────────────────────────────
  const anlageSlot = pickAnlageSlot(opts.fb, opts.variante);
  let anlageTyp: string | null = null;
  if (anlageSlot) {
    anlageTyp = anlageSlot.typ;
    const anlageBox = buildSlot({
      nummer: 2,
      pflicht: anlageSlot.pflicht,
      titel: humanAnlageTitel(anlageSlot),
      pdfUrl: null,
      pdfLabel: null,
      accept: [...anlageSlot.mime],
      hintText: anlageSlot.beschreibung,
      onFile: (f) => {
        anlageFile = f;
        updateSubmit();
      },
      onError: showError,
    });
    view.appendChild(anlageBox);
  }

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
  submitBtn.textContent = t("fbup.submit");
  actions.appendChild(submitBtn);
  submitCard.appendChild(actions);
  submitCard.appendChild(errBox);
  view.appendChild(submitCard);

  function updateSubmit() {
    const required = anlageSlot?.pflicht ? mainFile && anlageFile : !!mainFile;
    actions.style.display = required ? "flex" : "none";
    errBox.style.display = "none";
  }

  submitBtn.addEventListener("click", async () => {
    if (!mainFile) return;
    submitBtn.disabled = true;
    submitBtn.textContent = t("fbup.submit_lauft");
    errBox.style.display = "none";
    try {
      const res = await einreichen({
        datei: mainFile,
        foerderbereich: opts.fb,
        variante: opts.variante,
        anlage: anlageFile,
        anlage_typ: anlageFile ? anlageTyp : null,
      });
      opts.navigate(`?status=${encodeURIComponent(res.einreichung_id)}`);
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = t("fbup.submit");
      showError((e as Error).message);
    }
  });

  return view;
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

interface SlotOpts {
  nummer: 1 | 2;
  pflicht: boolean;
  titel: string;
  pdfUrl: string | null;
  pdfLabel: string | null;
  accept: string[];
  hintText: string;
  onFile: (f: File | null) => void;
  onError: (msg: string) => void;
}

function buildSlot(s: SlotOpts): HTMLElement {
  const box = document.createElement("div");
  // SLOT 1 = Hauptantrag (rot), SLOT 2 = Anlage (grau, egal ob Pflicht
  // oder optional — visuelle Trennung Hauptdokument vs. Begleitmaterial).
  const klassen = ["antrag-row"];
  if (s.nummer === 2) klassen.push("antrag-row-anlage");
  if (!s.pflicht) klassen.push("antrag-row-optional");
  box.className = klassen.join(" ");

  const head = document.createElement("div");
  head.className = "antrag-section-head";
  head.innerHTML = `
    <span class="antrag-section-num">${s.nummer}</span>
    <h2 class="antrag-section-title">${s.titel}</h2>
    <span class="antrag-section-badge${s.pflicht ? "" : " badge-optional"}">${s.pflicht ? t("fbup.badge.pflicht") : t("fbup.badge.optional")}</span>
  `;
  box.appendChild(head);

  if (s.pdfUrl) {
    const link = document.createElement("a");
    link.className = "pdf-link";
    link.href = s.pdfUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = `<span class="pdf-icon">PDF</span> ${s.pdfLabel}`;
    box.appendChild(link);
  }

  const previewSlot = document.createElement("div");
  box.appendChild(previewSlot);

  const zone = createDropZone({
    hint: s.hintText,
    accept: s.accept,
    onFiles: (files) => {
      const f = files[0];
      if (!f) return;
      previewSlot.innerHTML = "";
      previewSlot.appendChild(filePreview(f, () => {
        previewSlot.innerHTML = "";
        zone.style.display = "block";
        s.onFile(null);
      }));
      zone.style.display = "none";
      s.onFile(f);
    },
    onError: s.onError,
  });
  box.appendChild(zone);
  return box;
}

function pickAnlageSlot(
  fb: FoerderbereichId,
  variante: FbIiiVarianteId | null,
): AnlagenSlot | null {
  if (fb === "III" && variante) {
    return FB_III_VARIANTEN[variante].variantenspezifische_anlagen[0] ?? null;
  }
  const slots = ALL_FOERDERBEREICHE[fb].anlagen;
  return slots[0] ?? null;
}

function humanAnlageTitel(slot: AnlagenSlot): string {
  return t(`anlage.${slot.typ}`);
}

function renderVariantenWahl(navigate: (s: string) => void): HTMLElement {
  const wrap = document.createElement("div");
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3 class="card-h3">${t("variantenwahl.titel")}</h3>
    <div class="card-body">
      <p style="margin: 0 0 0.5rem; color: #555; font-size: 13.5px;">
        ${t("variantenwahl.lead")}
      </p>
    </div>
  `;
  wrap.appendChild(card);

  const grid = document.createElement("div");
  grid.className = "variante-grid";
  for (const id of ["A", "B", "C", "D"] as FbIiiVarianteId[]) {
    const v = FB_III_VARIANTEN[id];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fb-card";
    btn.innerHTML = `
      <div class="fb-card-icon" aria-hidden="true">${v.icon}</div>
      <div class="fb-card-body">
        <div class="fb-card-roman">${tx("variantenwahl.label", { id: v.id })}</div>
        <div class="fb-card-title">${v.label}</div>
        ${v.foerderhoechstgrenze_euro
          ? `<div class="fb-card-desc">${tx("variantenwahl.grenze", { eur: v.foerderhoechstgrenze_euro.toLocaleString("de-DE") + " €" })}</div>`
          : ""}
      </div>
      <div class="fb-card-arrow" aria-hidden="true">›</div>
    `;
    btn.addEventListener("click", () => navigate(`?fb=III&v=${id}`));
    grid.appendChild(btn);
  }
  wrap.appendChild(grid);
  return wrap;
}
