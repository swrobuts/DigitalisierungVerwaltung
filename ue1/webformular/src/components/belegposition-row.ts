import type { BelegpositionEntry } from "../types";
import { parseEuro, formatEuro } from "../format";
import { t } from "../i18n";

async function sha256(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface RowOptions {
  /** Initialer Wert beim ersten Render. */
  position: BelegpositionEntry;
  /** Live-Getter — IMMER frischen Wert lesen, nie das stale `position`-Closure
   *  benutzen, sonst überschreibt ein späterer Field-Change einen früheren. */
  getCurrent: () => BelegpositionEntry;
  onChange: (next: BelegpositionEntry) => void;
  onRemove: () => void;
}

/**
 * Eine Beleg-Zeile im Würzburg-CI-Stil:
 *   [ Bezeichnung ............... ] [  0,00 € ] [ ⇡ Datei wählen ] [ × ]
 * Layout per CSS-Grid in `.beleg-row`.
 */
export function renderBelegpositionRow(opts: RowOptions): HTMLElement {
  const row = document.createElement("div");
  row.className = "beleg-row";

  // Bezeichnung
  const bez = document.createElement("input");
  bez.type = "text";
  bez.placeholder = t("belegposition.bezeichnung");
  bez.value = opts.position.bezeichnung;
  bez.className = "beleg-bezeichnung";
  bez.addEventListener("input", () =>
    opts.onChange({ ...opts.getCurrent(), bezeichnung: bez.value }),
  );
  row.appendChild(bez);

  // Betrag mit €-Suffix.
  // type="text" + inputmode="decimal" damit User "1.234,56" (deutsches Format)
  // tippen kann. Filter blockt alles außer Ziffern, Komma, Punkt, Whitespace, €.
  // parseEuro liefert NaN bei Unsinn → aria-invalid="true" → rote Border via CSS.
  const betragWrap = document.createElement("div");
  betragWrap.className = "beleg-betrag";
  const betragInput = document.createElement("input");
  betragInput.type = "text";
  betragInput.inputMode = "decimal";
  betragInput.placeholder = "0,00";
  betragInput.value = opts.position.betrag_euro > 0
    ? formatEuro(opts.position.betrag_euro, false)
    : "";
  betragInput.addEventListener("input", () => {
    // 1. Nicht-erlaubte Zeichen rausfiltern, Cursor-Position erhalten
    const raw = betragInput.value;
    const cleaned = raw.replace(/[^0-9.,\s€]/g, "");
    if (cleaned !== raw) {
      const caret = betragInput.selectionStart ?? cleaned.length;
      betragInput.value = cleaned;
      const newCaret = Math.max(0, caret - (raw.length - cleaned.length));
      betragInput.setSelectionRange(newCaret, newCaret);
    }
    // 2. Parse + Validation
    const n = parseEuro(betragInput.value);
    if (Number.isNaN(n)) {
      betragInput.setAttribute("aria-invalid", "true");
      opts.onChange({ ...opts.getCurrent(), betrag_euro: 0 });
    } else {
      betragInput.removeAttribute("aria-invalid");
      opts.onChange({ ...opts.getCurrent(), betrag_euro: n });
    }
  });
  betragWrap.appendChild(betragInput);
  const eur = document.createElement("span");
  eur.textContent = "€";
  betragWrap.appendChild(eur);
  row.appendChild(betragWrap);

  // File-Upload (versteckter Input in <label>)
  const fileBtn = document.createElement("label");
  fileBtn.className = "beleg-upload";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/pdf,image/jpeg,image/png";
  const lblText = document.createElement("span");
  lblText.textContent = opts.position.file
    ? "✓ " + opts.position.file.name
    : t("belegposition.hochladen");
  fileBtn.appendChild(fileInput);
  fileBtn.appendChild(lblText);
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0] ?? null;
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      alert("Datei > 10 MB nicht erlaubt");
      return;
    }
    const hash = await sha256(f);
    // DOM-Label sofort updaten (Row wird nicht neu gerendert)
    lblText.textContent = "✓ " + f.name;
    fileBtn.classList.add("has-file");
    opts.onChange({ ...opts.getCurrent(), file: f, file_hash: hash });
  });
  row.appendChild(fileBtn);

  // Entfernen
  const rm = document.createElement("button");
  rm.type = "button";
  rm.className = "beleg-remove";
  rm.textContent = "×";
  rm.title = t("belegposition.entfernen");
  rm.addEventListener("click", () => opts.onRemove());
  row.appendChild(rm);

  return row;
}
