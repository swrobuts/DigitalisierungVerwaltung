/**
 * Wiederverwendbare Drop-Zone für 1 oder N Dateien.
 * - Validiert MIME + Größe.
 * - Zeigt Datei-Preview mit Entfernen-Button.
 * - Single-File-Modus replaced bisheriges File; Multi-File-Modus appended.
 */

const MAX_BYTES = 10 * 1024 * 1024;

export interface DropZoneOpts {
  /** Sichtbarer Hilfetext unter der Zone. */
  hint: string;
  /** Akzeptierte MIME-Types. */
  accept: string[];
  /** Mehrere Dateien gleichzeitig? */
  multiple?: boolean;
  /** Callback nach Auswahl (single: 1 File / multi: alle neu gewählten). */
  onFiles: (files: File[]) => void;
  /** User-readable Anzeige eines Fehlers (z.B. zu groß / falscher MIME). */
  onError: (msg: string) => void;
}

export function createDropZone(opts: DropZoneOpts): HTMLElement {
  const zone = document.createElement("label");
  zone.className = "upload-zone";

  const input = document.createElement("input");
  input.type = "file";
  input.accept = opts.accept.join(",");
  if (opts.multiple) input.multiple = true;

  zone.innerHTML = `
    <div class="upload-zone-icon">📄</div>
    <div class="upload-zone-text">${opts.multiple
      ? "PDFs hierher ziehen oder klicken zum Auswählen (mehrere möglich)"
      : "PDF hierher ziehen oder klicken zum Auswählen"}</div>
    <span class="upload-zone-btn">${opts.multiple ? "Dateien auswählen" : "Datei auswählen"}</span>
    <div class="upload-zone-hint">${opts.hint}</div>
  `;
  zone.appendChild(input);

  function validateBatch(files: File[]) {
    const ok: File[] = [];
    for (const f of files) {
      if (!opts.accept.includes(f.type)) {
        opts.onError(`Format nicht erlaubt: ${f.name} (${f.type || "unbekannt"}). Erlaubt: ${opts.accept.join(", ")}`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        opts.onError(`Datei zu groß: ${f.name} — ${(f.size / 1024 / 1024).toFixed(1)} MB (max 10 MB).`);
        continue;
      }
      ok.push(f);
    }
    if (ok.length > 0) opts.onFiles(ok);
  }

  input.addEventListener("change", () => {
    const list = Array.from(input.files ?? []);
    if (list.length > 0) validateBatch(list);
    input.value = ""; // Reset, damit dieselbe Datei erneut wählbar ist
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
    const list = Array.from(dt?.files ?? []);
    if (list.length > 0) validateBatch(list);
  });

  return zone;
}

export function filePreview(file: File, onRemove: () => void): HTMLElement {
  const prev = document.createElement("div");
  prev.className = "file-preview";
  prev.innerHTML = `
    <span>
      <span class="file-preview-name">${file.name}</span>
      <span class="file-preview-size">(${(file.size / 1024).toFixed(0)} KB)</span>
    </span>
  `;
  const btn = document.createElement("button");
  btn.className = "file-preview-remove";
  btn.type = "button";
  btn.textContent = "Entfernen";
  btn.addEventListener("click", onRemove);
  prev.appendChild(btn);
  return prev;
}
