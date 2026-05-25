/**
 * UE2 Inbox — Multi-FB-Sicht auf `apl.antrag_inbox`.
 *
 * Liest über @dv/data-layer, rendert:
 *   - Filter-Pills (Alle / FB I / II / III / IV)
 *   - Tabelle mit FB-Badge, Antragsnr., Einrichtung, Eingang, Status,
 *     Antragssumme (FB-spezifisch), Durchlaufzeit
 *
 * Bewusst minimal — die alte Inbox hatte Spaltenkonfig, Gruppierung,
 * Vorjahres-Vergleich; das ist YAGNI für die Multi-FB-Demo.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAntraege } from "../hooks/useAntraege";
import { useUserRole } from "../hooks/useUserRole";
import { useSession } from "../hooks/useSession";
import { supabase } from "../lib/supabase";
import { StatusBadge } from "../components/StatusBadge";
import { FbBadge } from "../components/FbBadge";
import { DemoDatenBanner } from "../components/DemoDatenBanner";
import {
  formatDate,
  formatEuro,
  formatDurchlaufzeit,
  durchlaufzeitAmpel,
  type DurchlaufzeitAmpel,
} from "../lib/format";
import { ALL_FOERDERBEREICHE, type FoerderbereichId } from "@dv/foerderbereiche";
import type { AntragInbox } from "@dv/data-layer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";

const AMPEL_BG: Record<DurchlaufzeitAmpel, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-slate-400",
};

/**
 * FB-spezifische „Antragssumme" — die View liefert pro FB unterschiedliche
 * Felder. Wir wählen das passende.
 */
function antragssummeText(a: AntragInbox): { text: string; numeric: number | null } {
  switch (a.foerderbereich) {
    case "I":
      return a.fb_i_gesamtkosten_euro != null
        ? { text: formatEuro(a.fb_i_gesamtkosten_euro), numeric: a.fb_i_gesamtkosten_euro }
        : { text: "—", numeric: null };
    case "II":
      return { text: "Pauschale", numeric: null };
    case "III":
      if (a.fb_iii_c_betrag_euro != null) {
        return {
          text: formatEuro(a.fb_iii_c_betrag_euro),
          numeric: a.fb_iii_c_betrag_euro,
        };
      }
      return {
        text: a.fb_iii_variante ? `Variante ${a.fb_iii_variante}` : "—",
        numeric: null,
      };
    case "IV":
      return a.fb_iv_beantragte_summe_euro != null
        ? {
            text: formatEuro(a.fb_iv_beantragte_summe_euro),
            numeric: a.fb_iv_beantragte_summe_euro,
          }
        : { text: "—", numeric: null };
  }
}

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
                  label={`${cfg.icon} ${cfg.label_kurz} (${countsByFb[fb] ?? 0})`}
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

        <div className="bg-white border border-slate-200 rounded overflow-x-auto">
          {loading && <div className="p-8 text-slate-500">Lade …</div>}
          {error && <div className="p-4 text-rose-700">Fehler: {error}</div>}
          {!loading && !error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Förderbereich</TableHead>
                  <TableHead>Antragsnummer</TableHead>
                  <TableHead>Einrichtung</TableHead>
                  <TableHead>Eingang</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Durchlaufzeit</TableHead>
                  <TableHead className="text-right">Antragssumme</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => {
                  const summe = antragssummeText(a);
                  const entschieden = a.entscheidungs_typ !== null;
                  const ampel = durchlaufzeitAmpel(a.durchlaufzeit_tage, entschieden);
                  return (
                    <TableRow key={a.id} className="hover:bg-blue-50/30">
                      <TableCell>
                        <FbBadge fb={a.foerderbereich} />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500 whitespace-nowrap">
                        {a.antragsnummer ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-slate-900">{a.einrichtung}</div>
                        {a.dachverband && (
                          <div className="text-xs text-slate-500">{a.dachverband}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                        {formatDate(a.submitted_at)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={a.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${AMPEL_BG[ampel]}`}
                            aria-hidden="true"
                          />
                          {formatDurchlaufzeit(a.durchlaufzeit_tage, entschieden)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {summe.numeric != null ? (
                          <span className="font-medium text-slate-900">{summe.text}</span>
                        ) : (
                          <span className="text-slate-500 italic">{summe.text}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap pr-4">
                        <Link
                          to={`/antrag/${a.id}`}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-1.5"
                        >
                          Öffnen →
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-slate-500 py-8">
                      Keine Anträge gefunden.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "text-xs px-3 py-1.5 rounded-full border transition-colors " +
        (active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 border-slate-300 hover:border-slate-500")
      }
    >
      {label}
    </button>
  );
}
