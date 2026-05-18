import type { Anlage, AnlagenTyp } from "./types";

const MAX_BYTES = 10 * 1024 * 1024;
const ANLAGEN_TYPEN: AnlagenTyp[] = [
  "programm-altentagesstaette",
  "anlage-1-kostennachweis",
  "personalkostenbelege",
  "mietvertrag",
];
const ANLAGEN_ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];

export function collectAnlagen(form: HTMLFormElement): Anlage[] {
  const anlagen: Anlage[] = [];
  for (const typ of ANLAGEN_TYPEN) {
    const input = form.querySelector<HTMLInputElement>(`input[type="file"][name="${typ}"]`);
    const file = input?.files?.[0];
    if (!file) continue;
    if (file.size > MAX_BYTES) {
      setUploadError(typ, `Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB, max. 10 MB).`);
      continue;
    }
    if (!ANLAGEN_ALLOWED_MIME.includes(file.type)) {
      setUploadError(typ, "Nur PDF, JPEG oder PNG erlaubt.");
      continue;
    }
    setUploadError(typ, "");
    anlagen.push({
      typ,
      dateiname: file.name,
      groesseBytes: file.size,
      mimeType: file.type,
      file,
    });
  }
  return anlagen;
}

function setUploadError(typ: AnlagenTyp, message: string): void {
  const target = document.querySelector<HTMLElement>(`[data-error-for="${typ}"]`);
  if (target) target.textContent = message;
}
