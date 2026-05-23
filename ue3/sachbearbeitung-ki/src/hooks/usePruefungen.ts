/**
 * Vier-Augen-Prinzip: lädt + manipuliert apl2.pruefungen-Rows pro Antrag.
 *
 * Es kann maximal eine Erstprüfung und eine Zweitprüfung pro Antrag geben
 * (UNIQUE-Constraint in Migration 037).
 *
 * Schreib-Operationen gehen über den pruefung-service-Endpoint
 * POST /api/pruefung (nicht direkt zu Supabase), weil der Endpoint die
 * Status-Fortschalt-Logik enthält (in_pruefung → zweitpruefung_offen etc.).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const PRUEFUNG_SERVICE = "https://pruefung.butscher.cloud";

export type PrueferRolle = "erstpruefung" | "zweitpruefung";
export type PrueferTyp = "mensch" | "ki";
export type PrueferModus = "standard" | "adversariell" | null;
export type EntscheidungsVorschlag = "bewilligen" | "ablehnen" | "rueckfragen";
export type AbhakungStatus = "bestaetigt" | "widerspruch" | "unklar";
export type AbschnittStatus = "geprueft" | "offen";

export interface DissensEintrag {
  erst_befund_index: number | null;
  art: "widerspruch" | "neuer_befund" | "unbeantwortet";
  erst: { schwere: string; beschreibung: string } | null;
  zweit:
    | { schwere?: string; beschreibung?: string; paragraph_ref?: string;
        alternative_schwere?: string; begruendung?: string }
    | null;
  begruendung: string;
}

export interface AbhakungenJsonb {
  befunde?: Record<string, { status: AbhakungStatus; kommentar?: string }>;
  abschnitte?: Record<string, { status: AbschnittStatus; kommentar?: string }>;
  dissens?: DissensEintrag[];
  /** True wenn die KI-Zweitprüfung eine strukturierte (= auswertbare)
   *  Antwort geliefert hat. False = JSON-Parsing fehlgeschlagen oder die
   *  KI hat einen leeren Code-Block produziert. UI nutzt das, um den
   *  Unterschied zwischen 'echtes Schweigen' und 'differenzierte Beurteilung'
   *  sichtbar zu machen. */
  ki_strukturiert?: boolean;
}

export interface PruefungRow {
  id: string;
  antrag_id: string;
  rolle: PrueferRolle;
  pruefer_typ: PrueferTyp;
  pruefer_id: string;
  pruefer_modus: PrueferModus;
  pruefprotokoll_id: string | null;
  abhakungen_jsonb: AbhakungenJsonb;
  gesamt_kommentar: string | null;
  entscheidungs_vorschlag: EntscheidungsVorschlag | null;
  abgeschlossen_am: string | null;
  angelegt_am: string;
}

export function usePruefungen(antragId: string | undefined) {
  const [pruefungen, setPruefungen] = useState<PruefungRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kiZweitpruefungRunning, setKiZweitpruefungRunning] = useState(false);

  const reload = useCallback(async () => {
    if (!antragId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("pruefungen")
      .select("*")
      .eq("antrag_id", antragId)
      .order("angelegt_am", { ascending: true });
    setLoading(false);
    if (error) setError(error.message);
    else setPruefungen((data ?? []) as PruefungRow[]);
  }, [antragId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Erst- oder Zweitprüfung anlegen oder aktualisieren.
   *  abschliessen=true → setzt abgeschlossen_am und schaltet Antrags-Status weiter. */
  const upsert = useCallback(
    async (params: {
      id?: string;
      rolle: PrueferRolle;
      pruefer_typ: PrueferTyp;
      pruefer_id: string;
      pruefer_modus?: PrueferModus;
      pruefprotokoll_id?: string | null;
      abhakungen_jsonb?: AbhakungenJsonb;
      gesamt_kommentar?: string | null;
      entscheidungs_vorschlag?: EntscheidungsVorschlag | null;
      abschliessen?: boolean;
      bewilligte_summe_euro?: number | null;
    }) => {
      if (!antragId) return { error: "Kein Antrag" };
      try {
        const res = await fetch(`${PRUEFUNG_SERVICE}/api/pruefung`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ antrag_id: antragId, ...params }),
        });
        if (!res.ok) {
          const txt = await res.text();
          setError(`Speichern fehlgeschlagen: ${res.status} ${txt}`);
          return { error: txt };
        }
        const result = await res.json();
        await reload();
        return { result };
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        return { error: msg };
      }
    },
    [antragId, reload],
  );

  /** Triggert KI-Zweitprüfung im adversariellen Modus auf Basis der
   *  letzten Erstprüfung. Persistiert pruefprotokoll + pruefungen-Eintrag. */
  const triggerKiZweitpruefung = useCallback(async () => {
    if (!antragId) return { error: "Kein Antrag" };
    setKiZweitpruefungRunning(true);
    setError(null);
    try {
      const res = await fetch(`${PRUEFUNG_SERVICE}/api/pruefung/ki-zweitpruefung`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ antrag_id: antragId }),
      });
      if (!res.ok) {
        const txt = await res.text();
        setError(`KI-Zweitprüfung fehlgeschlagen: ${res.status} ${txt}`);
        return { error: txt };
      }
      const result = await res.json();
      await reload();
      return { result };
    } finally {
      setKiZweitpruefungRunning(false);
    }
  }, [antragId, reload]);

  /** Löscht eine Prüfungs-Bewertung (typisch: Zweitprüfung zurücksetzen,
   *  um sie neu zu starten — z.B. nach kaputtem KI-Lauf).
   *
   *  Läuft über pruefung-service, nicht direkt via Supabase: der Service
   *  benutzt den SERVICE_ROLE_KEY und umgeht damit RLS-Probleme
   *  (Owner-Issue der bescheide-Tabelle, fehlende DELETE-Policies etc.).
   *  Der Backend-Endpoint kümmert sich auch um Status-Rollback. */
  const loesche = useCallback(
    async (pruefungId: string) => {
      if (!antragId) return { error: "Kein Antrag" };
      try {
        const res = await fetch(
          `${PRUEFUNG_SERVICE}/api/pruefung/${pruefungId}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const txt = await res.text();
          const msg = `Löschen fehlgeschlagen: ${res.status} ${txt}`;
          setError(msg);
          return { error: msg };
        }
        await reload();
        return {};
      } catch (e) {
        const msg = `Löschen fehlgeschlagen: ${(e as Error).message}`;
        setError(msg);
        return { error: msg };
      }
    },
    [antragId, reload],
  );

  const erstpruefung = pruefungen.find((p) => p.rolle === "erstpruefung");
  const zweitpruefung = pruefungen.find((p) => p.rolle === "zweitpruefung");

  return {
    pruefungen,
    erstpruefung,
    zweitpruefung,
    loading,
    error,
    kiZweitpruefungRunning,
    upsert,
    triggerKiZweitpruefung,
    loesche,
    reload,
  };
}
