// Bürger landet hier zuerst: 4 Karten + Mini-Wizard für Unsichere.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ALL_FOERDERBEREICHE, type FoerderbereichId } from "@dv/foerderbereiche";
import { useAntrag, initialAntragState } from "../state/AntragContext";
import { t } from "../lib/i18n";

export function FBWahl(): JSX.Element {
  const navigate = useNavigate();
  const { setState, reset } = useAntrag();
  const [wizardOffen, setWizardOffen] = useState(false);
  const [wizardAntwort1, setWizardAntwort1] = useState<"neu" | "etabliert" | null>(null);
  const [wizardAntwort2, setWizardAntwort2] = useState<"ja" | "nein" | null>(null);

  function waehleFB(fb: FoerderbereichId) {
    // Komplett-Reset, damit alte FB-Reste den neuen Antrag nicht verschmutzen.
    reset();
    setState((s) => ({ ...initialAntragState, ...s, foerderbereich: fb,
      haushaltsjahr: new Date().getFullYear() }));
    navigate("/antrag/phase-1");
  }

  function wizardVorschlag(): FoerderbereichId | null {
    if (!wizardAntwort1) return null;
    if (wizardAntwort1 === "neu") return "I";
    if (wizardAntwort2 === "ja") return "II";
    if (wizardAntwort1 === "etabliert" && wizardAntwort2 === "nein") return "III";
    return "IV";
  }

  const vorschlag = wizardVorschlag();

  return (
    <div className="form-wrap">
      <h1>{t("wahl.titel")}</h1>
      <p className="lead">{t("wahl.lead")}</p>

      <div className="fb-grid">
        {(["I", "II", "III", "IV"] as FoerderbereichId[]).map((id) => {
          const fb = ALL_FOERDERBEREICHE[id];
          return (
            <button
              key={id}
              className="fb-card"
              onClick={() => waehleFB(id)}
              data-testid={`fb-card-${id}`}
            >
              <div className="fb-icon">{fb.icon}</div>
              <div className="fb-titel">Förderbereich {id}: {fb.label_kurz}</div>
              <div className="fb-kurz">{fb.label_lang}</div>
              <div className="fb-desc">{fb.beschreibung}</div>
            </button>
          );
        })}
      </div>

      <div className="wizard-link-box">
        {!wizardOffen ? (
          <button onClick={() => setWizardOffen(true)}>{t("wahl.unsicher")}</button>
        ) : (
          <div className="wizard-questions">
            <h3>{t("wahl.wizard.frage1")}</h3>
            <label className="wizard-answer">
              <input type="radio" name="wiz1" checked={wizardAntwort1 === "neu"}
                     onChange={() => setWizardAntwort1("neu")} /> {t("wahl.wizard.neu")}
            </label>
            <label className="wizard-answer">
              <input type="radio" name="wiz1" checked={wizardAntwort1 === "etabliert"}
                     onChange={() => setWizardAntwort1("etabliert")} /> {t("wahl.wizard.etabliert")}
            </label>

            {wizardAntwort1 === "etabliert" && (
              <>
                <h3>{t("wahl.wizard.frage2")}</h3>
                <label className="wizard-answer">
                  <input type="radio" name="wiz2" checked={wizardAntwort2 === "ja"}
                         onChange={() => setWizardAntwort2("ja")} /> {t("wahl.wizard.ja")}
                </label>
                <label className="wizard-answer">
                  <input type="radio" name="wiz2" checked={wizardAntwort2 === "nein"}
                         onChange={() => setWizardAntwort2("nein")} /> {t("wahl.wizard.nein")}
                </label>
              </>
            )}

            {vorschlag && (
              <div className="alert-info" style={{ marginTop: "1rem" }}>
                <strong>{t("wahl.wizard.vorschlag")}:</strong> Förderbereich {vorschlag} —{" "}
                {ALL_FOERDERBEREICHE[vorschlag].label_lang}.
                <br />
                <button
                  className="btn btn-primary btn-mini"
                  style={{ marginTop: ".5rem" }}
                  onClick={() => waehleFB(vorschlag)}
                >
                  {t("wahl.wizard.zumantrag")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
