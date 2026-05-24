/**
 * Upload-Komponente. Rendert zwei optisch klar getrennte antrag-row-Boxen
 * (rot=Pflicht Hauptantrag, grau=Optional Anlage 1), darunter einen
 * gemeinsamen Submit-Block. Beide Files werden in EINEM POST an die
 * Edge Function `upload-antragspdf` gesendet (FormData: datei + anlage_1)
 * → ein gemeinsamer tracking_id.
 */

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "https://supabase.butscher.cloud";
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const ENDPOINT = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/upload-antragspdf`;

const MAX_BYTES = 10 * 1024 * 1024;

export interface SectionOpts {
  /** Nummer im Section-Header (① ②). */
  nummer: 1 | 2;
  /** Section-Titel: z.B. "Hauptantrag" / "Anlage 1 — Wochenplan". */
  sektionTitel: string;
  /** PDF-Download-URL für das amtliche Original-Dokument. */
  pdfUrl: string;
  /** Anzeige-Text des PDF-Links. */
  pdfLabel: string;
  /** Hinweis-Text unter der Drop-Zone (z.B. "Nur PDF, max. 10 MB"). */
  hint: string;
}

export interface UploadOpts {
  /** Wortlaut wie im PDF-Titel — wird im OCR-Hilfetext zitiert. */
  dokumentBeschreibung: string;
  /** Headline des Erklärungs-Cards. Default: "So funktioniert der digitale Antrag". */
  ueberschrift?: string;
  /** Pflicht-Box (Hauptantrag, rot). */
  primary: SectionOpts;
  /** Optional-Box (Anlage 1, grau). Wenn weggelassen: nur Hauptantrag-Box. */
  secondary?: SectionOpts & {
    /** FormData-Field-Name (Edge-Function-Vertrag). */
    fieldName: "anlage_1";
  };
}

export function renderUpload(
  onSuccess: (trackingId: string) => void,
  opts: UploadOpts,
): HTMLElement {
  const wrap = document.createElement("div");
  const ueberschrift = opts.ueberschrift ?? "So funktioniert der digitale Antrag";

  // ── Erklärungs-Card oben (einmalig, kompakt) ─────────────────────────
  const intro = document.createElement("div");
  intro.className = "card";
  intro.innerHTML = `
    <h3 class="card-h3">${ueberschrift}</h3>
    <div class="card-body">
      <p style="margin: 0 0 0.5rem;">
        Sie haben das offizielle PDF
        (<em>${opts.dokumentBeschreibung}</em>)
        bereits ausgefüllt? Laden Sie es hier hoch.
      </p>
      <p style="margin: 0 0 0.5rem; color: #555; font-size: 13.5px;">
        Ein KI-gestützter Workflow liest die Felder automatisch aus —
        auch handschriftlich Ausgefülltes. Anschließend können Sie die
        ausgelesenen Werte im Webformular prüfen und absenden.
      </p>
      <p style="margin: 0; color: #6b6b6b; font-size: 13px;">
        Akzeptiert: PDF, max. 10 MB. Demo-PDFs zum Ausprobieren finden Sie im
        <a href="https://github.com/swrobuts/DigitalisierungVerwaltung/tree/main/ue0/demo-pdfs"
           target="_blank" rel="noopener noreferrer">Repository</a>.
      </p>
    </div>
  `;
  wrap.appendChild(intro);

  /** Baut eine Drop-Zone + PDF-Link in einer eigenen antrag-row-Box.
   *  Returnt das DOM + Getter für das aktuell ausgewählte File. */
  function buildBox(s: SectionOpts, pflicht: boolean) {
    const box = document.createElement("div");
    box.className = "antrag-row" + (pflicht ? "" : " antrag-row-optional");

    // Section-Header: nummerierter Kreis + Titel + Pflicht/Optional-Badge
    const head = document.createElement("div");
    head.className = "antrag-section-head";
    const num = document.createElement("span");
    num.className = "antrag-section-num";
    num.textContent = String(s.nummer);
    const title = document.createElement("h2");
    title.className = "antrag-section-title";
    title.textContent = s.sektionTitel;
    const badge = document.createElement("span");
    badge.className = "antrag-section-badge" + (pflicht ? "" : " badge-optional");
    badge.textContent = pflicht ? "Pflicht" : "Optional";
    head.append(num, title, badge);
    box.appendChild(head);

    // PDF-Download-Link
    const link = document.createElement("a");
    link.className = "pdf-link";
    link.href = s.pdfUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = `<span class="pdf-icon">PDF</span> ${s.pdfLabel}`;
    box.appendChild(link);

    // Datei-Vorschau-Slot + Drop-Zone
    const previewSlot = document.createElement("div");
    box.appendChild(previewSlot);

    const zone = document.createElement("label");
    zone.className = "upload-zone";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/pdf";

    const icon = document.createElement("div");
    icon.className = "upload-zone-icon";
    icon.textContent = "📄";
    const text = document.createElement("div");
    text.className = "upload-zone-text";
    text.textContent = "PDF hierher ziehen oder klicken zum Auswählen";
    const btn = document.createElement("span");
    btn.className = "upload-zone-btn";
    btn.textContent = "Datei auswählen";
    const hintEl = document.createElement("div");
    hintEl.className = "upload-zone-hint";
    hintEl.textContent = s.hint;
    zone.append(icon, text, btn, hintEl, fileInput);
    box.appendChild(zone);

    let selectedFile: File | null = null;
    let afterChange: () => void = () => {};

    function showPreview(file: File) {
      selectedFile = file;
      previewSlot.innerHTML = "";
      const prev = document.createElement("div");
      prev.className = "file-preview";
      const name = document.createElement("span");
      name.className = "file-preview-name";
      name.textContent = file.name;
      const size = document.createElement("span");
      size.className = "file-preview-size";
      size.textContent = `(${(file.size / 1024).toFixed(0)} KB)`;
      const remove = document.createElement("button");
      remove.className = "file-preview-remove";
      remove.type = "button";
      remove.textContent = "Entfernen";
      remove.addEventListener("click", () => {
        selectedFile = null;
        previewSlot.innerHTML = "";
        zone.style.display = "block";
        fileInput.value = "";
        afterChange();
      });
      const left = document.createElement("span");
      left.appendChild(name);
      left.appendChild(size);
      prev.appendChild(left);
      prev.appendChild(remove);
      previewSlot.appendChild(prev);
      zone.style.display = "none";
      afterChange();
    }

    function validateAndPreview(file: File) {
      if (file.type !== "application/pdf") {
        showError(`Nur PDF erlaubt — diese Datei ist ${file.type || "unbekannt"}.`);
        return;
      }
      if (file.size > MAX_BYTES) {
        showError(`Datei zu groß: ${(file.size / 1024 / 1024).toFixed(1)} MB (max 10 MB).`);
        return;
      }
      showPreview(file);
    }

    fileInput.addEventListener("change", () => {
      const f = fileInput.files?.[0];
      if (f) validateAndPreview(f);
    });
    ["dragenter", "dragover"].forEach((ev) => {
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        zone.classList.add("drag-active");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        zone.classList.remove("drag-active");
      });
    });
    zone.addEventListener("drop", (e) => {
      const dt = (e as DragEvent).dataTransfer;
      const f = dt?.files?.[0];
      if (f) validateAndPreview(f);
    });

    return {
      element: box,
      get file() { return selectedFile; },
      onChange(cb: () => void) { afterChange = cb; },
    };
  }

  // ── Box 1: Hauptantrag (rot, Pflicht) ────────────────────────────────
  const primary = buildBox(opts.primary, true);
  wrap.appendChild(primary.element);

  // ── Box 2: Anlage 1 (grau, Optional) — nur wenn opts.secondary gesetzt ──
  let secondary: ReturnType<typeof buildBox> | null = null;
  if (opts.secondary) {
    secondary = buildBox(opts.secondary, false);
    wrap.appendChild(secondary.element);
  }

  // ── Submit-Block (eigener Card, UNTER beiden Boxen) ──────────────────
  const submitCard = document.createElement("div");
  submitCard.className = "card";
  submitCard.style.marginTop = "1rem";

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.style.display = "none";
  const submitBtn = document.createElement("button");
  submitBtn.className = "btn-primary";
  submitBtn.textContent = "Antrag absenden";
  submitBtn.type = "button";
  actions.appendChild(submitBtn);
  submitCard.appendChild(actions);

  const errBox = document.createElement("div");
  errBox.className = "status-fail";
  errBox.style.display = "none";
  errBox.style.marginTop = "1rem";
  submitCard.appendChild(errBox);

  wrap.appendChild(submitCard);

  function showError(msg: string) {
    errBox.style.display = "block";
    errBox.innerHTML = `
      <div class="status-fail-title">Fehler beim Hochladen</div>
      <p style="margin: 0; font-size: 13.5px;">${msg}</p>
    `;
  }

  function updateSubmitVisibility() {
    actions.style.display = primary.file ? "flex" : "none";
    errBox.style.display = "none";
  }
  primary.onChange(updateSubmitVisibility);
  if (secondary) secondary.onChange(updateSubmitVisibility);

  // ── Submit ────────────────────────────────────────────────────────
  submitBtn.addEventListener("click", async () => {
    if (!primary.file) return;
    if (!ANON_KEY) {
      showError(
        "Konfigurationsfehler: VITE_SUPABASE_ANON_KEY fehlt beim Build. " +
        "Bitte den Repo-Maintainer informieren.",
      );
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Wird hochgeladen …";
    errBox.style.display = "none";

    const fd = new FormData();
    fd.append("datei", primary.file);
    if (secondary?.file && opts.secondary) {
      fd.append(opts.secondary.fieldName, secondary.file);
    }

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { apikey: ANON_KEY },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.tracking_id) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onSuccess(data.tracking_id);
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Antrag absenden";
      showError((e as Error).message);
    }
  });

  return wrap;
}
