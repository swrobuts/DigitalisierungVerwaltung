import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";

/**
 * Banner-Streifen oben in der App, der explizit auf den Demo-Charakter
 * der seedeten FAKE-Antraege hinweist (Robert-Wunsch nach Klarstellung
 * 2026-05-25: Sachbearbeiter sollen sofort sehen, dass die
 * Bemessungs-Werte synthetisch sind und nicht aus echten Antraegen
 * stammen).
 *
 * Schliessbar; Zustand wird per localStorage gemerkt, damit der Banner
 * nach dem ersten Schliessen nicht bei jedem Reload wieder auftaucht.
 */
const STORAGE_KEY = "demo_disclaimer.dismissed.v1";

export function DemoDatenBanner() {
  const [dismissed, setDismissed] = useState<boolean>(true); // Default: nicht zeigen bis Initialisierung

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  if (dismissed) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50/80 text-amber-900">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2 text-xs sm:items-center">
        <Info className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" aria-hidden />
        <p className="flex-1 leading-relaxed">
          <strong className="font-semibold">Demo-Stand —</strong>{" "}
          Antrags-Nummern <code className="rounded bg-amber-100 px-1 font-mono">FAKE-001</code> bis{" "}
          <code className="rounded bg-amber-100 px-1 font-mono">FAKE-006</code> sind synthetische Lehr-Daten
          (siehe <code className="font-mono">supabase/migrations/042_fake_antraege_bemessungsdaten.sql</code>).
          Echte Antraege ueber UE0/UE1 erscheinen ohne diesen Hinweis und tragen Kennzeichen wie{" "}
          <code className="rounded bg-amber-100 px-1 font-mono">APL2-2026-&lt;KUERZEL&gt;-&lt;HEX&gt;</code>.
        </p>
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(STORAGE_KEY, "1");
            setDismissed(true);
          }}
          aria-label="Demo-Hinweis schliessen"
          className="rounded p-1 text-amber-700 transition hover:bg-amber-100 hover:text-amber-900"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
