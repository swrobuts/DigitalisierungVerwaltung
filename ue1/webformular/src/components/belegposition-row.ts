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
  position: BelegpositionEntry;
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
    opts.onChange({ ...opts.position, bezeichnung: bez.value }),
  );
  row.appendChild(bez);

  // Betrag mit €-Suffix
  const betragWrap = document.createElement("div");
  betragWrap.className = "beleg-betrag";
  const betragInput = document.createElement("input");
  betragInput.type = "text";
  betragInput.placeholder = "0,00";
  betragInput.value = opts.position.betrag_euro > 0
    ? formatEuro(opts.position.betrag_euro, false)
    : "";
  betragInput.addEventListener("input", () => {
    const n = parseEuro(betragInput.value);
    opts.onChange({
      ...opts.position,
      betrag_euro: Number.isNaN(n) ? 0 : n,
    });
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
    opts.onChange({ ...opts.position, file: f, file_hash: hash });
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
