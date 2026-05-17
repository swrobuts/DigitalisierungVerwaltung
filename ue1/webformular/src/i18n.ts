import { translations } from "./translations";
import { ALLE_SPRACHEN, type Sprache } from "./types";

const STORAGE_KEY = "apl2.sprache";

let aktuelleSprache: Sprache = "de";

export function getSprache(): Sprache {
  return aktuelleSprache;
}

export function setSprache(s: Sprache): void {
  aktuelleSprache = s;
  if (typeof localStorage !== "undefined" && typeof localStorage.setItem === "function") {
    localStorage.setItem(STORAGE_KEY, s);
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = s;
    applyTranslations();
  }
}

export function t(key: string): string {
  return translations[aktuelleSprache]?.[key] ?? translations.de[key] ?? key;
}

export function applyTranslations(): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    const value = t(key);
    // Wenn t() den Roh-Key zurückgibt (nirgends übersetzt), HTML-Fallback lassen.
    if (value !== key) el.textContent = value;
  });
  document.querySelectorAll<HTMLOptionElement>("option[data-i18n]").forEach((opt) => {
    const key = opt.dataset.i18n;
    if (!key) return;
    const value = t(key);
    if (value !== key) opt.textContent = value;
  });
}

export function ladeGespeicherteSprache(): void {
  if (typeof localStorage === "undefined" || typeof localStorage.getItem !== "function") return;
  const gespeichert = localStorage.getItem(STORAGE_KEY);
  if (gespeichert && (ALLE_SPRACHEN as string[]).includes(gespeichert)) {
    aktuelleSprache = gespeichert as Sprache;
  }
}
