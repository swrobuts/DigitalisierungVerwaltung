import type { Signal } from "../signals";
import type { FormState } from "../types";
import { renderFieldInput } from "../components/field-input";
import { isValidEmail, isValidIBAN } from "../validation";
import { t } from "../i18n";

export function renderStep2(stateSig: Signal<FormState>): HTMLElement {
  const root = document.createElement("fieldset");
  root.dataset.section = "2";

  const legend = document.createElement("legend");
  legend.textContent = t("form.legend.kontakt") + " & " + t("form.legend.bank");
  root.appendChild(legend);

  const set = (patch: Partial<FormState>) => {
    stateSig.value = { ...stateSig.value, ...patch };
  };

  const fields = document.createElement("div");
  fields.className = "fields";

  fields.appendChild(renderFieldInput({
    id: "ansprechpartner", label: t("form.label.ansprechpartner"), required: true, full: true,
    value: stateSig.value.ansprechpartner, onChange: (v) => set({ ansprechpartner: v }),
  }));
  // Telefon ist seit Abspeckung 2026-05 optional — Email reicht für
  // die rechtssichere Korrespondenz, Telefon ist nice-to-have.
  fields.appendChild(renderFieldInput({
    id: "telefon", label: t("form.label.telefon"), type: "tel", required: false,
    value: stateSig.value.telefon, onChange: (v) => set({ telefon: v }),
  }));
  fields.appendChild(renderFieldInput({
    id: "email", label: t("form.label.email"), type: "email", required: true,
    value: stateSig.value.email, onChange: (v) => set({ email: v }),
    validate: (v) => (v.length > 0 && !isValidEmail(v) ? t("validation.email_ungueltig") : null),
  }));
  // Bankname optional — ist aus IBAN ableitbar; Pflicht ist nur die IBAN
  // selbst (AHP 3.6: Auszahlung auf Konto des Antragsberechtigten).
  fields.appendChild(renderFieldInput({
    id: "bankverbindung", label: t("form.label.bankverbindung"), required: false, full: true,
    value: stateSig.value.bankverbindung, onChange: (v) => set({ bankverbindung: v }),
  }));
  fields.appendChild(renderFieldInput({
    id: "iban", label: t("form.label.iban"), required: true, full: true,
    value: stateSig.value.iban,
    onChange: (v) => set({ iban: v }),
    validate: (v) => (v.length > 0 && !isValidIBAN(v) ? t("validation.iban_ungueltig") : null),
  }));

  // BIC nur wenn nicht-DE: <label> selbst togglen (kein zusätzliches <div>,
  // damit das Grid-Layout sauber bleibt).
  const bicField = renderFieldInput({
    id: "bic", label: t("form.label.bic"), required: false,
    value: stateSig.value.bic, onChange: (v) => set({ bic: v }),
  });
  bicField.classList.add("full");
  const updateBic = () => {
    const ibanCountry = stateSig.value.iban.replace(/\s+/g, "").slice(0, 2).toUpperCase();
    const show = ibanCountry.length === 2 && ibanCountry !== "DE";
    bicField.style.display = show ? "" : "none";
  };
  updateBic();
  stateSig.subscribe(updateBic);
  fields.appendChild(bicField);

  root.appendChild(fields);
  return root;
}
