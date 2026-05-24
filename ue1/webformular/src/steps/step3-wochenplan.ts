import type { Signal } from "../signals";
import type { FormState, Wochentag } from "../types";
import { t } from "../i18n";

const WOCHENTAGE: Wochentag[] = ["mo","di","mi","do","fr","sa","so"];

export function renderStep3(stateSig: Signal<FormState>): HTMLElement {
  const root = document.createElement("fieldset");
  root.dataset.section = "3";

  const legend = document.createElement("legend");
  legend.textContent = t("stepper.3.titel");
  root.appendChild(legend);

  // Pflicht-Hinweis: erscheint live, wenn (noch) kein Tag vollständig ausgefüllt.
  const hint = document.createElement("p");
  hint.className = "field-hint";
  hint.style.marginBottom = "0.6rem";
  hint.textContent = t("wochenplan.hinweis");
  root.appendChild(hint);

  const updateHint = () => {
    const ok = stateSig.value.oeffnungszeiten.some(
      (o) => o.oeffnungszeit.trim().length > 0 && o.angebot.trim().length > 0,
    );
    hint.style.display = ok ? "none" : "";
  };
  updateHint();
  stateSig.subscribe(updateHint);

  const table = document.createElement("table");
  table.className = "wochenplan-table";
  const tbody = document.createElement("tbody");

  const set = (wochentag: Wochentag, patch: { oeffnungszeit?: string; angebot?: string }) => {
    const next = stateSig.value.oeffnungszeiten.map((o) =>
      o.wochentag === wochentag ? { ...o, ...patch } : o,
    );
    stateSig.value = { ...stateSig.value, oeffnungszeiten: next };
  };

  for (const tag of WOCHENTAGE) {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.className = "wp-tag";
    tdName.textContent = t(`wochenplan.tag.${tag}`);
    tr.appendChild(tdName);

    const tdZeit = document.createElement("td");
    tdZeit.className = "wp-zeit";
    const zeitInput = document.createElement("input");
    zeitInput.type = "text";
    zeitInput.placeholder = "10:00–16:00";
    zeitInput.value = stateSig.value.oeffnungszeiten.find((o) => o.wochentag === tag)?.oeffnungszeit ?? "";
    zeitInput.addEventListener("input", () => set(tag, { oeffnungszeit: zeitInput.value }));
    tdZeit.appendChild(zeitInput);
    tr.appendChild(tdZeit);

    const tdAng = document.createElement("td");
    tdAng.className = "wp-angebot";
    const angInput = document.createElement("input");
    angInput.type = "text";
    angInput.placeholder = t("wochenplan.angebot");
    angInput.value = stateSig.value.oeffnungszeiten.find((o) => o.wochentag === tag)?.angebot ?? "";
    angInput.addEventListener("input", () => set(tag, { angebot: angInput.value }));
    tdAng.appendChild(angInput);
    tr.appendChild(tdAng);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  root.appendChild(table);

  return root;
}
