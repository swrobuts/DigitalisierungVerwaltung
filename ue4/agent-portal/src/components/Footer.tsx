import { t } from "../lib/i18n";

/**
 * Footer im Stadt-Würzburg-Stil — schmal, dezent. Links Stadtkennung
 * und rechtliche Hinweise (Impressum / Datenschutz / Barrierefreiheit),
 * rechts der EU-AI-Act-Art.-50-Transparenzhinweis und ein ausklappbarer
 * „Warum CIVA?"-Tooltip. UI-Strings sind via i18n übersetzt.
 */
export function Footer() {
  return (
    <footer className="shrink-0 border-t border-slate-200 bg-white">
      <div className="w-full px-4 py-2.5 flex items-center justify-between gap-6 text-[11px] text-slate-500">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-600">
            {t("header.kommune")}
          </span>
          <span aria-hidden className="text-slate-300">·</span>
          <a
            href="https://www.wuerzburg.de/impressum"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-900 hover:underline"
          >
            {t("footer.imprint")}
          </a>
          <a
            href="https://www.wuerzburg.de/datenschutz"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-900 hover:underline"
          >
            {t("footer.privacy")}
          </a>
          <a
            href="https://www.wuerzburg.de/barrierefreiheit"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-900 hover:underline"
          >
            {t("footer.accessibility")}
          </a>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-400">{t("footer.ai_disclaimer")}</span>
          <details className="relative">
            <summary className="cursor-pointer list-none hover:text-slate-900 select-none">
              {t("footer.why_civa")}
            </summary>
            <div className="absolute right-0 bottom-full mb-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-[11px] text-slate-600 leading-snug z-10 civa-popover-enter">
              {t("footer.why_civa.text")}
            </div>
          </details>
        </div>
      </div>
    </footer>
  );
}
