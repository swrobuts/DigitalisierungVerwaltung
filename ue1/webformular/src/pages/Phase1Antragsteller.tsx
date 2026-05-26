// Phase 1: gemeinsamer Antragsteller-Block für alle 4 FBs.
// 4 Collapsible-Sections (Träger, Anschrift, Kontakt, Bankverbindung)
// mit Status-Badge pro Section + Smart-Open beim Submit-Fehler.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAntrag } from "../state/AntragContext";
import { Progress } from "../components/Progress";
import { CollapsibleSection } from "../components/CollapsibleSection";
import {
  isEmail,
  isPLZ,
  isIBAN,
  nonEmpty,
  fieldState,
  aggregateSection,
  type FieldErrors,
  type FieldKind,
  type FieldState,
  type FieldSpec,
} from "../lib/validation";
import { t, tx } from "../lib/i18n";

/** ValidatedInput — Text-Input + Live-Validation (✓/× rechts im Feld). */
function ValidatedInput(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  kind: FieldKind;
  transform?: (v: string) => string;
  fehler?: string;
  type?: "text" | "email" | "tel" | "url";
  inputMode?: "numeric" | "text" | "email" | "tel" | "url";
  maxLength?: number;
  required?: boolean;
}): JSX.Element {
  const state: FieldState = fieldState(props.value, props.kind);
  const showErr = !!props.fehler;
  const showIcon = state !== "leer";
  return (
    <div>
      <label htmlFor={props.id}>
        {props.label}{" "}
        {props.required && <span className="pflicht">*</span>}
      </label>
      <div className="input-wrap">
        <input
          id={props.id}
          type={props.type ?? "text"}
          inputMode={props.inputMode}
          maxLength={props.maxLength}
          required={props.required}
          value={props.value}
          aria-invalid={showErr || state === "fehler"}
          data-valid={state === "ok" ? "true" : undefined}
          onChange={(e) =>
            props.onChange(props.transform ? props.transform(e.target.value) : e.target.value)
          }
        />
        {showIcon && (
          <span
            className={`input-state-icon ${state === "ok" ? "ok" : "err"}`}
            aria-hidden="true"
          >
            {state === "ok" ? "✓" : "✗"}
          </span>
        )}
      </div>
      {showErr && <div className="fehlermeldung">{props.fehler}</div>}
    </div>
  );
}

type SectionId = "traeger" | "anschrift" | "kontakt" | "bank";

export function Phase1Antragsteller(): JSX.Element {
  const { state, setState } = useAntrag();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<FieldErrors>({});

  // Initial: Träger offen, Rest zu. Smart-Open bei Submit-Fehler weiter unten.
  const [offen, setOffen] = useState<Record<SectionId, boolean>>({
    traeger: true,
    anschrift: false,
    kontakt: false,
    bank: false,
  });

  if (!state.foerderbereich) return <Navigate to="/" replace />;

  function update<K extends keyof typeof state>(key: K, value: (typeof state)[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function toggle(id: SectionId, next: boolean) {
    setOffen((o) => ({ ...o, [id]: next }));
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

  // Welche Sections enthalten Fehler? Die werden automatisch aufgeklappt,
  // damit der Bürger nach dem „Weiter"-Klick sofort sieht, wo's hakt.
  const sectionFelder: Record<SectionId, FieldSpec[]> = useMemo(
    () => ({
      traeger: [
        { value: state.dachverband, kind: "optional" },
        { value: state.einrichtung, kind: "pflicht" },
        { value: state.ansprechpartner, kind: "pflicht" },
      ],
      anschrift: [
        { value: state.strasse, kind: "pflicht" },
        { value: state.hausnummer, kind: "optional" },
        { value: state.plz, kind: "plz" },
        { value: state.ort, kind: "pflicht" },
      ],
      kontakt: [
        { value: state.telefon, kind: "telefon" },
        { value: state.email, kind: "email" },
        { value: state.homepage, kind: "optional" },
      ],
      bank: [
        { value: state.bankname, kind: "pflicht" },
        { value: state.iban, kind: "iban" },
        { value: state.bic, kind: "pflicht" },
      ],
    }),
    [state],
  );

  const sectionErrorKeys: Record<SectionId, ReadonlyArray<keyof FieldErrors>> = {
    traeger: ["einrichtung", "ansprechpartner"],
    anschrift: ["strasse", "plz", "ort"],
    kontakt: ["telefon", "email"],
    bank: ["bankname", "iban", "bic"],
  };

  function sectionHasError(id: SectionId): boolean {
    return sectionErrorKeys[id].some((k) => !!errors[k as string]);
  }

  // Smart-Open: sobald nach Submit Fehler vorliegen, alle betroffenen Sections aufklappen.
  useEffect(() => {
    const hasAny = Object.keys(errors).length > 0;
    if (!hasAny) return;
    setOffen((o) => {
      const next = { ...o };
      (Object.keys(sectionErrorKeys) as SectionId[]).forEach((id) => {
        if (sectionHasError(id)) next[id] = true;
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors]);

  // Section-Status-Labels über i18n (DE/TR-fähig: „2 Fehler" → „2 hata", „Bitte prüfen" → „Lütfen kontrol edin")
  const labelFn = (kind: "ok" | "todo" | "error", info: { ok: number; total: number; fehler: number }) => {
    if (kind === "error") {
      return info.fehler > 0 ? tx("status.fehler", { n: info.fehler }) : t("status.bittepruefen");
    }
    return `${info.ok}/${info.total}`;
  };
  function statusFor(id: SectionId) {
    return aggregateSection(sectionFelder[id], sectionHasError(id), labelFn);
  }

  return (
    <>
      <Progress step={1} />
      <form className="form-wrap" onSubmit={weiter} noValidate>
        <h1>{t("phase.1.titel")}</h1>
        <p className="lead">{tx("phase.1.lead", { fb: state.foerderbereich })}</p>

        <CollapsibleSection
          nummer={1}
          titel={t("section.traeger")}
          beschreibung={t("section.traeger.desc")}
          status={statusFor("traeger")}
          open={offen.traeger}
          onToggle={(o) => toggle("traeger", o)}
        >
          <div className="form-row">
            <ValidatedInput
              id="dachverband"
              label={t("antragsteller.dachverband")}
              value={state.dachverband}
              onChange={(v) => update("dachverband", v)}
              kind="optional"
            />
          </div>
          <div className="form-row">
            <ValidatedInput
              id="einrichtung"
              label={t("antragsteller.einrichtung")}
              value={state.einrichtung}
              onChange={(v) => update("einrichtung", v)}
              kind="pflicht"
              required
              fehler={errors.einrichtung}
            />
          </div>
          <div className="form-row">
            <ValidatedInput
              id="ansprechpartner"
              label={t("antragsteller.ansprechpartner")}
              value={state.ansprechpartner}
              onChange={(v) => update("ansprechpartner", v)}
              kind="pflicht"
              required
              fehler={errors.ansprechpartner}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          nummer={2}
          titel={t("section.anschrift")}
          beschreibung={t("section.anschrift.desc")}
          status={statusFor("anschrift")}
          open={offen.anschrift}
          onToggle={(o) => toggle("anschrift", o)}
        >
          <div className="form-row two-col">
            <ValidatedInput
              id="strasse"
              label={t("antragsteller.strasse")}
              value={state.strasse}
              onChange={(v) => update("strasse", v)}
              kind="pflicht"
              required
              fehler={errors.strasse}
            />
            <ValidatedInput
              id="hausnummer"
              label={t("antragsteller.hausnummer")}
              value={state.hausnummer}
              onChange={(v) => update("hausnummer", v)}
              kind="optional"
            />
          </div>
          <div className="form-row two-col">
            <ValidatedInput
              id="plz"
              label={t("antragsteller.plz")}
              value={state.plz}
              onChange={(v) => update("plz", v)}
              kind="plz"
              inputMode="numeric"
              maxLength={5}
              required
              fehler={errors.plz}
            />
            <ValidatedInput
              id="ort"
              label={t("antragsteller.ort")}
              value={state.ort}
              onChange={(v) => update("ort", v)}
              kind="pflicht"
              required
              fehler={errors.ort}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          nummer={3}
          titel={t("section.kontakt")}
          beschreibung={t("section.kontakt.desc")}
          status={statusFor("kontakt")}
          open={offen.kontakt}
          onToggle={(o) => toggle("kontakt", o)}
        >
          <div className="form-row two-col">
            <ValidatedInput
              id="telefon"
              label={t("antragsteller.telefon")}
              value={state.telefon}
              onChange={(v) => update("telefon", v)}
              kind="telefon"
              type="tel"
              required
              fehler={errors.telefon}
            />
            <ValidatedInput
              id="email"
              label={t("antragsteller.email")}
              value={state.email}
              onChange={(v) => update("email", v)}
              kind="email"
              type="email"
              required
              fehler={errors.email}
            />
          </div>
          <div className="form-row">
            <ValidatedInput
              id="homepage"
              label={t("antragsteller.homepage")}
              value={state.homepage}
              onChange={(v) => update("homepage", v)}
              kind="optional"
              type="url"
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          nummer={4}
          titel={t("section.bank")}
          beschreibung={t("section.bank.desc")}
          status={statusFor("bank")}
          open={offen.bank}
          onToggle={(o) => toggle("bank", o)}
        >
          <div className="form-row">
            <ValidatedInput
              id="bankname"
              label={t("antragsteller.bankname")}
              value={state.bankname}
              onChange={(v) => update("bankname", v)}
              kind="pflicht"
              required
              fehler={errors.bankname}
            />
          </div>
          <div className="form-row two-col">
            <ValidatedInput
              id="iban"
              label={t("antragsteller.iban")}
              value={state.iban}
              onChange={(v) => update("iban", v)}
              transform={(v) => v.toUpperCase()}
              kind="iban"
              required
              fehler={errors.iban}
            />
            <ValidatedInput
              id="bic"
              label={t("antragsteller.bic")}
              value={state.bic}
              onChange={(v) => update("bic", v)}
              transform={(v) => v.toUpperCase()}
              kind="pflicht"
              required
              fehler={errors.bic}
            />
          </div>
        </CollapsibleSection>

        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/")}>
            {t("btn.zurueck")}
          </button>
          <button type="submit" className="btn btn-primary">
            {t("btn.weiter")}
          </button>
        </div>
      </form>
    </>
  );
}
