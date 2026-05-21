import type { Signal } from "../signals";
import type { FormState } from "../types";
import { renderFieldInput } from "../components/field-input";
import { isValidEmail, isValidIBAN } from "../validation";
import { t } from "../i18n";

export function renderStep2(stateSig: Signal<FormState>): HTMLElement {
  const root = document.createElement("section");
  root.className = "bg-white p-6 rounded-lg border border-slate-200";

  const h = document.createElement("h2");
  h.className = "text-lg font-semibold mb-4";
  h.textContent = t("form.legend.kontakt") + " & " + t("form.legend.bank");
  root.appendChild(h);

  const set = (patch: Partial<FormState>) => {
    stateSig.value = { ...stateSig.value, ...patch };
  };

  root.appendChild(renderFieldInput({
    id: "ansprechpartner", label: t("form.label.ansprechpartner"), required: true,
    value: stateSig.value.ansprechpartner, onChange: (v) => set({ ansprechpartner: v }),
  }));
  root.appendChild(renderFieldInput({
    id: "telefon", label: t("form.label.telefon"), type: "tel", required: true,
    value: stateSig.value.telefon, onChange: (v) => set({ telefon: v }),
  }));
  root.appendChild(renderFieldInput({
    id: "email", label: t("form.label.email"), type: "email", required: true,
    value: stateSig.value.email, onChange: (v) => set({ email: v }),
    validate: (v) => (v.length > 0 && !isValidEmail(v) ? t("validation.email_ungueltig") : null),
  }));
  root.appendChild(renderFieldInput({
    id: "bankverbindung", label: t("form.label.bankverbindung"), required: true,
    value: stateSig.value.bankverbindung, onChange: (v) => set({ bankverbindung: v }),
  }));
  root.appendChild(renderFieldInput({
    id: "iban", label: t("form.label.iban"), required: true,
    value: stateSig.value.iban,
    onChange: (v) => set({ iban: v }),
    validate: (v) => (v.length > 0 && !isValidIBAN(v) ? t("validation.iban_ungueltig") : null),
  }));

  // BIC nur wenn nicht-DE
  const bicWrap = document.createElement("div");
  const updateBic = () => {
    const ibanCountry = stateSig.value.iban.replace(/\s+/g, "").slice(0, 2).toUpperCase();
    const show = ibanCountry.length === 2 && ibanCountry !== "DE";
    bicWrap.style.display = show ? "block" : "none";
  };
  bicWrap.appendChild(renderFieldInput({
    id: "bic", label: t("form.label.bic"), required: false,
    value: stateSig.value.bic, onChange: (v) => set({ bic: v }),
  }));
  updateBic();
  stateSig.subscribe(updateBic);
  root.appendChild(bicWrap);

  return root;
}
