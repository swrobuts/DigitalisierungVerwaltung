// FB I — Aufbau niedrigschwelliger Angebote.

import { useState } from "react";
import { useAntrag } from "../state/AntragContext";
import { evaluateRule, FB_I } from "@dv/foerderbereiche";
import { nonEmpty, type FieldErrors } from "../lib/validation";
import { t } from "../lib/i18n";

interface Props {
  onWeiter: () => void;
  onZurueck: () => void;
}

export function Phase2FBI({ onWeiter, onZurueck }: Props): JSX.Element {
  const { state, setState } = useAntrag();
  const [errors, setErrors] = useState<FieldErrors>({});

  function update<K extends keyof typeof state.fb_i>(key: K, value: (typeof state.fb_i)[K]) {
    setState((s) => ({ ...s, fb_i: { ...s.fb_i, [key]: value } }));
  }

  function validate(): boolean {
    const e: FieldErrors = {};
    if (!nonEmpty(state.fb_i.projekt_titel)) e.projekt_titel = t("fehler.pflicht");
    const pers = parseFloat(state.fb_i.personalkosten_euro);
    const sach = parseFloat(state.fb_i.sachkosten_euro);
    if (!Number.isFinite(pers)) e.personalkosten = t("fehler.pflicht");
    else if (!evaluateRule(FB_I.validation_rules[0]!, pers)) e.personalkosten = FB_I.validation_rules[0]!.fehlermeldung;
    if (!Number.isFinite(sach)) e.sachkosten = t("fehler.pflicht");
    else if (!evaluateRule(FB_I.validation_rules[1]!, sach)) e.sachkosten = FB_I.validation_rules[1]!.fehlermeldung;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function addDrittmittel() {
    update("drittmittel", [...state.fb_i.drittmittel, { geber: "", betrag_euro: "" }]);
  }
  function removeDrittmittel(idx: number) {
    update("drittmittel", state.fb_i.drittmittel.filter((_, i) => i !== idx));
  }

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); if (validate()) onWeiter(); }} noValidate>
      <h2>{t("fb1.titel")}</h2>
      <fieldset>
        <legend>Projekt</legend>
        <div className="form-row">
          <label htmlFor="projekt_titel">{t("fb1.projekt_titel")} <span className="pflicht">*</span></label>
          <input id="projekt_titel" type="text" required value={state.fb_i.projekt_titel}
                 aria-invalid={!!errors.projekt_titel}
                 onChange={(e) => update("projekt_titel", e.target.value)} />
          {errors.projekt_titel && <div className="fehlermeldung">{errors.projekt_titel}</div>}
        </div>
        <div className="form-row two-col">
          <div>
            <label htmlFor="laufzeit">{t("fb1.laufzeit")}</label>
            <input id="laufzeit" type="text" value={state.fb_i.laufzeit}
                   placeholder="z.B. 01.01.2026 – 31.12.2026"
                   onChange={(e) => update("laufzeit", e.target.value)} />
          </div>
          <div>
            <label htmlFor="stadtteil">{t("fb1.stadtteil")}</label>
            <input id="stadtteil" type="text" value={state.fb_i.stadtteil}
                   onChange={(e) => update("stadtteil", e.target.value)} />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Kosten</legend>
        <div className="form-row two-col">
          <div>
            <label htmlFor="personalkosten">{t("fb1.personalkosten")} <span className="pflicht">*</span></label>
            <input id="personalkosten" type="number" min="0" step="0.01" required
                   value={state.fb_i.personalkosten_euro}
                   aria-invalid={!!errors.personalkosten}
                   onChange={(e) => update("personalkosten_euro", e.target.value)} />
            {errors.personalkosten && <div className="fehlermeldung">{errors.personalkosten}</div>}
          </div>
          <div>
            <label htmlFor="sachkosten">{t("fb1.sachkosten")} <span className="pflicht">*</span></label>
            <input id="sachkosten" type="number" min="0" step="0.01" required
                   value={state.fb_i.sachkosten_euro}
                   aria-invalid={!!errors.sachkosten}
                   onChange={(e) => update("sachkosten_euro", e.target.value)} />
            {errors.sachkosten && <div className="fehlermeldung">{errors.sachkosten}</div>}
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t("fb1.drittmittel")}</legend>
        {state.fb_i.drittmittel.map((dm, idx) => (
          <div key={idx} className="form-row three-col">
            <input type="text" placeholder="Geber" value={dm.geber}
                   onChange={(e) => {
                     const list = [...state.fb_i.drittmittel];
                     list[idx] = { ...dm, geber: e.target.value };
                     update("drittmittel", list);
                   }} />
            <input type="number" placeholder="Betrag €" min="0" step="0.01" value={dm.betrag_euro}
                   onChange={(e) => {
                     const list = [...state.fb_i.drittmittel];
                     list[idx] = { ...dm, betrag_euro: e.target.value };
                     update("drittmittel", list);
                   }} />
            <button type="button" className="btn btn-secondary btn-mini" onClick={() => removeDrittmittel(idx)}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-secondary btn-mini" onClick={addDrittmittel}>
          {t("fb1.drittmittel.add")}
        </button>
      </fieldset>

      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={onZurueck}>{t("btn.zurueck")}</button>
        <button type="submit" className="btn btn-primary">{t("btn.weiter")}</button>
      </div>
    </form>
  );
}
