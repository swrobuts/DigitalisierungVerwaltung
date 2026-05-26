// FB IV — Schwerpunktförderung (formloser Antrag).
//
// Laut Stadt Würzburg (https://www.wuerzburg.de/themen/gesundheit-soziales/
// senioren/antragswesen/index.html, Stand 2026-05-26) ist FB IV ein
// FORMLOSER Antrag — es gibt KEIN offizielles Antragsformular-PDF. Diese
// Seite hat deshalb genau eine Pflicht: der Bürger lädt sein selbst
// verfasstes formloses Antrags-PDF hoch. Vorhaben-Titel + Kurzbeschreibung
// sind optional und dienen ausschließlich als KI-Klassifikations-Hilfe
// fürs Backend-Routing (siehe docs/PDF-FELDER-AUDIT-2026-05-26.md).
//
// Drei Sections: Hinweis (info) / PDF-Upload (Pflicht) / KI-Hilfe (optional).
import { useState, type ChangeEvent } from "react";
import { useAntrag } from "../state/AntragContext";
import { evaluateRule, FB_IV } from "@dv/foerderbereiche";
import type { FieldErrors } from "../lib/validation";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { t, tx } from "../lib/i18n";

interface Props { onWeiter: () => void; onZurueck: () => void; }
type SectionId = "hinweis" | "upload" | "klassifikation";

const MAX_KURZ = 1000;
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

export function Phase2FBIV({ onWeiter, onZurueck }: Props): JSX.Element {
  const { state, setState } = useAntrag();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [offen, setOffen] = useState<Record<SectionId, boolean>>({
    hinweis: true,
    upload: true,
    klassifikation: false,
  });

  function update<K extends keyof typeof state.fb_iv>(key: K, value: (typeof state.fb_iv)[K]) {
    setState((s) => ({ ...s, fb_iv: { ...s.fb_iv, [key]: value } }));
  }
  function toggle(id: SectionId, next: boolean) {
    setOffen((o) => ({ ...o, [id]: next }));
  }

  function onFileChange(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    setErrors((e) => ({ ...e, dokument: undefined as unknown as string }));
    if (!f) return;
    if (f.type !== "application/pdf") {
      setErrors((e) => ({ ...e, dokument: t("fehler.fb4.dokument_typ") }));
      return;
    }
    if (f.size > MAX_PDF_BYTES) {
      setErrors((e) => ({ ...e, dokument: t("fehler.fb4.dokument_zu_gross") }));
      return;
    }
    setState((s) => ({
      ...s,
      fb_iv: {
        ...s.fb_iv,
        dokument_file: f,
        dokument_dateiname: f.name,
        dokument_groesse_bytes: f.size,
      },
    }));
  }

  function removeFile() {
    setState((s) => ({
      ...s,
      fb_iv: {
        vorhaben_titel: s.fb_iv.vorhaben_titel,
        kurzbeschreibung: s.fb_iv.kurzbeschreibung,
        // dokument_* gezielt entfernen
      },
    }));
  }

  function validate(): boolean {
    const e: FieldErrors = {};
    if (!state.fb_iv.dokument_file && !state.fb_iv.dokument_dateiname) {
      e.dokument = t("fehler.fb4.dokument_pflicht");
    }
    // optionale Kurzbeschreibung-Längenprüfung — nur falls eingegeben
    if (state.fb_iv.kurzbeschreibung) {
      if (!evaluateRule(FB_IV.validation_rules[0]!, state.fb_iv.kurzbeschreibung)) {
        e.kurz = FB_IV.validation_rules[0]!.fehlermeldung;
      }
    }
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setOffen({
        hinweis: offen.hinweis,
        upload: !!e.dokument || offen.upload,
        klassifikation: !!e.kurz || offen.klassifikation,
      });
    }
    return Object.keys(e).length === 0;
  }

  const restZeichen = MAX_KURZ - state.fb_iv.kurzbeschreibung.length;
  const hatDokument =
    !!state.fb_iv.dokument_file || !!state.fb_iv.dokument_dateiname;
  const groesseKb = state.fb_iv.dokument_groesse_bytes
    ? Math.round(state.fb_iv.dokument_groesse_bytes / 1024)
    : 0;

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); if (validate()) onWeiter(); }} noValidate>
      <h1>{t("fb4.titel")}</h1>
      <p className="lead">{t("fb4.lead")}</p>

      <CollapsibleSection
        nummer={1}
        titel={t("section.fb4.hinweis")}
        beschreibung={t("section.fb4.hinweis.desc")}
        status={{ kind: "info", label: t("status.hinweis") }}
        open={offen.hinweis}
        onToggle={(o) => toggle("hinweis", o)}
      >
        <p>{t("fb4.hinweis.body")}</p>
        <p>
          <a
            href="https://www.wuerzburg.de/themen/gesundheit-soziales/senioren/antragswesen/index.html"
            target="_blank" rel="noreferrer"
          >
            {t("fb4.hinweis.link")}
          </a>
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        nummer={2}
        titel={t("section.fb4.upload")}
        beschreibung={t("section.fb4.upload.desc")}
        status={
          errors.dokument
            ? { kind: "error", label: t("status.bittepruefen") }
            : hatDokument
              ? { kind: "ok", label: t("status.fertig") }
              : { kind: "todo", label: t("status.inbearbeitung") }
        }
        open={offen.upload}
        onToggle={(o) => toggle("upload", o)}
      >
        <div className="form-row">
          <label htmlFor="fb4_pdf">
            {t("fb4.upload.label")} <span className="pflicht">*</span>
          </label>
          <div className="anlage-desc">{t("fb4.upload.hint")}</div>
          {hatDokument ? (
            <div>
              <strong>
                {t("fb4.upload.dateiname")}: {state.fb_iv.dokument_dateiname}
              </strong>
              {groesseKb > 0 && (
                <span style={{ marginLeft: "1rem", color: "var(--wuerzburg-muted)" }}>
                  ({tx("fb4.upload.groesse", { n: groesseKb })})
                </span>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-mini"
                style={{ marginLeft: "1rem" }}
                onClick={removeFile}
              >
                {t("anlagen.entfernen")}
              </button>
            </div>
          ) : (
            <input
              id="fb4_pdf"
              type="file"
              accept="application/pdf"
              aria-invalid={!!errors.dokument}
              onChange={onFileChange}
            />
          )}
          {errors.dokument && (
            <div className="fehlermeldung">{errors.dokument}</div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        nummer={3}
        titel={t("section.fb4.klassifikation")}
        beschreibung={t("section.fb4.klassifikation.desc")}
        status={{ kind: "info", label: t("status.optional") }}
        open={offen.klassifikation}
        onToggle={(o) => toggle("klassifikation", o)}
      >
        <div className="form-row">
          <label htmlFor="vorhaben_titel">{t("fb4.optional.label_titel")}</label>
          <input
            id="vorhaben_titel" type="text"
            value={state.fb_iv.vorhaben_titel}
            onChange={(e) => update("vorhaben_titel", e.target.value)}
          />
        </div>
        <div className="form-row">
          <label htmlFor="kurz">{t("fb4.optional.label_kurz")}</label>
          <textarea
            id="kurz" rows={5} maxLength={MAX_KURZ}
            value={state.fb_iv.kurzbeschreibung}
            aria-invalid={!!errors.kurz}
            onChange={(e) => update("kurzbeschreibung", e.target.value)}
          />
          <div className="zeichenzaehler">{tx("fb4.kurz_rest", { n: restZeichen })}</div>
          {errors.kurz && <div className="fehlermeldung">{errors.kurz}</div>}
        </div>
      </CollapsibleSection>

      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={onZurueck}>{t("btn.zurueck")}</button>
        <button type="submit" className="btn btn-primary">{t("btn.weiter")}</button>
      </div>
    </form>
  );
}
