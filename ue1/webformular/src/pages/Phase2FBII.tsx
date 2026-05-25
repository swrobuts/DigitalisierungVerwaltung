// FB II — Bürgerschaftliches Engagement + Helferliste (1:n).

import { useState } from "react";
import { useAntrag } from "../state/AntragContext";
import { nonEmpty, type FieldErrors } from "../lib/validation";
import { HelferTabelle } from "../components/HelferTabelle";
import { t } from "../lib/i18n";

interface Props { onWeiter: () => void; onZurueck: () => void; }

export function Phase2FBII({ onWeiter, onZurueck }: Props): JSX.Element {
  const { state, setState } = useAntrag();
  const [errors, setErrors] = useState<FieldErrors>({});

  function update<K extends keyof typeof state.fb_ii>(key: K, value: (typeof state.fb_ii)[K]) {
    setState((s) => ({ ...s, fb_ii: { ...s.fb_ii, [key]: value } }));
  }

  function validate(): boolean {
    const e: FieldErrors = {};
    if (!nonEmpty(state.fb_ii.ehrenamt_titel)) e.ehrenamt_titel = t("fehler.pflicht");
    const h = parseInt(state.fb_ii.anzahl_helfer_vorjahr, 10);
    const s = parseInt(state.fb_ii.gesamt_helferstunden_vorjahr, 10);
    if (!Number.isFinite(h)) e.helfer = t("fehler.pflicht");
    else if (h < 0) e.helfer = t("fehler.negativ");
    if (!Number.isFinite(s)) e.stunden = t("fehler.pflicht");
    else if (s < 0) e.stunden = t("fehler.negativ");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); if (validate()) onWeiter(); }} noValidate>
      <h2>{t("fb2.titel")}</h2>
      <fieldset>
        <legend>Eckdaten</legend>
        <div className="form-row">
          <label htmlFor="ehrenamt_titel">{t("fb2.ehrenamt_titel")} <span className="pflicht">*</span></label>
          <input id="ehrenamt_titel" type="text" required value={state.fb_ii.ehrenamt_titel}
                 aria-invalid={!!errors.ehrenamt_titel}
                 onChange={(e) => update("ehrenamt_titel", e.target.value)} />
          {errors.ehrenamt_titel && <div className="fehlermeldung">{errors.ehrenamt_titel}</div>}
        </div>
        <div className="form-row two-col">
          <div>
            <label htmlFor="anzahl_helfer">{t("fb2.helfer_vorjahr")} <span className="pflicht">*</span></label>
            <input id="anzahl_helfer" type="number" min="0" required
                   value={state.fb_ii.anzahl_helfer_vorjahr}
                   aria-invalid={!!errors.helfer}
                   onChange={(e) => update("anzahl_helfer_vorjahr", e.target.value)} />
            {errors.helfer && <div className="fehlermeldung">{errors.helfer}</div>}
          </div>
          <div>
            <label htmlFor="helferstunden">{t("fb2.helferstunden_vorjahr")} <span className="pflicht">*</span></label>
            <input id="helferstunden" type="number" min="0" required
                   value={state.fb_ii.gesamt_helferstunden_vorjahr}
                   aria-invalid={!!errors.stunden}
                   onChange={(e) => update("gesamt_helferstunden_vorjahr", e.target.value)} />
            {errors.stunden && <div className="fehlermeldung">{errors.stunden}</div>}
          </div>
        </div>
        <div className="form-row">
          <label className="checkbox-row">
            <input type="checkbox" checked={state.fb_ii.direkter_kontakt_senioren}
                   onChange={(e) => update("direkter_kontakt_senioren", e.target.checked)} />
            <span>{t("fb2.kontakt_senioren")}</span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t("fb2.helferliste")}</legend>
        <HelferTabelle />
      </fieldset>

      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={onZurueck}>{t("btn.zurueck")}</button>
        <button type="submit" className="btn btn-primary">{t("btn.weiter")}</button>
      </div>
    </form>
  );
}
