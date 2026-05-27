/**
 * UE2 Inbox — Multi-FB-Sicht auf `apl.antrag_inbox`.
 *
 * Liest über @dv/data-layer, rendert:
 *   - Filter-Pills (Alle / FB I / II / III / IV)
 *   - Suche
 *   - InboxTable mit Sortierung, Gruppierung, Spalten-Konfig
 */
import { useMemo, useState } from "react";
import { useAntraege } from "../hooks/useAntraege";
import { useUserRole } from "../hooks/useUserRole";
import { useSession } from "../hooks/useSession";
import { supabase } from "../lib/supabase";
import { DemoDatenBanner } from "../components/DemoDatenBanner";
import { InboxTable } from "../components/InboxTable";
import { FbIcon } from "../components/FbIcon";
import { ALL_FOERDERBEREICHE, type FoerderbereichId } from "@dv/foerderbereiche";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";

export function Inbox() {
  const { antraege, loading, error } = useAntraege();
  const { rolle } = useUserRole();
  const { session } = useSession();
  const userEmail = session?.user?.email ?? "";

  const [fbFilter, setFbFilter] = useState<FoerderbereichId | "alle">("alle");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return antraege.filter((a) => {
      if (fbFilter !== "alle" && a.foerderbereich !== fbFilter) return false;
      if (!s) return true;
      const blob = `${a.antragsnummer ?? ""} ${a.einrichtung} ${a.dachverband ?? ""} ${a.ort}`
        .toLowerCase();
      return blob.includes(s);
    });
  }, [antraege, fbFilter, search]);

  const countsByFb = useMemo(() => {
    const m: Record<string, number> = { alle: antraege.length };
    for (const a of antraege) m[a.foerderbereich] = (m[a.foerderbereich] ?? 0) + 1;
    return m;
  }, [antraege]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 relative">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-wue-rot" />
        <div className="w-full px-4 py-3 flex items-center justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-wue-rot font-semibold">
              Stadt Würzburg · Sozialreferat
            </div>
            <h1 className="text-xl font-bold leading-tight">Sachbearbeitung — APL</h1>
            <p className="text-sm text-slate-500">
              Inbox · Multi-Förderbereich (FB I-IV)
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-slate-700">{userEmail || "—"}</div>
            <div className="text-slate-500">
              Rolle <span className="font-medium text-slate-700">{rolle ?? "—"}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
              Abmelden
            </Button>
          </div>
        </div>
      </header>

      <DemoDatenBanner />

      <main className="w-full px-4 py-6">
        <div className="bg-white border border-slate-200 rounded p-4 mb-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs uppercase tracking-wide text-slate-500 mr-2">
              Förderbereich:
            </span>
            <FilterPill
              label={`Alle (${countsByFb.alle ?? 0})`}
              active={fbFilter === "alle"}
              onClick={() => setFbFilter("alle")}
            />
            {(["I", "II", "III", "IV"] as FoerderbereichId[]).map((fb) => {
              const cfg = ALL_FOERDERBEREICHE[fb];
              return (
                <FilterPill
                  key={fb}
                  fb={fb}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <FbIcon name={cfg.icon} className="h-3.5 w-3.5" />
                      {cfg.label_kurz} ({countsByFb[fb] ?? 0})
                    </span>
                  }
                  active={fbFilter === fb}
                  onClick={() => setFbFilter(fb)}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Suche (Antragsnummer, Einrichtung, Dachverband, Ort) …"
              className="max-w-md"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="text-xs text-slate-500">
              {filtered.length} von {antraege.length} Anträgen
            </span>
          </div>
        </div>

        {loading && (
          <div className="bg-white border border-slate-200 rounded p-8 text-slate-500">
            Lade …
          </div>
        )}
        {error && (
          <div className="bg-white border border-slate-200 rounded p-4 text-rose-700">
            Fehler: {error}
          </div>
        )}
        {!loading && !error && <InboxTable antraege={filtered} />}
      </main>
    </div>
  );
}

/** Farb-Paletten pro Förderbereich — gleiche Töne wie FbBadge in der
 *  Tabelle, damit Filter-Pillen und Badges visuell konsistent sind. */
const FB_PILL_COLORS: Record<FoerderbereichId, { active: string; inactive: string }> = {
  I: {
    active: "bg-emerald-600 text-white border-emerald-600",
    inactive: "bg-emerald-50 text-emerald-900 border-emerald-300 hover:border-emerald-500",
  },
  II: {
    active: "bg-amber-600 text-white border-amber-600",
    inactive: "bg-amber-50 text-amber-900 border-amber-300 hover:border-amber-500",
  },
  III: {
    active: "bg-blue-600 text-white border-blue-600",
    inactive: "bg-blue-50 text-blue-900 border-blue-300 hover:border-blue-500",
  },
  IV: {
    active: "bg-violet-600 text-white border-violet-600",
    inactive: "bg-violet-50 text-violet-900 border-violet-300 hover:border-violet-500",
  },
};

function FilterPill({
  label,
  active,
  onClick,
  fb,
}: {
  label: React.ReactNode;
  active: boolean;
  onClick: () => void;
  fb?: FoerderbereichId;
}) {
  const palette = fb
    ? (active ? FB_PILL_COLORS[fb].active : FB_PILL_COLORS[fb].inactive)
    : (active
        ? "bg-slate-900 text-white border-slate-900"
        : "bg-white text-slate-700 border-slate-300 hover:border-slate-500");
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${palette}`}
    >
      {label}
    </button>
  );
}
