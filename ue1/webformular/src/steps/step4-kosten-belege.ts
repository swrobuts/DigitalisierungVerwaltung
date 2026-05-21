import type { Signal } from "../signals";
import type { FormState, BelegpositionEntry, Belegtyp } from "../types";
import { renderBelegpositionRow } from "../components/belegposition-row";
import { formatEuro } from "../format";
import { t } from "../i18n";

function uuid(): string {
  return crypto.randomUUID();
}

export function renderStep4(stateSig: Signal<FormState>): HTMLElement {
  const root = document.createElement("fieldset");
  root.dataset.section = "4";

  const legend = document.createElement("legend");
  legend.textContent = t("stepper.4.titel");
  root.appendChild(legend);

  // Räume-Frage (zwei Radio-Groups untereinander)
  root.appendChild(makeRadio(stateSig, "raeume_vorhanden", t("form.label.raeumeVorhanden")));
  root.appendChild(makeRadio(stateSig, "raeume_unentgeltlich", t("form.label.raeumeUnentgeltlich")));

  const renderTyp = (typ: Belegtyp, titel: string) => {
    const block = document.createElement("div");
    block.className = "beleg-block";

    const h3 = document.createElement("p");
    h3.className = "beleg-block-title";
    h3.textContent = titel;
    block.appendChild(h3);

    const list = document.createElement("div");
    block.appendChild(list);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "beleg-add";
    addBtn.textContent = "+ " + t("belegposition.hinzufuegen");
    addBtn.addEventListener("click", () => {
      const neu: BelegpositionEntry = {
        id: uuid(), belegtyp: typ, bezeichnung: "", betrag_euro: 0,
        file: null, file_hash: null,
      };
      stateSig.value = {
        ...stateSig.value,
        belegpositionen: [...stateSig.value.belegpositionen, neu],
      };
    });
    block.appendChild(addBtn);

    const summe = document.createElement("p");
    summe.className = "beleg-summe";
    block.appendChild(summe);

    // Keyed-Rendering: nur bei Änderung der ID-Liste (Add/Remove) die Rows neu bauen.
    // So verliert der User beim Tippen in Bezeichnung/Betrag NICHT den Cursor-Fokus.
    let lastIds = "";
    const update = () => {
      const items = stateSig.value.belegpositionen.filter((b) => b.belegtyp === typ);
      const ids = items.map((b) => b.id).join(",");
      if (ids !== lastIds) {
        list.innerHTML = "";
        for (const pos of items) {
          list.appendChild(renderBelegpositionRow({
            position: pos,
            onChange: (next) => {
              stateSig.value = {
                ...stateSig.value,
                belegpositionen: stateSig.value.belegpositionen.map((b) =>
                  b.id === pos.id ? next : b),
              };
            },
            onRemove: () => {
              stateSig.value = {
                ...stateSig.value,
                belegpositionen: stateSig.value.belegpositionen.filter((b) => b.id !== pos.id),
              };
            },
          }));
        }
        lastIds = ids;
      }
      const sum = items.reduce((s, b) => s + b.betrag_euro, 0);
      summe.textContent = `${t(`summe.${typ}`)}: ${formatEuro(sum)}`;
    };
    update();
    stateSig.subscribe(update);

    return block;
  };

  const mieteBlock = renderTyp("miete", "Miete");
  const updateMieteVis = () => {
    mieteBlock.style.display = stateSig.value.raeume_unentgeltlich === "ja" ? "none" : "block";
  };
  updateMieteVis();
  stateSig.subscribe(updateMieteVis);
  root.appendChild(mieteBlock);

  root.appendChild(renderTyp("betriebskosten", "Betriebskosten"));
  root.appendChild(renderTyp("personalkosten", "Personalkosten"));

  const total = document.createElement("p");
  total.className = "gesamt-summe";
  const updateTotal = () => {
    const sum = stateSig.value.belegpositionen.reduce((s, b) => s + b.betrag_euro, 0);
    total.textContent = `${t("summe.gesamt")}: ${formatEuro(sum)}`;
  };
  updateTotal();
  stateSig.subscribe(updateTotal);
  root.appendChild(total);

  return root;
}

function makeRadio(
  stateSig: Signal<FormState>,
  key: "raeume_vorhanden" | "raeume_unentgeltlich",
  label: string,
): HTMLElement {
  const wrap = document.createElement("fieldset");
  wrap.className = "radio-group";

  const lbl = document.createElement("legend");
  lbl.className = "radio-group-legend";
  lbl.textContent = label;
  const star = document.createElement("span");
  star.className = "pflicht";
  star.textContent = " *";
  lbl.appendChild(star);
  wrap.appendChild(lbl);

  for (const opt of ["ja", "nein"] as const) {
    const r = document.createElement("label");
    r.className = "radio-inline";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = key;
    input.value = opt;
    input.checked = stateSig.value[key] === opt;
    input.addEventListener("change", () => {
      stateSig.value = { ...stateSig.value, [key]: opt };
    });
    r.appendChild(input);
    r.appendChild(document.createTextNode(t(`form.option.${opt}`)));
    wrap.appendChild(r);
  }
  return wrap;
}
