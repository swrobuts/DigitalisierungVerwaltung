// UE1-Einstieg: Webformular-Hero, Cross-Link nach UE0, 3-Phasen-Preview,
// dann FB-Karten + Mini-Wizard. Volle Container-Breite (wahl-wrap).
//
// Sämtliche Texte i18n-fähig: Hero/Cross-Link/Phasen-Preview, FB-Beschreibungen
// und CTA via tx() mit der FB-Variable.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ALL_FOERDERBEREICHE, type FoerderbereichId } from "@dv/foerderbereiche";
import { useAntrag, initialAntragState } from "../state/AntragContext";
import { t, tx } from "../lib/i18n";

export function FBWahl(): JSX.Element {
  const navigate = useNavigate();
  const { setState, reset } = useAntrag();
  const [wizardOffen, setWizardOffen] = useState(false);
  const [wizardAntwort1, setWizardAntwort1] = useState<"neu" | "etabliert" | null>(null);
  const [wizardAntwort2, setWizardAntwort2] = useState<"ja" | "nein" | null>(null);

  function waehleFB(fb: FoerderbereichId) {
    reset();
    setState((s) => ({
      ...initialAntragState,
      ...s,
      foerderbereich: fb,
      haushaltsjahr: new Date().getFullYear(),
    }));
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
  const ids: FoerderbereichId[] = ["I", "II", "III", "IV"];

  return (
    <div className="wahl-wrap">
      {/* Hero — klar als „Webformular" gebrandet, abgesetzt vom UE0-Hero */}
      <section className="ue1-hero" aria-labelledby="ue1-hero-titel">
        <span className="ue1-hero-eyebrow">{t("hero.eyebrow")}</span>
        <h1 id="ue1-hero-titel">{t("hero.titel")}</h1>
        <p>{t("hero.beschreibung")}</p>
        <div className="ue1-pillen" aria-label={t("hero.titel")}>
          <span className="ue1-pille">{t("hero.pille.gefuehrt")}</span>
          <span className="ue1-pille">{t("hero.pille.live")}</span>
          <span className="ue1-pille">{t("hero.pille.sprachen")}</span>
          <span className="ue1-pille">{t("hero.pille.speicher")}</span>
        </div>
      </section>

      {/* Cross-Link zum UE0-Upload-Portal */}
      <div className="ue1-crosslink">
        <strong>{t("cross.titel")}</strong>
        <span>
          {t("cross.lead")}{" "}
          <a href="https://upload.butscher.cloud" target="_blank" rel="noopener noreferrer">
            {t("cross.linktext")}
          </a>
        </span>
      </div>

      {/* 3-Phasen-Preview */}
      <div className="phasen-preview" aria-label={t("phasen.preview.label")}>
        <div><span className="pp-num">1</span> {t("phasen.preview.1")}</div>
        <div><span className="pp-num">2</span> {t("phasen.preview.2")}</div>
        <div><span className="pp-num">3</span> {t("phasen.preview.3")}</div>
      </div>

      <h2 style={{ marginTop: 0 }}>{t("wahl.titel")}</h2>
      <p className="lead">{t("wahl.lead")}</p>

      <div className="fb-grid">
        {ids.map((id) => {
          const fb = ALL_FOERDERBEREICHE[id];
          return (
            <button
              key={id}
              type="button"
              className="fb-card"
              onClick={() => waehleFB(id)}
              data-testid={`fb-card-${id}`}
              aria-label={`Förderbereich ${id}: ${fb.label_lang}`}
            >
              <div className="fb-card-head">
                <span className="fb-card-marker">FB {id}</span>
                <span className="fb-card-title">{fb.label_lang}</span>
              </div>
              <p className="fb-card-desc">{t(`fb_beschreibung.${id}`)}</p>
              <div className="fb-card-cta">
                <span>{tx("fb.cta.starten", { fb: id })}</span>
                <span className="fb-card-arrow" aria-hidden="true">›</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="wizard-link-box">
        {!wizardOffen ? (
          <button
            type="button"
            className="btn btn-secondary btn-mini"
            onClick={() => setWizardOffen(true)}
          >
            {t("wahl.unsicher")}
          </button>
        ) : (
          <div className="wizard-questions">
            <h3>{t("wahl.wizard.frage1")}</h3>
            <label className="wizard-answer">
              <input
                type="radio"
                name="wiz1"
                checked={wizardAntwort1 === "neu"}
                onChange={() => setWizardAntwort1("neu")}
              />{" "}
              {t("wahl.wizard.neu")}
            </label>
            <label className="wizard-answer">
              <input
                type="radio"
                name="wiz1"
                checked={wizardAntwort1 === "etabliert"}
                onChange={() => setWizardAntwort1("etabliert")}
              />{" "}
              {t("wahl.wizard.etabliert")}
            </label>

            {wizardAntwort1 === "etabliert" && (
              <>
                <h3>{t("wahl.wizard.frage2")}</h3>
                <label className="wizard-answer">
                  <input
                    type="radio"
                    name="wiz2"
                    checked={wizardAntwort2 === "ja"}
                    onChange={() => setWizardAntwort2("ja")}
                  />{" "}
                  {t("wahl.wizard.ja")}
                </label>
                <label className="wizard-answer">
                  <input
                    type="radio"
                    name="wiz2"
                    checked={wizardAntwort2 === "nein"}
                    onChange={() => setWizardAntwort2("nein")}
                  />{" "}
                  {t("wahl.wizard.nein")}
                </label>
              </>
            )}

            {vorschlag && (
              <div className="alert-info" style={{ marginTop: "1rem" }}>
                <strong>{t("wahl.wizard.vorschlag")}:</strong> Förderbereich {vorschlag} —{" "}
                {ALL_FOERDERBEREICHE[vorschlag].label_lang}.
                <br />
                <button
                  type="button"
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
