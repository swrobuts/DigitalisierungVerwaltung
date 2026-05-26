// FB IV — Schwerpunktförderung mit Freitext-Feldern.
// Zwei Collapsible-Sections: Vorhaben (Titel + 2 Freitexte) / Förderung & Laufzeit.

import { useState } from "react";
import { useAntrag } from "../state/AntragContext";
import { evaluateRule, FB_IV } from "@dv/foerderbereiche";
import { nonEmpty, type FieldErrors } from "../lib/validation";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { t, tx } from "../lib/i18n";

interface Props { onWeiter: () => void; onZurueck: () => void; }
type SectionId = "vorhaben" | "laufzeit";

const MAX_KURZ = 1000;

export function Phase2FBIV({ onWeiter, onZurueck }: Props): JSX.Element {
  const { state, setState } = useAntrag();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [offen, setOffen] = useState<Record<SectionId, boolean>>({
    vorhaben: true,
    laufzeit: false,
  });

  function update<K extends keyof typeof state.fb_iv>(key: K, value: (typeof state.fb_iv)[K]) {
    setState((s) => ({ ...s, fb_iv: { ...s.fb_iv, [key]: value } }));
  }
  function toggle(id: SectionId, next: boolean) {
    setOffen((o) => ({ ...o, [id]: next }));
  }

  function validate(): boolean {
    const e: FieldErrors = {};
    if (!nonEmpty(state.fb_iv.vorhaben_titel)) e.vorhaben_titel = t("fehler.pflicht");
    if (!nonEmpty(state.fb_iv.kurzbeschreibung)) e.kurz = t("fehler.pflicht");
    else if (!evaluateRule(FB_IV.validation_rules[0]!, state.fb_iv.kurzbeschreibung))
      e.kurz = FB_IV.validation_rules[0]!.fehlermeldung;
    if (!nonEmpty(state.fb_iv.geplante_massnahmen)) e.massnahmen = t("fehler.pflicht");
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setOffen({ vorhaben: true, laufzeit: offen.laufzeit });
    }
    return Object.keys(e).length === 0;
  }

  const restZeichen = MAX_KURZ - state.fb_iv.kurzbeschreibung.length;
  const vorhabenOk =
    nonEmpty(state.fb_iv.vorhaben_titel) &&
    nonEmpty(state.fb_iv.kurzbeschreibung) &&
    nonEmpty(state.fb_iv.geplante_massnahmen);
  const vorhabenFehler = !!(errors.vorhaben_titel || errors.kurz || errors.massnahmen);

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); if (validate()) onWeiter(); }} noValidate>
      <h1>{t("fb4.titel")}</h1>
      <p className="lead">{t("fb4.lead")}</p>

      <CollapsibleSection
        nummer={1}
        titel={t("section.fb4.vorhaben")}
        beschreibung={t("section.fb4.vorhaben.desc")}
        status={
          vorhabenFehler
            ? { kind: "error", label: t("status.bittepruefen") }
            : vorhabenOk
              ? { kind: "ok", label: "3/3" }
              : { kind: "todo", label: t("status.inbearbeitung") }
        }
        open={offen.vorhaben}
        onToggle={(o) => toggle("vorhaben", o)}
      >
        <div className="form-row">
          <label htmlFor="vorhaben_titel">{t("fb4.vorhaben_titel")} <span className="pflicht">*</span></label>
          <input id="vorhaben_titel" type="text" required value={state.fb_iv.vorhaben_titel}
                 aria-invalid={!!errors.vorhaben_titel}
                 onChange={(e) => update("vorhaben_titel", e.target.value)} />
          {errors.vorhaben_titel && <div className="fehlermeldung">{errors.vorhaben_titel}</div>}
        </div>
        <div className="form-row">
          <label htmlFor="kurz">{t("fb4.kurzbeschreibung")} <span className="pflicht">*</span></label>
          <textarea id="kurz" rows={5} maxLength={MAX_KURZ} required
                    value={state.fb_iv.kurzbeschreibung}
                    aria-invalid={!!errors.kurz}
                    onChange={(e) => update("kurzbeschreibung", e.target.value)} />
          <div className="zeichenzaehler">{tx("fb4.kurz_rest", { n: restZeichen })}</div>
          {errors.kurz && <div className="fehlermeldung">{errors.kurz}</div>}
        </div>
        <div className="form-row">
          <label htmlFor="massnahmen">{t("fb4.geplante_massnahmen")} <span className="pflicht">*</span></label>
          <textarea id="massnahmen" rows={5} required value={state.fb_iv.geplante_massnahmen}
                    aria-invalid={!!errors.massnahmen}
                    onChange={(e) => update("geplante_massnahmen", e.target.value)} />
          {errors.massnahmen && <div className="fehlermeldung">{errors.massnahmen}</div>}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        nummer={2}
        titel={t("section.fb4.foerderung")}
        beschreibung={t("section.fb4.foerderung.desc")}
        status={{ kind: "info", label: t("status.optional") }}
        open={offen.laufzeit}
        onToggle={(o) => toggle("laufzeit", o)}
      >
        <div className="form-row two-col">
          <div>
            <label htmlFor="summe">{t("fb4.beantragte_summe")}</label>
            <input id="summe" type="number" min="0" step="0.01"
                   value={state.fb_iv.beantragte_summe_euro}
                   onChange={(e) => update("beantragte_summe_euro", e.target.value)} />
          </div>
          <div>
            <label htmlFor="laufzeit">{t("fb4.laufzeit")}</label>
            <input id="laufzeit" type="text" value={state.fb_iv.laufzeit}
                   placeholder="z.B. 12 Monate"
                   onChange={(e) => update("laufzeit", e.target.value)} />
          </div>
        </div>
      </CollapsibleSection>

      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={onZurueck}>{t("btn.zurueck")}</button>
        <button type="submit" className="btn btn-primary">{t("btn.weiter")}</button>
      </div>
    </form>
  );
}
