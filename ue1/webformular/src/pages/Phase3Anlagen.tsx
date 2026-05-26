// Phase 3: Anlagen-Slots + Übersicht + Submit.
// Zwei Collapsible-Sections: Anlagen / Übersicht — beide default offen,
// damit der Bürger im letzten Schritt alles auf einen Blick sieht.

import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  konfigFor,
  FB_III_VARIANTEN,
  ALL_FOERDERBEREICHE,
  type AnlagenSlot,
} from "@dv/foerderbereiche";
import { useAntrag } from "../state/AntragContext";
import { Progress } from "../components/Progress";
import { AnlageUpload } from "../components/AnlageUpload";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { submitAntrag } from "../lib/submit";
import { t, tx } from "../lib/i18n";

export function Phase3Anlagen(): JSX.Element {
  const { state, reset } = useAntrag();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Beide Sections im finalen Schritt default offen — Bürger sieht alles.
  const [anlagenOffen, setAnlagenOffen] = useState(true);
  const [uebersichtOffen, setUebersichtOffen] = useState(true);

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

  const pflichtSlots = slots.filter((s) => s.pflicht);
  const pflichtAnzahl = pflichtSlots.length;
  const pflichtOk = pflichtSlots.filter((s) =>
    state.anlagen.some((a) => a.anlagentyp === s.typ),
  ).length;
  const pflichtFehlt = pflichtOk < pflichtAnzahl;

  async function onSubmit() {
    setSubmitting(true);
    setSubmitError(null);
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

  const fbKonfig = ALL_FOERDERBEREICHE[fb];

  return (
    <>
      <Progress step={3} total={3} />
      <div className="form-wrap">
        <h1>{t("phase.3.titel")}</h1>
        <p className="lead">{t("phase.3.lead")}</p>

        <CollapsibleSection
          nummer={1}
          titel={t("anlagen.titel")}
          beschreibung={
            slots.length === 0
              ? t("section.phase3.anlagen.desc.keine")
              : pflichtAnzahl > 0
                ? tx("section.phase3.anlagen.desc.pflicht", { ok: pflichtOk, total: pflichtAnzahl })
                : t("section.phase3.anlagen.desc.optional")
          }
          status={
            slots.length === 0
              ? { kind: "info", label: t("status.keineerf") }
              : pflichtFehlt
                ? { kind: "error", label: `${pflichtOk}/${pflichtAnzahl}` }
                : { kind: "ok", label: pflichtAnzahl > 0 ? `${pflichtAnzahl}/${pflichtAnzahl}` : t("status.fertig") }
          }
          open={anlagenOffen}
          onToggle={setAnlagenOffen}
        >
          {slots.length === 0 && (
            <p className="feldhinweis">{t("section.phase3.anlagen.empty")}</p>
          )}
          {slots.map((slot) => (
            <AnlageUpload key={slot.typ} slot={slot} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection
          nummer={2}
          titel={t("uebersicht.titel")}
          beschreibung={t("section.phase3.uebersicht.desc")}
          status={{ kind: "info", label: t("status.vorabsenden") }}
          open={uebersichtOffen}
          onToggle={setUebersichtOffen}
        >
          <div className="uebersicht-box" style={{ margin: 0, border: "none", padding: 0 }}>
            <dl className="uebersicht-row">
              <dt>{t("uebersicht.foerderbereich")}</dt>
              <dd>
                {fb} — {fbKonfig.label_lang}
              </dd>
            </dl>
            <dl className="uebersicht-row">
              <dt>{t("uebersicht.antragsteller")}</dt>
              <dd>
                {state.einrichtung} · {state.ansprechpartner}
              </dd>
            </dl>
            <dl className="uebersicht-row">
              <dt>E-Mail</dt>
              <dd>{state.email}</dd>
            </dl>
            <dl className="uebersicht-row">
              <dt>IBAN</dt>
              <dd>{state.iban}</dd>
            </dl>
            <dl className="uebersicht-row">
              <dt>{t("uebersicht.anlagen")}</dt>
              <dd>
                {state.anlagen.length === 0
                  ? t("uebersicht.keine")
                  : state.anlagen.map((a) => a.dateiname).join(", ")}
              </dd>
            </dl>
          </div>
        </CollapsibleSection>

        {pflichtFehlt && slots.length > 0 && (
          <div className="alert-error">{t("fehler.anlage_pflicht")}</div>
        )}
        {submitError && <div className="alert-error">{submitError}</div>}

        <div className="btn-row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate("/antrag/phase-2")}
          >
            {t("btn.zurueck")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pflichtFehlt || submitting}
            onClick={onSubmit}
          >
            {submitting ? t("btn.senden_lauft") : t("btn.senden")}
          </button>
        </div>
      </div>
    </>
  );
}
