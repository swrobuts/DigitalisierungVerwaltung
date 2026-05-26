// FB I — Aufbau niedrigschwelliger Angebote.
// Drei Collapsible-Sections: Projekt / Kosten / Drittmittel (optional).

import { useState } from "react";
import { useAntrag } from "../state/AntragContext";
import { evaluateRule, FB_I } from "@dv/foerderbereiche";
import { nonEmpty, type FieldErrors } from "../lib/validation";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { t, tx } from "../lib/i18n";

interface Props {
  onWeiter: () => void;
  onZurueck: () => void;
}

type SectionId = "projekt" | "kosten" | "dritt";

export function Phase2FBI({ onWeiter, onZurueck }: Props): JSX.Element {
  const { state, setState } = useAntrag();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [offen, setOffen] = useState<Record<SectionId, boolean>>({
    projekt: true,
    kosten: false,
    dritt: false,
  });

  function update<K extends keyof typeof state.fb_i>(key: K, value: (typeof state.fb_i)[K]) {
    setState((s) => ({ ...s, fb_i: { ...s.fb_i, [key]: value } }));
  }
  function toggle(id: SectionId, next: boolean) {
    setOffen((o) => ({ ...o, [id]: next }));
  }

  function validate(): boolean {
    const e: FieldErrors = {};
    if (!nonEmpty(state.fb_i.projekt_titel)) e.projekt_titel = t("fehler.pflicht");
    const pers = parseFloat(state.fb_i.personalkosten_euro);
    const sach = parseFloat(state.fb_i.sachkosten_euro);
    if (!Number.isFinite(pers)) e.personalkosten = t("fehler.pflicht");
    else if (!evaluateRule(FB_I.validation_rules[0]!, pers))
      e.personalkosten = FB_I.validation_rules[0]!.fehlermeldung;
    if (!Number.isFinite(sach)) e.sachkosten = t("fehler.pflicht");
    else if (!evaluateRule(FB_I.validation_rules[1]!, sach))
      e.sachkosten = FB_I.validation_rules[1]!.fehlermeldung;
    setErrors(e);
    // Sections mit Fehlern aufklappen
    if (Object.keys(e).length > 0) {
      setOffen({
        projekt: !!e.projekt_titel || offen.projekt,
        kosten: !!(e.personalkosten || e.sachkosten) || offen.kosten,
        dritt: offen.dritt,
      });
    }
    return Object.keys(e).length === 0;
  }

  function addDrittmittel() {
    update("drittmittel", [...state.fb_i.drittmittel, { geber: "", betrag_euro: "" }]);
  }
  function removeDrittmittel(idx: number) {
    update("drittmittel", state.fb_i.drittmittel.filter((_, i) => i !== idx));
  }

  // Status-Badges sind hier eher leichtgewichtig (Zähler statt
  // Format-Validierung), weil die Felder type=number/text gemischt sind.
  const projektOk = nonEmpty(state.fb_i.projekt_titel);
  const kostenOk =
    Number.isFinite(parseFloat(state.fb_i.personalkosten_euro)) &&
    Number.isFinite(parseFloat(state.fb_i.sachkosten_euro));

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        if (validate()) onWeiter();
      }}
      noValidate
    >
      <h1>{t("fb1.titel")}</h1>
      <p className="lead">{t("fb1.lead")}</p>

      <CollapsibleSection
        nummer={1}
        titel={t("section.fb1.projekt")}
        beschreibung={t("section.fb1.projekt.desc")}
        status={
          errors.projekt_titel
            ? { kind: "error", label: tx("status.fehler", { n: 1 }) }
            : projektOk
              ? { kind: "ok", label: "1/1" }
              : { kind: "todo", label: "0/1" }
        }
        open={offen.projekt}
        onToggle={(o) => toggle("projekt", o)}
      >
        <div className="form-row">
          <label htmlFor="projekt_titel">
            {t("fb1.projekt_titel")} <span className="pflicht">*</span>
          </label>
          <input
            id="projekt_titel"
            type="text"
            required
            value={state.fb_i.projekt_titel}
            aria-invalid={!!errors.projekt_titel}
            onChange={(e) => update("projekt_titel", e.target.value)}
          />
          {errors.projekt_titel && <div className="fehlermeldung">{errors.projekt_titel}</div>}
        </div>
        <div className="form-row two-col">
          <div>
            <label htmlFor="laufzeit">{t("fb1.laufzeit")}</label>
            <input
              id="laufzeit"
              type="text"
              value={state.fb_i.laufzeit}
              placeholder="z.B. 01.01.2026 – 31.12.2026"
              onChange={(e) => update("laufzeit", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="stadtteil">{t("fb1.stadtteil")}</label>
            <input
              id="stadtteil"
              type="text"
              value={state.fb_i.stadtteil}
              onChange={(e) => update("stadtteil", e.target.value)}
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        nummer={2}
        titel={t("section.fb1.kosten")}
        beschreibung={t("section.fb1.kosten.desc")}
        status={
          errors.personalkosten || errors.sachkosten
            ? { kind: "error", label: t("status.bittepruefen") }
            : kostenOk
              ? { kind: "ok", label: "2/2" }
              : { kind: "todo", label: "0/2" }
        }
        open={offen.kosten}
        onToggle={(o) => toggle("kosten", o)}
      >
        <div className="form-row two-col">
          <div>
            <label htmlFor="personalkosten">
              {t("fb1.personalkosten")} <span className="pflicht">*</span>
            </label>
            <input
              id="personalkosten"
              type="number"
              min="0"
              step="0.01"
              required
              value={state.fb_i.personalkosten_euro}
              aria-invalid={!!errors.personalkosten}
              onChange={(e) => update("personalkosten_euro", e.target.value)}
            />
            {errors.personalkosten && (
              <div className="fehlermeldung">{errors.personalkosten}</div>
            )}
          </div>
          <div>
            <label htmlFor="sachkosten">
              {t("fb1.sachkosten")} <span className="pflicht">*</span>
            </label>
            <input
              id="sachkosten"
              type="number"
              min="0"
              step="0.01"
              required
              value={state.fb_i.sachkosten_euro}
              aria-invalid={!!errors.sachkosten}
              onChange={(e) => update("sachkosten_euro", e.target.value)}
            />
            {errors.sachkosten && <div className="fehlermeldung">{errors.sachkosten}</div>}
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        nummer={3}
        titel={t("fb1.drittmittel")}
        beschreibung={t("section.fb1.dritt.desc")}
        status={
          state.fb_i.drittmittel.length > 0
            ? { kind: "info", label: tx("status.posten", { n: state.fb_i.drittmittel.length }) }
            : { kind: "todo", label: tx("status.posten", { n: 0 }) }
        }
        open={offen.dritt}
        onToggle={(o) => toggle("dritt", o)}
      >
        {state.fb_i.drittmittel.map((dm, idx) => (
          <div key={idx} className="form-row three-col">
            <input
              type="text"
              placeholder={t("fb1.drittmittel.geber")}
              value={dm.geber}
              onChange={(e) => {
                const list = [...state.fb_i.drittmittel];
                list[idx] = { ...dm, geber: e.target.value };
                update("drittmittel", list);
              }}
            />
            <input
              type="number"
              placeholder={t("fb1.drittmittel.betrag")}
              min="0"
              step="0.01"
              value={dm.betrag_euro}
              onChange={(e) => {
                const list = [...state.fb_i.drittmittel];
                list[idx] = { ...dm, betrag_euro: e.target.value };
                update("drittmittel", list);
              }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-mini"
              onClick={() => removeDrittmittel(idx)}
              aria-label={tx("fb1.drittmittel.remove", { n: idx + 1 })}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary btn-mini"
          onClick={addDrittmittel}
        >
          {t("fb1.drittmittel.add")}
        </button>
      </CollapsibleSection>

      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={onZurueck}>
          {t("btn.zurueck")}
        </button>
        <button type="submit" className="btn btn-primary">
          {t("btn.weiter")}
        </button>
      </div>
    </form>
  );
}
