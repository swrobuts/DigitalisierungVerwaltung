/**
 * Footer im Stadt-Würzburg-Stil — schmal, dezent, mit den rechtlich
 * relevanten Hinweisen (Impressum/Datenschutz/Barrierefreiheit) sowie
 * der Transparenz-Notiz nach EU AI Act Art. 50: „Sie sprechen mit einem
 * KI-System". Die ausführliche Erklärung des Kunstnamens „CIVA" steckt
 * in einem dezenten Details-Element rechts unten — sichtbar genug für
 * Interessierte, unaufdringlich genug, um den Empty-State nicht zu
 * überladen.
 */
export function Footer() {
  return (
    <footer className="shrink-0 border-t border-slate-200 bg-white">
      <div className="w-full px-4 py-2.5 flex items-center justify-between gap-6 text-[11px] text-slate-500">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-600">
            Stadt Würzburg · Sozialreferat
          </span>
          <span aria-hidden className="text-slate-300">·</span>
          <a
            href="https://www.wuerzburg.de/impressum"
            target="_blank"
            rel="noreferrer"
            className="hover:text-wue-rot hover:underline"
          >
            Impressum
          </a>
          <a
            href="https://www.wuerzburg.de/datenschutz"
            target="_blank"
            rel="noreferrer"
            className="hover:text-wue-rot hover:underline"
          >
            Datenschutz
          </a>
          <a
            href="https://www.wuerzburg.de/barrierefreiheit"
            target="_blank"
            rel="noreferrer"
            className="hover:text-wue-rot hover:underline"
          >
            Barrierefreiheit
          </a>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-400">
            KI-Transparenz (EU AI Act Art. 50): Sie sprechen mit einem KI-System
            — Anthropic Claude Sonnet 4.5.
          </span>
          <details className="relative">
            <summary className="cursor-pointer list-none hover:text-wue-rot select-none">
              Warum „CIVA"?
            </summary>
            <div className="absolute right-0 bottom-full mb-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-[11px] text-slate-600 leading-snug z-10">
              CIVA leitet sich vom lateinischen <em>civitas</em> (Bürgerschaft,
              Gemeinwesen) ab. Bewusst ein Kunstname, kein menschlicher
              Vorname — denn ein Name wie „Anna" suggerierte, hier antworte
              ein Mensch. Tatsächlich antwortet ein KI-System; diese
              Transparenz fordert EU AI Act Art. 50.
            </div>
          </details>
        </div>
      </div>
    </footer>
  );
}
