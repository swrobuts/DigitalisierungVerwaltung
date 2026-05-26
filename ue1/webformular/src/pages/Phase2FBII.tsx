// FB II — Bürgerschaftliches Engagement + Helferliste (1:n).
// Zwei Collapsible-Sections: Eckdaten / Helferliste.

import { useState } from "react";
import { useAntrag } from "../state/AntragContext";
import { nonEmpty, type FieldErrors } from "../lib/validation";
import { HelferTabelle } from "../components/HelferTabelle";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { t } from "../lib/i18n";


interface Props { onWeiter: () => void; onZurueck: () => void; }
type SectionId = "eck" | "helfer";

export function Phase2FBII({ onWeiter, onZurueck }: Props): JSX.Element {
  const { state, setState } = useAntrag();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [offen, setOffen] = useState<Record<SectionId, boolean>>({
    eck: true,
    helfer: false,
  });

  function update<K extends keyof typeof state.fb_ii>(key: K, value: (typeof state.fb_ii)[K]) {
    setState((s) => ({ ...s, fb_ii: { ...s.fb_ii, [key]: value } }));
  }
  function toggle(id: SectionId, next: boolean) {
    setOffen((o) => ({ ...o, [id]: next }));
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
    if (Object.keys(e).length > 0) {
      setOffen({ eck: true, helfer: offen.helfer });
    }
    return Object.keys(e).length === 0;
  }

  const eckPflichtOk =
    nonEmpty(state.fb_ii.ehrenamt_titel) &&
    Number.isFinite(parseInt(state.fb_ii.anzahl_helfer_vorjahr, 10)) &&
    Number.isFinite(parseInt(state.fb_ii.gesamt_helferstunden_vorjahr, 10));
  const eckFehler = !!(errors.ehrenamt_titel || errors.helfer || errors.stunden);

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); if (validate()) onWeiter(); }} noValidate>
      <h1>{t("fb2.titel")}</h1>
      <p className="lead">{t("fb2.lead")}</p>

      <CollapsibleSection
        nummer={1}
        titel={t("section.fb2.eck")}
        beschreibung={t("section.fb2.eck.desc")}
        status={
          eckFehler
            ? { kind: "error", label: t("status.bittepruefen") }
            : eckPflichtOk
              ? { kind: "ok", label: "3/3" }
              : { kind: "todo", label: t("status.inbearbeitung") }
        }
        open={offen.eck}
        onToggle={(o) => toggle("eck", o)}
      >
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
      </CollapsibleSection>

      <CollapsibleSection
        nummer={2}
        titel={t("fb2.helferliste")}
        beschreibung={t("section.fb2.helfer.desc")}
        status={{ kind: "info", label: t("status.optionalhier") }}
        open={offen.helfer}
        onToggle={(o) => toggle("helfer", o)}
      >
        <HelferTabelle />
      </CollapsibleSection>

      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={onZurueck}>{t("btn.zurueck")}</button>
        <button type="submit" className="btn btn-primary">{t("btn.weiter")}</button>
      </div>
    </form>
  );
}
