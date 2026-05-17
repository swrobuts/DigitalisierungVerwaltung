import type { APL2Antrag, ValidationErrors, Sprache } from "./types";
import { ALLE_SPRACHEN } from "./types";
import { isValidIBAN, isValidEmail, isValidPastOrTodayISO, isPositiveEuro } from "./validation";
import { validateCrossField } from "./cross-field";
import { collectAnlagen } from "./attachments";
import { erzeugeAntragsnummer, zeigeBestaetigung } from "./submit";
import { setSprache, getSprache, ladeGespeicherteSprache, applyTranslations } from "./i18n";

const form = document.getElementById("antrag-form") as HTMLFormElement;
const bestaetigung = document.getElementById("bestaetigung") as HTMLElement;
const btnDrucken = document.getElementById("btn-drucken") as HTMLButtonElement;
const sprachSelect = document.getElementById("sprach-select") as HTMLSelectElement;

// i18n: gespeicherte Sprache aus localStorage, dann anwenden
ladeGespeicherteSprache();
sprachSelect.value = getSprache();
applyTranslations();
document.documentElement.lang = getSprache();

sprachSelect.addEventListener("change", () => {
  const wert = sprachSelect.value as Sprache;
  if ((ALLE_SPRACHEN as string[]).includes(wert)) {
    setSprache(wert);
  }
});

function setFieldError(name: string, message: string | undefined): void {
  const target = form.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
  const input = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (target) target.textContent = message ?? "";
  if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
}

function clearAllErrors(): void {
  form.querySelectorAll("[data-error-for]").forEach((el) => (el.textContent = ""));
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
}

function leseAntragAusFormular(): APL2Antrag {
  const fd = new FormData(form);
  const num = (key: string): number => Number(fd.get(key) ?? 0);
  const str = (key: string): string => String(fd.get(key) ?? "").trim();
  return {
    haushaltsjahr: num("haushaltsjahr"),
    name: str("name"),
    anschrift: str("anschrift"),
    traeger: str("traeger"),
    bankverbindung: str("bankverbindung"),
    iban: str("iban"),
    bic: str("bic"),
    ansprechpartner: str("ansprechpartner"),
    telefon: str("telefon"),
    email: str("email"),
    betriebskostenVorjahrEuro: num("betriebskostenVorjahrEuro"),
    personalkostenVorjahrEuro: num("personalkostenVorjahrEuro"),
    raeumeVorhanden: (str("raeumeVorhanden") || "nein") as "ja" | "nein",
    raeumeUnentgeltlich: (str("raeumeUnentgeltlich") || "nein") as "ja" | "nein",
    monatlicheMieteEuro: num("monatlicheMieteEuro"),
    antragsdatum: str("antragsdatum"),
    anlagen: collectAnlagen(form),
  };
}

function feldweiseValidieren(antrag: APL2Antrag): ValidationErrors {
  const errors: ValidationErrors = {};
  if (antrag.iban && !isValidIBAN(antrag.iban)) {
    errors.iban = "IBAN-Prüfziffer ungültig.";
  }
  if (antrag.email && !isValidEmail(antrag.email)) {
    errors.email = "E-Mail-Format ungültig.";
  }
  if (antrag.antragsdatum && !isValidPastOrTodayISO(antrag.antragsdatum)) {
    errors.antragsdatum = "Antragsdatum darf nicht in der Zukunft liegen.";
  }
  if (antrag.betriebskostenVorjahrEuro && !isPositiveEuro(antrag.betriebskostenVorjahrEuro)) {
    errors.betriebskostenVorjahrEuro = "Betrag muss größer als 0 sein.";
  }
  if (antrag.personalkostenVorjahrEuro && !isPositiveEuro(antrag.personalkostenVorjahrEuro)) {
    errors.personalkostenVorjahrEuro = "Betrag muss größer als 0 sein.";
  }
  return errors;
}

function alleFehler(antrag: APL2Antrag): ValidationErrors {
  return { ...feldweiseValidieren(antrag), ...validateCrossField(antrag) };
}

function fehlerAnzeigen(errors: ValidationErrors): void {
  clearAllErrors();
  for (const [name, message] of Object.entries(errors)) {
    setFieldError(name, message);
  }
}

form.addEventListener("input", () => {
  const antrag = leseAntragAusFormular();
  fehlerAnzeigen(feldweiseValidieren(antrag));
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const antrag = leseAntragAusFormular();
  const errors = alleFehler(antrag);
  if (Object.keys(errors).length > 0) {
    fehlerAnzeigen(errors);
    const firstError = form.querySelector<HTMLElement>("[aria-invalid='true']");
    firstError?.focus();
    firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const nummer = erzeugeAntragsnummer(antrag);
  zeigeBestaetigung(bestaetigung, antrag, nummer);
  form.hidden = true;
  bestaetigung.scrollIntoView({ behavior: "smooth", block: "start" });
});

btnDrucken.addEventListener("click", () => window.print());
