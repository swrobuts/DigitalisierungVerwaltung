/**
 * Upload-Komponente. Akzeptiert PDF (Drag&Drop oder Datei-Picker),
 * sendet an die Edge Function `upload-antragspdf`, ruft `onSuccess` mit
 * der zurückgegebenen tracking_id auf.
 */

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "https://supabase.butscher.cloud";
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const ENDPOINT = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/upload-antragspdf`;

const MAX_BYTES = 10 * 1024 * 1024;

export function renderUpload(onSuccess: (trackingId: string) => void): HTMLElement {
  const wrap = document.createElement("div");

  // Erklärungs-Card vor der Upload-Zone
  const intro = document.createElement("div");
  intro.className = "card";
  intro.innerHTML = `
    <h3 class="card-h3">So funktioniert der digitale Antrag</h3>
    <div class="card-body">
      <p style="margin: 0 0 0.6rem;">
        Sie haben das offizielle Antrags-PDF
        (<em>Antrag APL 2 — Altentagesstätten - Betriebs- und Personalkostenzuschüsse</em>)
        bereits ausgefüllt? Laden Sie es hier hoch.
      </p>
      <p style="margin: 0 0 0.6rem; color: #555;">
        Ein KI-gestützter Workflow liest die Felder automatisch aus —
        auch handschriftlich Ausgefülltes. Sie erhalten anschließend eine
        Eingangsbestätigung mit Ihrer Antragsnummer.
      </p>
      <p style="margin: 0; color: #6b6b6b; font-size: 13px;">
        Akzeptiert: PDF, max. 10 MB. Demo-Antrags-PDFs zum Ausprobieren finden Sie im
        <a href="https://github.com/swrobuts/DigitalisierungVerwaltung/tree/main/ue0/demo-pdfs"
           target="_blank" rel="noopener noreferrer">Repository</a>.
      </p>
    </div>
  `;
  wrap.appendChild(intro);

  // Upload-Zone
  const uploadCard = document.createElement("div");
  uploadCard.className = "card";

  const previewSlot = document.createElement("div");
  uploadCard.appendChild(previewSlot);

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
  hint.textContent = "Nur PDF, max. 10 MB";

  zone.append(icon, text, btn, hint, fileInput);
  uploadCard.appendChild(zone);

  // Submit-Button (kommt erst nach Datei-Auswahl)
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.style.display = "none";
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

  // ── Datei-Auswahl-Logik ────────────────────────────────────────────
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
      actions.style.display = "none";
      zone.style.display = "block";
      fileInput.value = "";
    });
    const left = document.createElement("span");
    left.appendChild(name);
    left.appendChild(size);
    prev.appendChild(left);
    prev.appendChild(remove);
    previewSlot.appendChild(prev);
    zone.style.display = "none";
    actions.style.display = "flex";
    errBox.style.display = "none";
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

  function showError(msg: string) {
    errBox.style.display = "block";
    errBox.innerHTML = `
      <div class="status-fail-title">Fehler beim Hochladen</div>
      <p style="margin: 0; font-size: 13.5px;">${msg}</p>
    `;
  }

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f) validateAndPreview(f);
  });

  // Drag&Drop
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

  // ── Submit ────────────────────────────────────────────────────────
  submitBtn.addEventListener("click", async () => {
    if (!selectedFile) return;
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
    fd.append("datei", selectedFile);

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
