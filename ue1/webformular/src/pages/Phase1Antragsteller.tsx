// Phase 1: gemeinsamer Antragsteller-Block für alle 4 FBs.
// Validation: nonEmpty für Pflichtfelder, Email-Regex, PLZ 5-stellig, IBAN Mod-97.

import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAntrag } from "../state/AntragContext";
import { Progress } from "../components/Progress";
import { isEmail, isPLZ, isIBAN, nonEmpty, type FieldErrors } from "../lib/validation";
import { t } from "../lib/i18n";

export function Phase1Antragsteller(): JSX.Element {
  const { state, setState } = useAntrag();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<FieldErrors>({});

  if (!state.foerderbereich) return <Navigate to="/" replace />;

  function update<K extends keyof typeof state>(key: K, value: (typeof state)[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function validate(): boolean {
    const e: FieldErrors = {};
    if (!nonEmpty(state.einrichtung)) e.einrichtung = t("fehler.pflicht");
    if (!nonEmpty(state.ansprechpartner)) e.ansprechpartner = t("fehler.pflicht");
    if (!nonEmpty(state.strasse)) e.strasse = t("fehler.pflicht");
    if (!nonEmpty(state.plz)) e.plz = t("fehler.pflicht");
    else if (!isPLZ(state.plz)) e.plz = t("fehler.plz");
    if (!nonEmpty(state.ort)) e.ort = t("fehler.pflicht");
    if (!nonEmpty(state.telefon)) e.telefon = t("fehler.pflicht");
    if (!nonEmpty(state.email)) e.email = t("fehler.pflicht");
    else if (!isEmail(state.email)) e.email = t("fehler.email");
    if (!nonEmpty(state.bankname)) e.bankname = t("fehler.pflicht");
    if (!nonEmpty(state.iban)) e.iban = t("fehler.pflicht");
    else if (!isIBAN(state.iban)) e.iban = t("fehler.iban");
    if (!nonEmpty(state.bic)) e.bic = t("fehler.pflicht");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function weiter(ev: React.FormEvent) {
    ev.preventDefault();
    if (validate()) navigate("/antrag/phase-2");
  }

  return (
    <>
      <Progress step={1} total={3} />
      <form className="form-wrap" onSubmit={weiter} noValidate>
        <h1>{t("phase.1.titel")}</h1>
        <p className="lead">Förderbereich {state.foerderbereich}</p>

        <fieldset>
          <legend>Träger</legend>
          <div className="form-row">
            <label htmlFor="dachverband">{t("antragsteller.dachverband")}</label>
            <input id="dachverband" type="text" value={state.dachverband}
                   onChange={(e) => update("dachverband", e.target.value)} />
          </div>
          <div className="form-row">
            <label htmlFor="einrichtung">{t("antragsteller.einrichtung")} <span className="pflicht">*</span></label>
            <input id="einrichtung" type="text" required value={state.einrichtung}
                   aria-invalid={!!errors.einrichtung}
                   onChange={(e) => update("einrichtung", e.target.value)} />
            {errors.einrichtung && <div className="fehlermeldung">{errors.einrichtung}</div>}
          </div>
          <div className="form-row">
            <label htmlFor="ansprechpartner">{t("antragsteller.ansprechpartner")} <span className="pflicht">*</span></label>
            <input id="ansprechpartner" type="text" required value={state.ansprechpartner}
                   aria-invalid={!!errors.ansprechpartner}
                   onChange={(e) => update("ansprechpartner", e.target.value)} />
            {errors.ansprechpartner && <div className="fehlermeldung">{errors.ansprechpartner}</div>}
          </div>
        </fieldset>

        <fieldset>
          <legend>Anschrift</legend>
          <div className="form-row two-col">
            <div>
              <label htmlFor="strasse">{t("antragsteller.strasse")} <span className="pflicht">*</span></label>
              <input id="strasse" type="text" required value={state.strasse}
                     aria-invalid={!!errors.strasse}
                     onChange={(e) => update("strasse", e.target.value)} />
              {errors.strasse && <div className="fehlermeldung">{errors.strasse}</div>}
            </div>
            <div>
              <label htmlFor="hausnummer">{t("antragsteller.hausnummer")}</label>
              <input id="hausnummer" type="text" value={state.hausnummer}
                     onChange={(e) => update("hausnummer", e.target.value)} />
            </div>
          </div>
          <div className="form-row two-col">
            <div>
              <label htmlFor="plz">{t("antragsteller.plz")} <span className="pflicht">*</span></label>
              <input id="plz" type="text" required value={state.plz}
                     inputMode="numeric" maxLength={5}
                     aria-invalid={!!errors.plz}
                     onChange={(e) => update("plz", e.target.value)} />
              {errors.plz && <div className="fehlermeldung">{errors.plz}</div>}
            </div>
            <div>
              <label htmlFor="ort">{t("antragsteller.ort")} <span className="pflicht">*</span></label>
              <input id="ort" type="text" required value={state.ort}
                     aria-invalid={!!errors.ort}
                     onChange={(e) => update("ort", e.target.value)} />
              {errors.ort && <div className="fehlermeldung">{errors.ort}</div>}
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Kontakt</legend>
          <div className="form-row two-col">
            <div>
              <label htmlFor="telefon">{t("antragsteller.telefon")} <span className="pflicht">*</span></label>
              <input id="telefon" type="tel" required value={state.telefon}
                     aria-invalid={!!errors.telefon}
                     onChange={(e) => update("telefon", e.target.value)} />
              {errors.telefon && <div className="fehlermeldung">{errors.telefon}</div>}
            </div>
            <div>
              <label htmlFor="email">{t("antragsteller.email")} <span className="pflicht">*</span></label>
              <input id="email" type="email" required value={state.email}
                     aria-invalid={!!errors.email}
                     onChange={(e) => update("email", e.target.value)} />
              {errors.email && <div className="fehlermeldung">{errors.email}</div>}
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="homepage">{t("antragsteller.homepage")}</label>
            <input id="homepage" type="url" value={state.homepage}
                   onChange={(e) => update("homepage", e.target.value)} />
          </div>
        </fieldset>

        <fieldset>
          <legend>Bankverbindung</legend>
          <div className="form-row">
            <label htmlFor="bankname">{t("antragsteller.bankname")} <span className="pflicht">*</span></label>
            <input id="bankname" type="text" required value={state.bankname}
                   aria-invalid={!!errors.bankname}
                   onChange={(e) => update("bankname", e.target.value)} />
            {errors.bankname && <div className="fehlermeldung">{errors.bankname}</div>}
          </div>
          <div className="form-row two-col">
            <div>
              <label htmlFor="iban">{t("antragsteller.iban")} <span className="pflicht">*</span></label>
              <input id="iban" type="text" required value={state.iban}
                     aria-invalid={!!errors.iban}
                     onChange={(e) => update("iban", e.target.value.toUpperCase())} />
              {errors.iban && <div className="fehlermeldung">{errors.iban}</div>}
            </div>
            <div>
              <label htmlFor="bic">{t("antragsteller.bic")} <span className="pflicht">*</span></label>
              <input id="bic" type="text" required value={state.bic}
                     aria-invalid={!!errors.bic}
                     onChange={(e) => update("bic", e.target.value.toUpperCase())} />
              {errors.bic && <div className="fehlermeldung">{errors.bic}</div>}
            </div>
          </div>
        </fieldset>

        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/")}>
            {t("btn.zurueck")}
          </button>
          <button type="submit" className="btn btn-primary">{t("btn.weiter")}</button>
        </div>
      </form>
    </>
  );
}
