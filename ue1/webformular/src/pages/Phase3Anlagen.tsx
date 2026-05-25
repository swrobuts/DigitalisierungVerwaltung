// Phase 3: Anlagen + Übersicht + Submit.
// Anlagen-Slots aus konfigFor(fb).anlagen plus ggf. FB_III_VARIANTEN[v].variantenspezifische_anlagen.

import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { konfigFor, FB_III_VARIANTEN, ALL_FOERDERBEREICHE,
         type AnlagenSlot } from "@dv/foerderbereiche";
import { useAntrag } from "../state/AntragContext";
import { Progress } from "../components/Progress";
import { AnlageUpload } from "../components/AnlageUpload";
import { submitAntrag } from "../lib/submit";
import { t } from "../lib/i18n";

export function Phase3Anlagen(): JSX.Element {
  const { state, reset } = useAntrag();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Hooks vor dem early-return — sonst weicht Render zu Render die
  // Hook-Anzahl ab, sobald sich foerderbereich ändert.
  const fb = state.foerderbereich;
  const slots: AnlagenSlot[] = useMemo(() => {
    if (!fb) return [];
    const base = [...konfigFor(fb).anlagen];
    if (fb === "III" && state.fb_iii.variante) {
      base.push(...FB_III_VARIANTEN[state.fb_iii.variante].variantenspezifische_anlagen);
    }
    return base;
  }, [fb, state.fb_iii.variante]);

  if (!fb) return <Navigate to="/" replace />;

  const pflichtFehlt = slots.some(
    (s) => s.pflicht && !state.anlagen.some((a) => a.anlagentyp === s.typ),
  );

  async function onSubmit() {
    setSubmitting(true); setSubmitError(null);
    try {
      const { antragsnummer } = await submitAntrag(state);
      reset();
      navigate(`/antrag/danke/${encodeURIComponent(antragsnummer)}`);
    } catch (e) {
      setSubmitError((e as Error).message || t("fehler.submit"));
    } finally {
      setSubmitting(false);
    }
  }

  const fbKonfig = ALL_FOERDERBEREICHE[fb!];

  return (
    <>
      <Progress step={3} total={3} />
      <div className="form-wrap">
        <h1>{t("phase.3.titel")}</h1>

        <fieldset>
          <legend>{t("anlagen.titel")}</legend>
          {slots.length === 0 && <p className="feldhinweis">Für diesen Förderbereich sind keine Anlagen vorgesehen.</p>}
          {slots.map((slot) => <AnlageUpload key={slot.typ} slot={slot} />)}
        </fieldset>

        <div className="uebersicht-box">
          <h3>{t("uebersicht.titel")}</h3>
          <dl className="uebersicht-row"><dt>{t("uebersicht.foerderbereich")}</dt><dd>{fb} — {fbKonfig.label_lang}</dd></dl>
          <dl className="uebersicht-row"><dt>{t("uebersicht.antragsteller")}</dt><dd>{state.einrichtung} · {state.ansprechpartner}</dd></dl>
          <dl className="uebersicht-row"><dt>E-Mail</dt><dd>{state.email}</dd></dl>
          <dl className="uebersicht-row"><dt>IBAN</dt><dd>{state.iban}</dd></dl>
          <dl className="uebersicht-row"><dt>Anlagen</dt>
            <dd>{state.anlagen.length === 0 ? "—" :
              state.anlagen.map((a) => a.dateiname).join(", ")}</dd></dl>
        </div>

        {pflichtFehlt && <div className="alert-error">{t("fehler.anlage_pflicht")}</div>}
        {submitError && <div className="alert-error">{submitError}</div>}

        <div className="btn-row">
          <button type="button" className="btn btn-secondary"
                  onClick={() => navigate("/antrag/phase-2")}>
            {t("btn.zurueck")}
          </button>
          <button type="button" className="btn btn-primary"
                  disabled={pflichtFehlt || submitting}
                  onClick={onSubmit}>
            {submitting ? "Wird gesendet…" : t("btn.senden")}
          </button>
        </div>
      </div>
    </>
  );
}
