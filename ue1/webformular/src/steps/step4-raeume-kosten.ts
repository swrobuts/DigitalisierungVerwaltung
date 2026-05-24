import type { Signal } from "../signals";
import type { FormState } from "../types";
import { t } from "../i18n";

/**
 * Step 4 — Räume & Kosten Vorjahr (PDF H11/H12/H13/H14/H15).
 *
 * Felder:
 *   - betriebskosten_vorjahr_euro (Pflicht, ≥ 0)
 *   - personalkosten_vorjahr_euro (Pflicht, ≥ 0)
 *   - raeume_vorhanden (Pflicht, ja|nein)
 *   - raeume_unentgeltlich (Pflicht, ja|nein)
 *   - monatliche_miete_euro (Pflicht > 0, wenn beide raeume_*='nein')
 *   - mietvertrag_file (optional Upload, sichtbar wenn Miete > 0)
 *
 * Cross-Field:
 *   raeume_vorhanden === 'nein' && raeume_unentgeltlich === 'nein'
 *     → monatliche_miete_euro > 0 Pflicht (Pflicht-Stern wird live ergänzt).
 */
export function renderStep4RaeumeKosten(stateSig: Signal<FormState>): HTMLFieldSetElement {
  const root = document.createElement("fieldset");
  root.dataset.section = "4";

  const legend = document.createElement("legend");
  legend.textContent = t("form.legend.raeume_kosten");
  root.appendChild(legend);

  const intro = document.createElement("p");
  intro.className = "field-hint";
  intro.style.marginBottom = "0.8rem";
  intro.textContent = t("form.hint.kosten_vorjahr");
  root.appendChild(intro);

  const set = (patch: Partial<FormState>) => {
    stateSig.value = { ...stateSig.value, ...patch };
  };

  // ---- Kosten-Block (Betriebskosten + Personalkosten) ----
  const kostenWrap = document.createElement("div");
  kostenWrap.className = "fields";

  kostenWrap.appendChild(
    makeMoneyInput({
      id: "betriebskosten_vorjahr_euro",
      label: t("form.label.betriebskosten"),
      required: true,
      value: stateSig.value.betriebskosten_vorjahr_euro,
      onChange: (v) => set({ betriebskosten_vorjahr_euro: v }),
    }),
  );

  const personalField = makeMoneyInput({
    id: "personalkosten_vorjahr_euro",
    label: t("form.label.personalkosten"),
    required: true,
    value: stateSig.value.personalkosten_vorjahr_euro,
    onChange: (v) => set({ personalkosten_vorjahr_euro: v }),
    hint: t("form.hint.personalkosten"),
  });
  kostenWrap.appendChild(personalField);

  root.appendChild(kostenWrap);

  // ---- Räume-Block (zwei Selects) ----
  const raeumeWrap = document.createElement("div");
  raeumeWrap.className = "fields";

  raeumeWrap.appendChild(
    makeYesNoSelect({
      id: "raeume_vorhanden",
      label: t("form.label.raeumeVorhanden"),
      value: stateSig.value.raeume_vorhanden,
      onChange: (v) => set({ raeume_vorhanden: v }),
    }),
  );
  raeumeWrap.appendChild(
    makeYesNoSelect({
      id: "raeume_unentgeltlich",
      label: t("form.label.raeumeUnentgeltlich"),
      value: stateSig.value.raeume_unentgeltlich,
      onChange: (v) => set({ raeume_unentgeltlich: v }),
    }),
  );
  root.appendChild(raeumeWrap);

  // ---- Miete-Block ----
  const mieteWrap = document.createElement("div");
  mieteWrap.className = "fields";

  const mieteField = makeMoneyInput({
    id: "monatliche_miete_euro",
    label: t("form.label.miete"),
    required: false, // dynamisch — wird vom Cross-Field-Check umgeschaltet
    value: stateSig.value.monatliche_miete_euro,
    onChange: (v) => set({ monatliche_miete_euro: v }),
    hint: t("form.hint.miete_pflicht"),
  });
  mieteWrap.appendChild(mieteField);
  root.appendChild(mieteWrap);

  // Pflicht-Stern + Fehler dynamisch — wenn beide raeume_*='nein' → Miete Pflicht.
  const mieteStar = mieteField.querySelector(".pflicht") as HTMLElement | null;
  const mieteError = document.createElement("p");
  mieteError.className = "field-error";
  mieteError.style.marginTop = "0.25rem";
  mieteField.appendChild(mieteError);

  const updateMietePflicht = () => {
    const s = stateSig.value;
    const mietePflicht = s.raeume_vorhanden === "nein" && s.raeume_unentgeltlich === "nein";
    if (mieteStar) mieteStar.style.display = mietePflicht ? "" : "none";
    if (mietePflicht && (s.monatliche_miete_euro === null || s.monatliche_miete_euro <= 0)) {
      mieteError.textContent = t("form.hint.miete_pflicht");
    } else {
      mieteError.textContent = "";
    }
  };
  updateMietePflicht();
  stateSig.subscribe(updateMietePflicht);

  // ---- Mietvertrag-Upload (nur wenn Miete > 0) ----
  const uploadWrap = document.createElement("label");
  uploadWrap.className = "full";
  const uploadLabel = document.createElement("span");
  uploadLabel.className = "field-label";
  uploadLabel.textContent = t("form.label.anlage.mietvertrag");
  uploadWrap.appendChild(uploadLabel);
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/pdf,image/*";
  uploadWrap.appendChild(fileInput);
  const uploadStatus = document.createElement("span");
  uploadStatus.className = "field-hint";
  uploadWrap.appendChild(uploadStatus);

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0] ?? null;
    if (f && f.size > 10 * 1024 * 1024) {
      alert("Datei > 10 MB nicht erlaubt");
      fileInput.value = "";
      return;
    }
    set({ mietvertrag_file: f });
  });

  const updateUploadVisibility = () => {
    const m = stateSig.value.monatliche_miete_euro;
    uploadWrap.style.display = (m !== null && m > 0) ? "" : "none";
    const f = stateSig.value.mietvertrag_file;
    uploadStatus.textContent = f
      ? `✓ ${f.name} (${(f.size / 1024).toFixed(0)} KB)`
      : "";
  };
  updateUploadVisibility();
  stateSig.subscribe(updateUploadVisibility);
  root.appendChild(uploadWrap);

  return root;
}

// --------------------- Helpers ---------------------

function makeMoneyInput(opts: {
  id: string;
  label: string;
  required: boolean;
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: string;
}): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.htmlFor = opts.id;
  wrap.className = "full";

  const lbl = document.createElement("span");
  lbl.className = "field-label";
  const txt = document.createElement("span");
  txt.textContent = opts.label;
  lbl.appendChild(txt);
  const star = document.createElement("span");
  star.className = "pflicht";
  star.textContent = " *";
  if (!opts.required) star.style.display = "none";
  lbl.appendChild(star);
  wrap.appendChild(lbl);

  const input = document.createElement("input");
  input.id = opts.id;
  input.name = opts.id;
  input.type = "number";
  input.min = "0";
  input.step = "0.01";
  input.inputMode = "decimal";
  if (opts.required) input.required = true;
  input.value = opts.value === null ? "" : String(opts.value);
  input.addEventListener("input", () => {
    if (input.value === "") {
      opts.onChange(null);
      return;
    }
    const n = Number(input.value);
    opts.onChange(Number.isFinite(n) ? n : null);
  });
  wrap.appendChild(input);

  if (opts.hint) {
    const h = document.createElement("span");
    h.className = "field-hint";
    h.textContent = opts.hint;
    wrap.appendChild(h);
  }
  return wrap;
}

function makeYesNoSelect(opts: {
  id: string;
  label: string;
  value: "ja" | "nein" | "";
  onChange: (v: "ja" | "nein" | "") => void;
}): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.htmlFor = opts.id;
  wrap.className = "full";

  const lbl = document.createElement("span");
  lbl.className = "field-label";
  const txt = document.createElement("span");
  txt.textContent = opts.label;
  lbl.appendChild(txt);
  const star = document.createElement("span");
  star.className = "pflicht";
  star.textContent = " *";
  lbl.appendChild(star);
  wrap.appendChild(lbl);

  const sel = document.createElement("select");
  sel.id = opts.id;
  sel.name = opts.id;
  sel.required = true;
  for (const [val, key] of [
    ["", "form.option.bittewaehlen"],
    ["ja", "form.option.ja"],
    ["nein", "form.option.nein"],
  ] as const) {
    const o = document.createElement("option");
    o.value = val;
    o.textContent = t(key);
    sel.appendChild(o);
  }
  sel.value = opts.value;
  sel.addEventListener("change", () => {
    const v = sel.value as "ja" | "nein" | "";
    opts.onChange(v);
  });
  wrap.appendChild(sel);
  return wrap;
}
