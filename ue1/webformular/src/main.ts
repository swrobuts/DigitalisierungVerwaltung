import type { APL2Antrag, ValidationErrors, Sprache } from "./types";
import { ALLE_SPRACHEN } from "./types";
import { isValidIBAN, isValidEmail, isValidPastOrTodayISO, isPositiveEuro } from "./validation";
import { validateCrossField } from "./cross-field";
import { collectAnlagen } from "./attachments";
import { zeigeBestaetigung } from "./submit";
import { submitAntrag } from "./supabase";
import { setSprache, getSprache, ladeGespeicherteSprache, applyTranslations } from "./i18n";

const form = document.getElementById("antrag-form") as HTMLFormElement;
const bestaetigung = document.getElementById("bestaetigung") as HTMLElement;
const btnDrucken = document.getElementById("btn-drucken") as HTMLButtonElement;
const sprachSelect = document.getElementById("sprach-select") as HTMLSelectElement;
const ibanStatus = document.getElementById("iban-status") as SVGElement | null;
const feldBic = document.getElementById("field-bic") as HTMLElement | null;
const feldMietvertrag = document.getElementById("field-mietvertrag") as HTMLElement | null;
const fortschrittFill = document.getElementById("fortschritt-fill") as HTMLElement | null;
const fortschrittText = document.getElementById("fortschritt-text") as HTMLElement | null;

// i18n
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

// Smart Defaults beim Laden
const heuteISO = new Date().toISOString().slice(0, 10);
const haushaltsjahrInput = form.querySelector<HTMLInputElement>('[name="haushaltsjahr"]');
if (haushaltsjahrInput && !haushaltsjahrInput.value) {
  haushaltsjahrInput.value = String(new Date().getFullYear());
}
const datumInput = form.querySelector<HTMLInputElement>('[name="antragsdatum"]');
if (datumInput && !datumInput.value) {
  datumInput.value = heuteISO;
}

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
    strasse:    str("strasse"),
    hausnummer: str("hausnummer"),
    plz:        str("plz"),
    ort:        str("ort"),
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

/* Interaktive Komfort-Funktionen */

function aktualisiereIbanStatus(antrag: APL2Antrag): void {
  if (!ibanStatus) return;
  const ok = antrag.iban.length > 0 && isValidIBAN(antrag.iban);
  ibanStatus.classList.toggle("ok", ok);
}

function aktualisiereConditionalFields(antrag: APL2Antrag): void {
  // BIC nur sichtbar bei Nicht-DE-IBAN
  if (feldBic) {
    const ibanClean = antrag.iban.replace(/\s+/g, "").toUpperCase();
    const istNichtDe = ibanClean.length >= 2 && !ibanClean.startsWith("DE");
    feldBic.classList.toggle("visible", istNichtDe);
  }
  // Mietvertrag nur sichtbar bei Miete > 0
  if (feldMietvertrag) {
    feldMietvertrag.classList.toggle("visible", antrag.monatlicheMieteEuro > 0);
  }
}

function aktualisiereFortschritt(): void {
  if (!fortschrittFill || !fortschrittText) return;
  // Zähle "ausgefüllt" für alle sichtbaren Pflichtfelder
  const pflichtFelder = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    "input[required], select[required], textarea[required]",
  );
  let gesamt = 0;
  let gefuellt = 0;
  pflichtFelder.forEach((el) => {
    // Übergeh Felder, deren Container .field-conditional ist und NICHT .visible
    const conditional = el.closest(".field-conditional");
    if (conditional && !conditional.classList.contains("visible")) return;
    gesamt += 1;
    const wert = el.value.trim();
    let val: boolean;
    if (el.type === "file") {
      val = ((el as HTMLInputElement).files?.length ?? 0) > 0;
    } else if (el.type === "number") {
      // Eine 0 (z.B. Default Miete) zählt nicht als „ausgefüllt"
      const n = Number(wert);
      val = wert.length > 0 && Number.isFinite(n) && n > 0;
    } else {
      val = wert.length > 0;
    }
    if (val) gefuellt += 1;
  });
  // Pflicht-Anlagen separat (sind kein required=)
  const pflichtAnlagen = ["programm-altentagesstaette", "anlage-1-kostennachweis", "personalkostenbelege"];
  pflichtAnlagen.forEach((typ) => {
    gesamt += 1;
    const input = form.querySelector<HTMLInputElement>(`input[name="${typ}"]`);
    if ((input?.files?.length ?? 0) > 0) gefuellt += 1;
  });

  const prozent = gesamt === 0 ? 0 : Math.round((gefuellt / gesamt) * 100);
  fortschrittFill.style.width = `${prozent}%`;
  fortschrittText.textContent = `${gefuellt} / ${gesamt}`;
}

function liveUpdate(): void {
  const antrag = leseAntragAusFormular();
  aktualisiereIbanStatus(antrag);
  aktualisiereConditionalFields(antrag);
  aktualisiereFortschritt();
  fehlerAnzeigen(feldweiseValidieren(antrag));
}

form.addEventListener("input", liveUpdate);
form.addEventListener("change", liveUpdate);
// Initial einmal triggern, damit Default-Werte (Haushaltsjahr, Miete=0) wirken
liveUpdate();

const btnAbsenden = document.getElementById("btn-absenden") as HTMLButtonElement;
btnAbsenden.dataset.label = btnAbsenden.textContent ?? "Antrag absenden";

function setzeBusy(busy: boolean): void {
  btnAbsenden.disabled = busy;
  btnAbsenden.textContent = busy ? "Wird gesendet…" : (btnAbsenden.dataset.label ?? "Antrag absenden");
}

function zeigeServerFehler(message: string): void {
  const div = document.createElement("div");
  div.className = "field-error";
  div.setAttribute("role", "alert");
  div.style.padding = "0.7rem";
  div.style.marginTop = "1rem";
  div.style.background = "#ffe5e5";
  div.style.borderLeft = "3px solid var(--error)";
  div.textContent = `Übermittlung fehlgeschlagen: ${message}. Bitte später erneut versuchen.`;
  form.appendChild(div);
  setTimeout(() => div.remove(), 8000);
}

form.addEventListener("submit", async (event) => {
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

  setzeBusy(true);
  const ergebnis = await submitAntrag(antrag, antrag.anlagen);
  setzeBusy(false);

  if ("error" in ergebnis) {
    zeigeServerFehler(ergebnis.error);
    return;
  }
  zeigeBestaetigung(bestaetigung, antrag, ergebnis.antragsnummer);
  form.hidden = true;
  bestaetigung.scrollIntoView({ behavior: "smooth", block: "start" });
});

btnDrucken.addEventListener("click", () => window.print());
