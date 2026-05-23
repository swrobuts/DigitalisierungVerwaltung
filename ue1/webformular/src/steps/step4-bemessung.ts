import type { Signal } from "../signals";
import type { FormState } from "../types";
import { t } from "../i18n";

/**
 * Step 4 — Bemessungsgrundlage gem. AHP 2.3 Förderbereich III, Pkt. 2
 * (Begegnungszentren). Drei Pflichtfelder:
 *
 *   1. anzahl_teilnehmer_vorjahr     — Zahl der Teilnehmer:innen
 *      gesamt im Vorjahr
 *   2. stadtbewohner_anteil_vorjahr  — Anteil 0…1 (UI: 0…100 %) der
 *      Würzburger Stadtbewohner:innen an allen Teilnehmer:innen des
 *      Vorjahres. Bestimmt direkt den prozentualen Auszahlungsanteil
 *      gem. AHP-Wortlaut „erfolgt die Auszahlung des prozentualen
 *      Anteils".
 *   3. anzahl_veranstaltungen_vorjahr — Anzahl durchgeführter Ver-
 *      anstaltungen im Vorjahr. Geht in die Gewichtung der Zuwendung
 *      aus dem zur Verfügung stehenden Budget ein.
 *
 * UI-Konventionen:
 * - Stadt-Anteil wird als Prozentwert (0–100) eingegeben und intern
 *   auf 0…1 normiert; das spiegelt die DB-Speicherung (numeric(4,3))
 *   und die menschliche Lesart der Richtlinie.
 * - Leerer Input ⇒ null im State (NICHT 0, weil 0 ein gültiger
 *   Vorjahres-Wert ist, „noch nichts eingegeben" ist semantisch
 *   etwas anderes).
 */
export function renderStep4(stateSig: Signal<FormState>): HTMLElement {
  const root = document.createElement("fieldset");
  root.dataset.section = "4";

  const legend = document.createElement("legend");
  legend.textContent = t("stepper.4.titel");
  root.appendChild(legend);

  const hint = document.createElement("p");
  hint.className = "field-hint";
  hint.style.marginBottom = "0.8rem";
  hint.textContent = t("form.hint.bemessung");
  root.appendChild(hint);

  // Helper: konsistente Input-Erzeugung mit Label + optionalem Suffix
  const makeNumberInput = (opts: {
    id: string;
    label: string;
    min: number;
    max?: number;
    step: string;
    unit?: string;
    hint?: string;
    getValue: (s: FormState) => number | null;
    setValue: (raw: string) => void;
  }): HTMLElement => {
    const row = document.createElement("div");
    row.className = "field-row";

    const lbl = document.createElement("label");
    lbl.htmlFor = opts.id;
    lbl.textContent = opts.label;
    row.appendChild(lbl);

    const wrap = document.createElement("div");
    wrap.className = "field-input-with-unit";
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "0.4rem";

    const inp = document.createElement("input");
    inp.id = opts.id;
    inp.type = "number";
    inp.min = String(opts.min);
    if (opts.max !== undefined) inp.max = String(opts.max);
    inp.step = opts.step;
    inp.required = true;
    inp.inputMode = "decimal";
    const v = opts.getValue(stateSig.value);
    inp.value = v === null ? "" : String(v);
    inp.addEventListener("input", () => opts.setValue(inp.value));
    wrap.appendChild(inp);

    if (opts.unit) {
      const unit = document.createElement("span");
      unit.className = "field-unit";
      unit.textContent = opts.unit;
      wrap.appendChild(unit);
    }
    row.appendChild(wrap);

    if (opts.hint) {
      const h = document.createElement("p");
      h.className = "field-hint";
      h.style.marginTop = "0.25rem";
      h.textContent = opts.hint;
      row.appendChild(h);
    }
    return row;
  };

  // 1) Teilnehmer:innen gesamt (Vorjahr) — ganze Zahl
  root.appendChild(makeNumberInput({
    id: "anzahl_teilnehmer_vorjahr",
    label: t("form.label.anzahl_teilnehmer"),
    min: 0,
    step: "1",
    getValue: (s) => s.anzahl_teilnehmer_vorjahr,
    setValue: (raw) => {
      const n = raw === "" ? null : Math.max(0, Math.floor(Number(raw)));
      stateSig.value = { ...stateSig.value, anzahl_teilnehmer_vorjahr: Number.isNaN(n as number) ? null : n };
    },
  }));

  // 2) Stadtbewohner-Anteil — Prozent (0…100), intern auf 0…1
  root.appendChild(makeNumberInput({
    id: "stadtbewohner_anteil_vorjahr",
    label: t("form.label.stadt_anteil"),
    min: 0,
    max: 100,
    step: "0.1",
    unit: "%",
    hint: t("form.hint.stadt_anteil"),
    getValue: (s) =>
      s.stadtbewohner_anteil_vorjahr === null
        ? null
        : Math.round(s.stadtbewohner_anteil_vorjahr * 1000) / 10,
    setValue: (raw) => {
      if (raw === "") {
        stateSig.value = { ...stateSig.value, stadtbewohner_anteil_vorjahr: null };
        return;
      }
      const pct = Number(raw);
      if (Number.isNaN(pct)) return;
      const normiert = Math.min(1, Math.max(0, pct / 100));
      stateSig.value = { ...stateSig.value, stadtbewohner_anteil_vorjahr: normiert };
    },
  }));

  // 3) Anzahl Veranstaltungen (Vorjahr) — ganze Zahl
  root.appendChild(makeNumberInput({
    id: "anzahl_veranstaltungen_vorjahr",
    label: t("form.label.anzahl_veranstaltungen"),
    min: 0,
    step: "1",
    getValue: (s) => s.anzahl_veranstaltungen_vorjahr,
    setValue: (raw) => {
      const n = raw === "" ? null : Math.max(0, Math.floor(Number(raw)));
      stateSig.value = { ...stateSig.value, anzahl_veranstaltungen_vorjahr: Number.isNaN(n as number) ? null : n };
    },
  }));

  return root;
}
