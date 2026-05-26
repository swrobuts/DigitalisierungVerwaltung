// FB III — 4 Varianten mit unterschiedlichen Pflichtfeldern.
// Layout:
//   1) Varianten-Auswahl als Karten oben (immer sichtbar — entscheidet, was unten kommt)
//   2) Variantenspezifischer Block als Collapsible-Section
//      mit dem Roten Akzent-Header („Variante B — Begegnungszentrum …")

import { useEffect, useState } from "react";
import { useAntrag } from "../state/AntragContext";
import { FB_III_VARIANTEN, type FbIiiVarianteId } from "@dv/foerderbereiche";
import { nonEmpty, type FieldErrors } from "../lib/validation";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { t, tx } from "../lib/i18n";

interface Props {
  onWeiter: () => void;
  onZurueck: () => void;
}

export function Phase2FBIII({ onWeiter, onZurueck }: Props): JSX.Element {
  const { state, setState } = useAntrag();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [varianteOffen, setVarianteOffen] = useState(true);

  function update<K extends keyof typeof state.fb_iii>(key: K, value: (typeof state.fb_iii)[K]) {
    setState((s) => ({ ...s, fb_iii: { ...s.fb_iii, [key]: value } }));
  }

  function waehleVariante(v: FbIiiVarianteId) {
    update("variante", v);
    // Sobald Variante gewählt → variantenspezifischer Block sichtbar auf
    setVarianteOffen(true);
  }

  function validate(): boolean {
    const e: FieldErrors = {};
    const v = state.fb_iii.variante;
    if (!v) e.variante = t("fb3.variante.fehlt");
    else if (v === "B") {
      if (!nonEmpty(state.fb_iii.b_anzahl_veranstaltungen)) e.b_veranstaltungen = t("fehler.pflicht");
      if (!nonEmpty(state.fb_iii.b_teilnehmer_senioren)) e.b_senioren = t("fehler.pflicht");
      if (!nonEmpty(state.fb_iii.b_stadtbewohner_anteil)) e.b_anteil = t("fehler.pflicht");
      else {
        const n = parseFloat(state.fb_iii.b_stadtbewohner_anteil);
        if (!Number.isFinite(n) || n < 0 || n > 1) e.b_anteil = t("fb3.B.stadtbewohner_anteil_fehler");
      }
    } else if (v === "C") {
      if (!nonEmpty(state.fb_iii.c_treffen_schwelle)) e.c_schwelle = t("fehler.pflicht");
      if (!nonEmpty(state.fb_iii.c_teilnehmer_durchschnitt)) e.c_durchschnitt = t("fehler.pflicht");
    } else if (v === "D") {
      if (!nonEmpty(state.fb_iii.d_hauptamt_name)) e.d_name = t("fehler.pflicht");
      if (!nonEmpty(state.fb_iii.d_hauptamt_stunden_woche)) e.d_woche = t("fehler.pflicht");
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // Bei Fehlern im variantenspezifischen Block immer aufklappen
  useEffect(() => {
    const hasVErr =
      !!(errors.b_veranstaltungen || errors.b_senioren || errors.b_anteil ||
         errors.c_schwelle || errors.c_durchschnitt ||
         errors.d_name || errors.d_woche);
    if (hasVErr) setVarianteOffen(true);
  }, [errors]);

  const aktVariante = state.fb_iii.variante;
  const varianteHeading = aktVariante
    ? tx("section.fb3.zusatz", {
        var: aktVariante,
        label: t(`fb3.variante.${aktVariante}`),
      })
    : t("section.fb3.zusatz.titel_warten");

  // Status-Badge für den Variante-Block
  function statusVariantenBlock() {
    if (!aktVariante) return { kind: "todo" as const, label: t("status.wartetvariante") };
    const hasErr = !!(errors.b_veranstaltungen || errors.b_senioren || errors.b_anteil ||
                     errors.c_schwelle || errors.c_durchschnitt ||
                     errors.d_name || errors.d_woche);
    if (hasErr) return { kind: "error" as const, label: t("status.bittepruefen") };
    const p = state.fb_iii;
    let ok = false;
    if (aktVariante === "A") ok = true;
    else if (aktVariante === "B") ok = !!(p.b_anzahl_veranstaltungen && p.b_teilnehmer_senioren && p.b_stadtbewohner_anteil);
    else if (aktVariante === "C") ok = !!(p.c_treffen_schwelle && p.c_teilnehmer_durchschnitt);
    else if (aktVariante === "D") ok = !!(p.d_hauptamt_name && p.d_hauptamt_stunden_woche);
    return ok
      ? { kind: "ok" as const, label: t("status.vollstaendig") }
      : { kind: "todo" as const, label: t("status.inbearbeitung") };
  }

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        if (validate()) onWeiter();
      }}
      noValidate
    >
      <h1>{t("fb3.titel")}</h1>
      <p className="lead">{t("fb3.lead")}</p>

      {/* Varianten-Wahl bleibt immer offen — das ist der Entscheidungs-Hub */}
      <fieldset>
        <legend>1 · {t("section.fb3.variante")}</legend>
        <div className="variante-grid" role="radiogroup" aria-label={t("section.fb3.variante")}>
          {(["A", "B", "C", "D"] as FbIiiVarianteId[]).map((v) => {
            const k = FB_III_VARIANTEN[v];
            const sel = aktVariante === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={sel}
                className={`variante-card${sel ? " selected" : ""}`}
                onClick={() => waehleVariante(v)}
                data-testid={`variante-${v}`}
              >
                <div className="vk-head">
                  <span className="vk-marker">VAR {v}</span>
                  <span className="vk-label">{k.label}</span>
                </div>
                {k.foerderhoechstgrenze_euro && (
                  <div className="vk-grenze">
                    {tx("fb3.foerderhoechstgrenze", {
                      eur: k.foerderhoechstgrenze_euro.toLocaleString("de-DE") + " €",
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {errors.variante && <div className="fehlermeldung">{errors.variante}</div>}
      </fieldset>

      <CollapsibleSection
        nummer={2}
        titel={varianteHeading}
        beschreibung={
          aktVariante ? t("section.fb3.zusatz.desc") : t("section.fb3.zusatz.warten")
        }
        status={statusVariantenBlock()}
        open={varianteOffen && !!aktVariante}
        onToggle={(o) => setVarianteOffen(o)}
      >
        {!aktVariante && (
          <p className="feldhinweis" style={{ margin: "0.25rem 0" }}>
            {t("section.fb3.zusatz.hint")}
          </p>
        )}

        {aktVariante === "A" && (
          <>
            <div className="form-row">
              <label htmlFor="a_anmerkung">{t("fb3.A.anmerkung")}</label>
              <textarea
                id="a_anmerkung"
                rows={3}
                value={state.fb_iii.a_anmerkung}
                onChange={(e) => update("a_anmerkung", e.target.value)}
              />
            </div>
            <p className="feldhinweis">{t("fb3.A.hinweis")}</p>
          </>
        )}

        {aktVariante === "B" && (
          <>
            <div className="form-row two-col">
              <div>
                <label htmlFor="b_veranstaltungen">
                  {t("fb3.B.veranstaltungen")} <span className="pflicht">*</span>
                </label>
                <input
                  id="b_veranstaltungen"
                  type="number"
                  min="0"
                  required
                  value={state.fb_iii.b_anzahl_veranstaltungen}
                  aria-invalid={!!errors.b_veranstaltungen}
                  onChange={(e) => update("b_anzahl_veranstaltungen", e.target.value)}
                />
                {errors.b_veranstaltungen && (
                  <div className="fehlermeldung">{errors.b_veranstaltungen}</div>
                )}
              </div>
              <div>
                <label htmlFor="b_senioren">
                  {t("fb3.B.teilnehmer_senioren")} <span className="pflicht">*</span>
                </label>
                <input
                  id="b_senioren"
                  type="number"
                  min="0"
                  required
                  value={state.fb_iii.b_teilnehmer_senioren}
                  aria-invalid={!!errors.b_senioren}
                  onChange={(e) => update("b_teilnehmer_senioren", e.target.value)}
                />
                {errors.b_senioren && <div className="fehlermeldung">{errors.b_senioren}</div>}
              </div>
            </div>
            <div className="form-row two-col">
              <div>
                <label htmlFor="b_generationen">{t("fb3.B.teilnehmer_generationen")}</label>
                <input
                  id="b_generationen"
                  type="number"
                  min="0"
                  value={state.fb_iii.b_teilnehmer_generationen}
                  onChange={(e) => update("b_teilnehmer_generationen", e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="b_anteil">
                  {t("fb3.B.stadtbewohner_anteil")} <span className="pflicht">*</span>
                </label>
                <input
                  id="b_anteil"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  required
                  value={state.fb_iii.b_stadtbewohner_anteil}
                  aria-invalid={!!errors.b_anteil}
                  onChange={(e) => update("b_stadtbewohner_anteil", e.target.value)}
                />
                {errors.b_anteil && <div className="fehlermeldung">{errors.b_anteil}</div>}
              </div>
            </div>
            <div className="form-row">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={state.fb_iii.b_quartierstreffen_teilnahme}
                  onChange={(e) => update("b_quartierstreffen_teilnahme", e.target.checked)}
                />
                <span>{t("fb3.B.quartierstreffen")}</span>
              </label>
            </div>
            {state.fb_iii.b_quartierstreffen_teilnahme && (
              <div className="form-row two-col">
                <div>
                  <label htmlFor="b_quartiere">{t("fb3.B.quartiere")}</label>
                  <input
                    id="b_quartiere"
                    type="text"
                    value={state.fb_iii.b_quartiere}
                    onChange={(e) => update("b_quartiere", e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="b_qp">{t("fb3.B.quartier_person")}</label>
                  <input
                    id="b_qp"
                    type="text"
                    value={state.fb_iii.b_quartier_person_name}
                    onChange={(e) => update("b_quartier_person_name", e.target.value)}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {aktVariante === "C" && (
          <>
            <div className="form-row two-col">
              <div>
                <label htmlFor="c_schwelle">
                  {t("fb3.C.treffen_schwelle")} <span className="pflicht">*</span>
                </label>
                <select
                  id="c_schwelle"
                  required
                  value={state.fb_iii.c_treffen_schwelle}
                  aria-invalid={!!errors.c_schwelle}
                  onChange={(e) =>
                    update(
                      "c_treffen_schwelle",
                      e.target.value as typeof state.fb_iii.c_treffen_schwelle,
                    )
                  }
                >
                  <option value="">{t("fb3.C.treffen_bittewahl")}</option>
                  <option value="GT_10">{t("fb3.C.treffen_gt10")}</option>
                  <option value="GT_20">{t("fb3.C.treffen_gt20")}</option>
                  <option value="GT_40">{t("fb3.C.treffen_gt40")}</option>
                </select>
                {errors.c_schwelle && <div className="fehlermeldung">{errors.c_schwelle}</div>}
              </div>
              <div>
                <label htmlFor="c_durchschnitt">
                  {t("fb3.C.teilnehmer_durchschnitt")} <span className="pflicht">*</span>
                </label>
                <input
                  id="c_durchschnitt"
                  type="number"
                  min="0"
                  required
                  value={state.fb_iii.c_teilnehmer_durchschnitt}
                  aria-invalid={!!errors.c_durchschnitt}
                  onChange={(e) => update("c_teilnehmer_durchschnitt", e.target.value)}
                />
                {errors.c_durchschnitt && (
                  <div className="fehlermeldung">{errors.c_durchschnitt}</div>
                )}
              </div>
            </div>
            <div className="form-row two-col">
              <div>
                <label htmlFor="c_quartier_anzahl">{t("fb3.C.quartier_anzahl")}</label>
                <input
                  id="c_quartier_anzahl"
                  type="number"
                  min="0"
                  value={state.fb_iii.c_quartierstreffen_anzahl}
                  onChange={(e) => update("c_quartierstreffen_anzahl", e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="c_quartier_koop">{t("fb3.C.quartier_kooperation")}</label>
                <input
                  id="c_quartier_koop"
                  type="text"
                  value={state.fb_iii.c_quartier_kooperation}
                  onChange={(e) => update("c_quartier_kooperation", e.target.value)}
                />
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="c_quartier_person">{t("fb3.C.quartier_person_name")}</label>
              <input
                id="c_quartier_person"
                type="text"
                value={state.fb_iii.c_quartier_person_name}
                onChange={(e) => update("c_quartier_person_name", e.target.value)}
              />
            </div>
          </>
        )}

        {aktVariante === "D" && (
          <>
            <div className="form-row">
              <label htmlFor="d_name">
                {t("fb3.D.hauptamt_name")} <span className="pflicht">*</span>
              </label>
              <input
                id="d_name"
                type="text"
                required
                value={state.fb_iii.d_hauptamt_name}
                aria-invalid={!!errors.d_name}
                onChange={(e) => update("d_hauptamt_name", e.target.value)}
              />
              {errors.d_name && <div className="fehlermeldung">{errors.d_name}</div>}
            </div>
            <div className="form-row two-col">
              <div>
                <label htmlFor="d_woche">
                  {t("fb3.D.hauptamt_stunden_woche")} <span className="pflicht">*</span>
                </label>
                <input
                  id="d_woche"
                  type="number"
                  min="0"
                  step="0.5"
                  required
                  value={state.fb_iii.d_hauptamt_stunden_woche}
                  aria-invalid={!!errors.d_woche}
                  onChange={(e) => update("d_hauptamt_stunden_woche", e.target.value)}
                />
                {errors.d_woche && <div className="fehlermeldung">{errors.d_woche}</div>}
              </div>
              <div>
                <label htmlFor="d_monat">{t("fb3.D.hauptamt_stunden_monat")}</label>
                <input
                  id="d_monat"
                  type="number"
                  min="0"
                  step="0.5"
                  value={state.fb_iii.d_hauptamt_stunden_monat}
                  onChange={(e) => update("d_hauptamt_stunden_monat", e.target.value)}
                />
              </div>
            </div>
          </>
        )}
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
