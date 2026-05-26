/**
 * Layout-Hülle (Header + Breadcrumb + Main + Footer).
 *
 * Sprach-Picker: semantisches native <select>-Dropdown mit allen 5
 * Sprachen. IT/RU/FR sind als „⚠ in Vorbereitung" markiert; ein Banner
 * unter dem Breadcrumb erklärt den DE-Fallback in der gewählten Sprache.
 *
 * Visuell konsistent mit UE0 (page-header, brand, brand-logo, breadcrumb,
 * page-footer).
 */

import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  getSprache,
  setSprache,
  t,
  SPRACHEN,
  istUebersetzt,
  hinweisUnfertig,
  type Sprache,
} from "../lib/i18n";

export function Layout({ children }: { children: ReactNode }): JSX.Element {
  const [sprache, setSpracheState] = useState<Sprache>(getSprache());

  const wechselSprache = (s: Sprache) => {
    setSprache(s);
    setSpracheState(s);
  };

  const zeigeFallbackHinweis = !istUebersetzt(sprache);

  return (
    <>
      {/* 3px Würzburg-Rot oben — Wiedererkennungsmerkmal aller Stadt-Wü-Subdomains */}
      <div className="wue-accent" />

      <header className="page-header">
        <div className="page-header-inner">
          <Link to="/" className="brand" aria-label="Stadt Würzburg — Startseite">
            <img
              src={`${import.meta.env.BASE_URL}assets/wuerzburg-wappen.svg`}
              alt=""
              className="brand-logo"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <span className="brand-text">
              <span className="brand-stadt">STADT</span>
              <span className="brand-name">WÜRZBURG</span>
            </span>
          </Link>

          <nav className="page-nav" aria-label={t("nav.sprache")}>
            <label htmlFor="lang-select" className="lang-select-label">
              {/* kleines „Globus"-Glyph als Affordance */}
              <span aria-hidden="true" className="lang-icon">🌐</span>
              <span className="visually-hidden">{t("nav.sprache")}</span>
            </label>
            <select
              id="lang-select"
              className="lang-select"
              value={sprache}
              onChange={(e) => wechselSprache(e.target.value as Sprache)}
            >
              {SPRACHEN.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label} · {s.endonym}
                  {!s.fertig ? "  ⚠" : ""}
                </option>
              ))}
            </select>
          </nav>
        </div>
      </header>

      <nav className="breadcrumb" aria-label="Breadcrumb">
        <div className="breadcrumb-inner">
          <Link to="/">{t("nav.breadcrumb_home")}</Link>
          <span className="bc-sep">›</span>
          <span>{t("app.titel")}</span>
        </div>
      </nav>

      {/* Ehrlicher Hinweis, dass IT/RU/FR-Auswahl auf DE zurückfällt.
          Steht in der gewählten Sprache *und* auf Deutsch — der Bürger
          versteht es in jedem Fall. */}
      {zeigeFallbackHinweis && (
        <div className="lang-fallback" role="status" lang={sprache}>
          <div className="lang-fallback-inner">
            <strong>{hinweisUnfertig(sprache)}</strong>
            <span className="lang-fallback-de" lang="de">
              Übersetzung in Vorbereitung — Anzeige derzeit auf Deutsch.
            </span>
          </div>
        </div>
      )}

      <main className="page-main">{children}</main>

      <footer className="page-footer">
        <div className="page-footer-inner">
          <strong>Lehr-Demo der THWS</strong> — {t("app.demohinweis")}
          <br />
          {t("app.demofooter")}{" "}
          <a
            href="https://github.com/swrobuts/DigitalisierungVerwaltung"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("app.quellcode")}
          </a>
        </div>
      </footer>
    </>
  );
}
