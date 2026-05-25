// Header (Stadt-Wü-CI) + Footer-Hülle. Sprachauswahl umschaltet zwischen DE/TR.

import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { getSprache, setSprache, t, type Sprache } from "../lib/i18n";

export function Layout({ children }: { children: ReactNode }): JSX.Element {
  const [sprache, setSpracheState] = useState<Sprache>(getSprache());
  const wechselSprache = (s: Sprache) => {
    setSprache(s);
    setSpracheState(s);
  };

  return (
    <>
      <header className="stadt-header">
        <div className="stadt-header-inner">
          <Link to="/" className="stadt-brand">
            <img src={`${import.meta.env.BASE_URL}assets/wuerzburg-wappen.svg`}
                 alt="" className="stadt-wappen"
                 onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <div>
              <div className="stadt-wortmarke">Stadt Würzburg</div>
              <div className="stadt-tagline">{t("app.subtitel")}</div>
            </div>
          </Link>
          <nav className="sprach-nav">
            <label htmlFor="sprach-select">{t("nav.sprache")}:</label>
            <select
              id="sprach-select"
              value={sprache}
              onChange={(e) => wechselSprache(e.target.value as Sprache)}
            >
              <option value="de">DE · Deutsch</option>
              <option value="tr">TR · Türkçe</option>
            </select>
          </nav>
        </div>
      </header>

      <nav className="stadt-subnav" aria-label="Breadcrumb">
        <div className="stadt-subnav-inner">
          <Link to="/">Startseite</Link>
          <span className="stadt-subnav-sep">›</span>
          <span>Förderantrag Altenhilfeplan</span>
        </div>
      </nav>

      <main className="page">{children}</main>

      <footer className="stadt-footer">
        <div className="stadt-footer-inner">
          <strong>Lehr-Demo der THWS</strong> — {t("app.demohinweis")}
          <br />
          Modul „Innovationsmanagement" · BBA · 2026 ·{" "}
          <a href="https://github.com/swrobuts/DigitalisierungVerwaltung" target="_blank" rel="noopener">
            Quellcode auf GitHub
          </a>
        </div>
      </footer>
    </>
  );
}
