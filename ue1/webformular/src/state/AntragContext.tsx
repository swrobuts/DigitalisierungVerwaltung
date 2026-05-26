// React-Context mit localStorage-Persistierung für das UE1-Antragsformular.
// Bewusst eine einzige Form-Struktur — Optionalität pro FB regelt sich
// über `state.foerderbereich` und die `validation`-Funktionen pro Page.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { FoerderbereichId } from "@dv/foerderbereiche";
import type { FbIiiVarianteId, TreffenSchwelle } from "@dv/data-layer";

export interface HelferRow {
  name: string;
  vorname: string;
  einsatzbereich: string;
  eintritt: string;  // YYYY-MM-DD; PDF-Spalte „Eintritt"
  austritt: string;  // YYYY-MM-DD oder leer; PDF-Spalte „Austritt"
  stunden_monat: string;  // PDF-Spalte „Stunden monatlich"
  stunden_jahr: string;   // PDF-Spalte „Stunden jährlich"
}

export interface DrittmittelRow {
  geber: string;
  betrag_euro: string;
}

export interface AnlageEntry {
  anlagentyp: string;
  dateiname: string;
  groesse_bytes: number;
  storage_path?: string; // gesetzt nach Upload
  file?: File;            // lokal bis Upload
}

export interface AntragState {
  // Meta
  foerderbereich: FoerderbereichId | null;
  haushaltsjahr: number;

  // Antragsteller (Phase 1)
  dachverband: string;
  einrichtung: string;
  ansprechpartner: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  homepage: string;
  bankname: string;
  iban: string;
  bic: string;

  // FB I
  fb_i: {
    projekt_titel: string;
    laufzeit: string;
    stadtteil: string;
    personalkosten_euro: string;
    sachkosten_euro: string;
    drittmittel: DrittmittelRow[];
  };

  // FB II
  fb_ii: {
    ehrenamt_titel: string;
    anzahl_helfer_vorjahr: string;
    gesamt_helferstunden_vorjahr: string;
    direkter_kontakt_senioren: boolean;
    helfer: HelferRow[];
  };

  // FB III
  fb_iii: {
    variante: FbIiiVarianteId | null;
    a_anmerkung: string;
    b_anzahl_veranstaltungen: string;
    b_teilnehmer_senioren: string;
    b_teilnehmer_generationen: string;
    b_stadtbewohner_anteil: string;
    b_quartierstreffen_teilnahme: boolean;
    b_quartiere: string;
    b_quartier_person_name: string;
    c_treffen_schwelle: TreffenSchwelle | "";
    c_teilnehmer_durchschnitt: string;
    c_quartierstreffen_anzahl: string;
    c_quartier_kooperation: string;
    c_quartier_person_name: string;
    d_hauptamt_name: string;
    d_hauptamt_stunden_woche: string;
    d_hauptamt_stunden_monat: string;
  };

  // FB IV — formloser Antrag (siehe docs/PDF-FELDER-AUDIT-2026-05-26.md).
  // Stadt Würzburg sagt „FB IV: Formlos" — es gibt KEIN offizielles
  // Antragsformular-PDF. Pflicht ist nur der PDF-Upload des selbst
  // verfassten formlosen Antrags. Vorhaben-Titel + Kurzbeschreibung sind
  // optional und dienen ausschließlich als KI-Klassifikations-Hilfe für
  // das Backend-Routing.
  fb_iv: {
    vorhaben_titel: string;
    kurzbeschreibung: string;
    dokument_file?: File;
    dokument_dateiname?: string;
    dokument_groesse_bytes?: number;
  };

  // Anlagen
  anlagen: AnlageEntry[];
}

export const initialAntragState: AntragState = {
  foerderbereich: null,
  haushaltsjahr: new Date().getFullYear(),
  dachverband: "", einrichtung: "", ansprechpartner: "",
  strasse: "", hausnummer: "", plz: "", ort: "",
  telefon: "", email: "", homepage: "",
  bankname: "", iban: "", bic: "",
  fb_i: { projekt_titel: "", laufzeit: "", stadtteil: "",
    personalkosten_euro: "", sachkosten_euro: "", drittmittel: [] },
  fb_ii: { ehrenamt_titel: "", anzahl_helfer_vorjahr: "",
    gesamt_helferstunden_vorjahr: "", direkter_kontakt_senioren: false,
    helfer: [] },
  fb_iii: {
    variante: null,
    a_anmerkung: "",
    b_anzahl_veranstaltungen: "", b_teilnehmer_senioren: "",
    b_teilnehmer_generationen: "", b_stadtbewohner_anteil: "",
    b_quartierstreffen_teilnahme: false, b_quartiere: "",
    b_quartier_person_name: "",
    c_treffen_schwelle: "", c_teilnehmer_durchschnitt: "",
    c_quartierstreffen_anzahl: "", c_quartier_kooperation: "",
    c_quartier_person_name: "",
    d_hauptamt_name: "", d_hauptamt_stunden_woche: "",
    d_hauptamt_stunden_monat: "",
  },
  fb_iv: { vorhaben_titel: "", kurzbeschreibung: "" },
  anlagen: [],
};

interface Ctx {
  state: AntragState;
  setState: (updater: (s: AntragState) => AntragState) => void;
  reset: () => void;
}

const AntragContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "ue1.antrag.v1";

// Files lassen sich nicht in localStorage serialisieren — wir filtern sie raus.
function serializableClone(s: AntragState): AntragState {
  return {
    ...s,
    anlagen: s.anlagen.map((a) => ({
      anlagentyp: a.anlagentyp,
      dateiname: a.dateiname,
      groesse_bytes: a.groesse_bytes,
      storage_path: a.storage_path,
    })),
    fb_iv: {
      vorhaben_titel: s.fb_iv.vorhaben_titel,
      kurzbeschreibung: s.fb_iv.kurzbeschreibung,
      // dokument_file (File) wird bewusst nicht persistiert; Dateiname /
      // Größe behalten wir als Hinweis-Info im LocalStorage.
      dokument_dateiname: s.fb_iv.dokument_dateiname,
      dokument_groesse_bytes: s.fb_iv.dokument_groesse_bytes,
    },
  };
}

export function AntragProvider({ children, initial }: { children: ReactNode; initial?: Partial<AntragState> }): JSX.Element {
  const [state, setStateInner] = useState<AntragState>(() => {
    if (initial) return { ...initialAntragState, ...initial };
    try {
      if (typeof localStorage === "undefined" || typeof localStorage.getItem !== "function") {
        return initialAntragState;
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return initialAntragState;
      return { ...initialAntragState, ...JSON.parse(raw) };
    } catch {
      return initialAntragState;
    }
  });

  useEffect(() => {
    try {
      if (typeof localStorage === "undefined" || typeof localStorage.setItem !== "function") return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableClone(state)));
    } catch {
      // Quota / Privacy-Mode / jsdom-Stub: nicht weiter schlimm.
    }
  }, [state]);

  const setState = (updater: (s: AntragState) => AntragState) => {
    setStateInner((prev) => updater(prev));
  };
  const reset = () => {
    setStateInner(initialAntragState);
    try {
      if (typeof localStorage !== "undefined" && typeof localStorage.removeItem === "function") {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch { /* noop */ }
  };

  return (
    <AntragContext.Provider value={{ state, setState, reset }}>
      {children}
    </AntragContext.Provider>
  );
}

export function useAntrag(): Ctx {
  const ctx = useContext(AntragContext);
  if (!ctx) throw new Error("useAntrag muss innerhalb von <AntragProvider> aufgerufen werden");
  return ctx;
}
