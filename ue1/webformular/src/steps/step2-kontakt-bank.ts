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
  // PDF-Voll-Sync: Telefon ist Pflicht (PDF H8).
  fields.appendChild(renderFieldInput({
    id: "telefon", label: t("form.label.telefon"), type: "tel", required: true,
    value: stateSig.value.telefon, onChange: (v) => set({ telefon: v }),
  }));
  fields.appendChild(renderFieldInput({
    id: "email", label: t("form.label.email"), type: "email", required: true,
    value: stateSig.value.email, onChange: (v) => set({ email: v }),
    validate: (v) => (v.length > 0 && !isValidEmail(v) ? t("validation.email_ungueltig") : null),
  }));
  // PDF-Voll-Sync: Bankverbindung (Bankname) ist Pflicht (PDF H9).
  fields.appendChild(renderFieldInput({
    id: "bankverbindung", label: t("form.label.bankverbindung"), required: true, full: true,
    value: stateSig.value.bankverbindung, onChange: (v) => set({ bankverbindung: v }),
  }));
  fields.appendChild(renderFieldInput({
    id: "iban", label: t("form.label.iban"), required: true, full: true,
    value: stateSig.value.iban,
    onChange: (v) => set({ iban: v }),
    validate: (v) => (v.length > 0 && !isValidIBAN(v) ? t("validation.iban_ungueltig") : null),
  }));
  // PDF-Voll-Sync: BIC ist IMMER Pflicht (PDF H9) — kein conditional rendering.
  const bicField = renderFieldInput({
    id: "bic", label: t("form.label.bic"), required: true, full: true,
    value: stateSig.value.bic, onChange: (v) => set({ bic: v }),
  });
  const bicHint = document.createElement("span");
  bicHint.className = "field-hint";
  bicHint.textContent = t("form.hint.bic");
  bicField.appendChild(bicHint);
  fields.appendChild(bicField);

  root.appendChild(fields);
  return root;
}
