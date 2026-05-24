/**
 * Upload-Komponente. Akzeptiert PDF (Drag&Drop oder Datei-Picker),
 * sendet an die Edge Function `upload-antragspdf`, ruft `onSuccess` mit
 * der zurückgegebenen tracking_id auf.
 *
 * Zwei-Datei-Modus (Final-Sweep 2026-05-24):
 *   Wenn opts.secondaryFile gesetzt ist, zeigt die Komponente ein
 *   zweites OPTIONALES Drop-Field für die Anlage (z.B. Anlage 1
 *   Wochenplan). Beide Files werden in EINEM POST gesendet
 *   (FormData-Fields `datei` + `anlage_1`).
 */

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "https://supabase.butscher.cloud";
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const ENDPOINT = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/upload-antragspdf`;

const MAX_BYTES = 10 * 1024 * 1024;

/** Optionen für renderUpload — beschreiben welches Dokument hier hochgeladen
 *  wird. Wird im Hilfetext sichtbar, damit Hauptantrag und Anlage 1
 *  textlich unterscheidbar bleiben (Bug-Fix 2026-05-24). */
export interface UploadOpts {
  /** Wortlaut wie im PDF-Titel — wird in der Erklärungs-Card zitiert. */
  dokumentBeschreibung: string;
  /** Headline-Wortlaut der Erklärungs-Card.
   *  Default: „So funktioniert der digitale Antrag". */
  ueberschrift?: string;
  /** Optionales zweites Drop-Field (gleicher Submit). Default: kein zweites Field. */
  secondaryFile?: {
    /** FormData-Field-Name (Edge-Function-Vertrag). */
    fieldName: "anlage_1";
    /** Beschriftung des Drop-Felds. */
    label: string;
    /** Sichtbarer Hinweis-Text unter dem Drop-Field. */
    hint: string;
  };
}

export function renderUpload(
  onSuccess: (trackingId: string) => void,
  opts: UploadOpts = { dokumentBeschreibung: "Antrag APL 2 — Altentagesstätten - Betriebs- und Personalkostenzuschüsse" },
): HTMLElement {
  const wrap = document.createElement("div");
  const ueberschrift = opts.ueberschrift ?? "So funktioniert der digitale Antrag";

  // Erklärungs-Card vor der Upload-Zone
  const intro = document.createElement("div");
  intro.className = "card";
  intro.innerHTML = `
    <h3 class="card-h3">${ueberschrift}</h3>
    <div class="card-body">
      <p style="margin: 0 0 0.6rem;">
        Sie haben das offizielle PDF
        (<em>${opts.dokumentBeschreibung}</em>)
        bereits ausgefüllt? Laden Sie es hier hoch.
      </p>
      <p style="margin: 0 0 0.6rem; color: #555;">
        Ein KI-gestützter Workflow liest die Felder automatisch aus —
        auch handschriftlich Ausgefülltes. Sie erhalten anschließend eine
        Eingangsbestätigung mit Ihrer Antragsnummer.
      </p>
      <p style="margin: 0; color: #6b6b6b; font-size: 13px;">
        Akzeptiert: PDF, max. 10 MB. Demo-PDFs zum Ausprobieren finden Sie im
        <a href="https://github.com/swrobuts/DigitalisierungVerwaltung/tree/main/ue0/demo-pdfs"
           target="_blank" rel="noopener noreferrer">Repository</a>.
      </p>
    </div>
  `;
  wrap.appendChild(intro);

  // Upload-Zone
  const uploadCard = document.createElement("div");
  uploadCard.className = "card";

  /** Baut eine Drop-Zone für ein File-Field. Liefert die DOM-Elemente und
   *  Methoden zum Auslesen des aktuell ausgewählten Files. */
  function buildDropZone(o: {
    label: string;
    hint: string;
    pflicht: boolean;
  }) {
    const previewSlot = document.createElement("div");

    const labelEl = document.createElement("div");
    labelEl.className = "upload-zone-label";
    labelEl.style.cssText =
      "font-weight: 600; font-size: 13px; margin: 0.4rem 0 0.3rem;";
    labelEl.textContent = o.label;

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

    const hint = document.createElement("div");
    hint.className = "upload-zone-hint";
    hint.textContent = o.hint;

    zone.append(icon, text, btn, hint, fileInput);

    let selectedFile: File | null = null;

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

    // After-change-Callback wird in der äußeren Funktion gesetzt
    let afterChange: () => void = () => {};

    return {
      labelEl,
      previewSlot,
      zone,
      get file() { return selectedFile; },
      pflicht: o.pflicht,
      onChange(cb: () => void) {
        afterChange = cb;
      },
    };
  }

  // Primäres Drop-Field (Pflicht: Hauptantrag)
  const main = buildDropZone({
    label: "Hauptantrag (Pflicht)",
    hint: "Nur PDF, max. 10 MB",
    pflicht: true,
  });
  uploadCard.appendChild(main.previewSlot);
  uploadCard.appendChild(main.labelEl);
  uploadCard.appendChild(main.zone);

  // Optionales sekundäres Drop-Field (Anlage 1)
  let secondary: ReturnType<typeof buildDropZone> | null = null;
  if (opts.secondaryFile) {
    secondary = buildDropZone({
      label: opts.secondaryFile.label,
      hint: opts.secondaryFile.hint,
      pflicht: false,
    });
    // Trenner zwischen Pflicht und Optional
    const trenner = document.createElement("div");
    trenner.style.cssText =
      "margin: 1.2rem 0 0.4rem; padding-top: 0.8rem; " +
      "border-top: 1px dashed #d0d0d0; font-size: 12px; color: #666;";
    trenner.textContent = "— optional zusätzlich —";
    uploadCard.appendChild(trenner);
    uploadCard.appendChild(secondary.previewSlot);
    uploadCard.appendChild(secondary.labelEl);
    uploadCard.appendChild(secondary.zone);
  }

  // Submit-Button (kommt erst nach Datei-Auswahl im Pflichtfeld)
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.style.display = "none";
  actions.style.marginTop = "1rem";
  const submitBtn = document.createElement("button");
  submitBtn.className = "btn-primary";
  submitBtn.textContent = "Antrag absenden";
  submitBtn.type = "button";
  actions.appendChild(submitBtn);
  uploadCard.appendChild(actions);

  // Fehler-Meldung
  const errBox = document.createElement("div");
  errBox.className = "status-fail";
  errBox.style.display = "none";
  errBox.style.marginTop = "1rem";
  uploadCard.appendChild(errBox);

  wrap.appendChild(uploadCard);

  function showError(msg: string) {
    errBox.style.display = "block";
    errBox.innerHTML = `
      <div class="status-fail-title">Fehler beim Hochladen</div>
      <p style="margin: 0; font-size: 13.5px;">${msg}</p>
    `;
  }

  function updateSubmitVisibility() {
    actions.style.display = main.file ? "flex" : "none";
    errBox.style.display = "none";
  }
  main.onChange(updateSubmitVisibility);
  if (secondary) secondary.onChange(updateSubmitVisibility);

  // ── Submit ────────────────────────────────────────────────────────
  submitBtn.addEventListener("click", async () => {
    if (!main.file) return;
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
    fd.append("datei", main.file);
    if (secondary?.file && opts.secondaryFile) {
      fd.append(opts.secondaryFile.fieldName, secondary.file);
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
