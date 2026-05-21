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

export function renderBelegpositionRow(opts: RowOptions): HTMLElement {
  const row = document.createElement("div");
  row.className =
    "flex flex-wrap items-center gap-2 border border-slate-200 rounded p-2 mb-1";

  // Bezeichnung
  const bez = document.createElement("input");
  bez.placeholder = t("belegposition.bezeichnung");
  bez.value = opts.position.bezeichnung;
  bez.className =
    "flex-1 min-w-[140px] rounded border border-slate-300 px-2 py-1 text-sm";
  bez.addEventListener("input", () =>
    opts.onChange({ ...opts.position, bezeichnung: bez.value }),
  );
  row.appendChild(bez);

  // Betrag
  const betragInput = document.createElement("input");
  betragInput.placeholder = "0,00";
  betragInput.value = opts.position.betrag_euro > 0
    ? formatEuro(opts.position.betrag_euro, false)
    : "";
  betragInput.className =
    "w-32 rounded border border-slate-300 px-2 py-1 text-sm text-right";
  betragInput.addEventListener("input", () => {
    const n = parseEuro(betragInput.value);
    opts.onChange({
      ...opts.position,
      betrag_euro: Number.isNaN(n) ? 0 : n,
    });
  });
  row.appendChild(betragInput);

  const eurLabel = document.createElement("span");
  eurLabel.textContent = "€";
  eurLabel.className = "text-sm text-slate-500";
  row.appendChild(eurLabel);

  // File-Upload
  const fileBtn = document.createElement("label");
  fileBtn.className =
    "inline-flex items-center gap-1 cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/pdf,image/jpeg,image/png";
  fileInput.className = "hidden";
  const labelText = document.createElement("span");
  labelText.textContent = opts.position.file
    ? `✓ ${opts.position.file.name}`
    : t("belegposition.hochladen");
  fileBtn.appendChild(fileInput);
  fileBtn.appendChild(labelText);
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

  // Remove
  const rm = document.createElement("button");
  rm.type = "button";
  rm.textContent = "×";
  rm.className =
    "ml-auto h-7 w-7 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600";
  rm.addEventListener("click", () => opts.onRemove());
  row.appendChild(rm);

  return row;
}
