import type { Signal } from "../signals";
import type { FormState, Wochentag } from "../types";
import { t } from "../i18n";

const WOCHENTAGE: Wochentag[] = ["mo","di","mi","do","fr","sa","so"];

export function renderStep3(stateSig: Signal<FormState>): HTMLElement {
  const root = document.createElement("section");
  root.className = "bg-white p-6 rounded-lg border border-slate-200";
  root.dataset.section = "3";

  const h = document.createElement("h2");
  h.className = "text-lg font-semibold mb-4";
  h.textContent = t("stepper.3.titel");
  root.appendChild(h);

  const hint = document.createElement("p");
  hint.className = "text-sm text-slate-500 mb-4";
  hint.textContent = t("wochenplan.hinweis");
  root.appendChild(hint);

  const table = document.createElement("table");
  table.className = "w-full text-sm";
  const tbody = document.createElement("tbody");

  const set = (wochentag: Wochentag, patch: { oeffnungszeit?: string; angebot?: string }) => {
    const next = stateSig.value.oeffnungszeiten.map((o) =>
      o.wochentag === wochentag ? { ...o, ...patch } : o,
    );
    stateSig.value = { ...stateSig.value, oeffnungszeiten: next };
  };

  for (const tag of WOCHENTAGE) {
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-100";

    const tdName = document.createElement("td");
    tdName.className = "py-2 font-medium pr-3 w-28";
    tdName.textContent = t(`wochenplan.tag.${tag}`);
    tr.appendChild(tdName);

    const tdZeit = document.createElement("td");
    tdZeit.className = "py-2 pr-3 w-40";
    const zeitInput = document.createElement("input");
    zeitInput.placeholder = "10:00–16:00";
    zeitInput.value = stateSig.value.oeffnungszeiten.find((o) => o.wochentag === tag)?.oeffnungszeit ?? "";
    zeitInput.className = "w-full rounded border border-slate-300 px-2 py-1";
    zeitInput.addEventListener("input", () => set(tag, { oeffnungszeit: zeitInput.value }));
    tdZeit.appendChild(zeitInput);
    tr.appendChild(tdZeit);

    const tdAng = document.createElement("td");
    tdAng.className = "py-2";
    const angInput = document.createElement("input");
    angInput.placeholder = t("wochenplan.angebot");
    angInput.value = stateSig.value.oeffnungszeiten.find((o) => o.wochentag === tag)?.angebot ?? "";
    angInput.className = "w-full rounded border border-slate-300 px-2 py-1";
    angInput.addEventListener("input", () => set(tag, { angebot: angInput.value }));
    tdAng.appendChild(angInput);
    tr.appendChild(tdAng);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  root.appendChild(table);

  return root;
}
