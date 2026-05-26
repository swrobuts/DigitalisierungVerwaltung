import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AntragHeader } from "../src";
import type { Antrag, FbIProjekt, FbIiiVarianteRow } from "@dv/data-layer";

const BASE: Pick<
  Antrag,
  | "antragsnummer"
  | "haushaltsjahr"
  | "foerderbereich"
  | "status"
  | "submitted_at"
  | "einrichtung"
  | "dachverband"
  | "strasse"
  | "hausnummer"
  | "plz"
  | "ort"
> = {
  antragsnummer: "APL-2026-FBI-DEMO-3C226F",
  haushaltsjahr: 2026,
  foerderbereich: "I",
  status: "in_pruefung",
  submitted_at: "2026-05-25T15:37:00Z",
  einrichtung: "DEMO-Caritas Quartier Heuchelhof",
  dachverband: "Caritasverband Würzburg",
  strasse: "Berner Straße",
  hausnummer: "14",
  plz: "97084",
  ort: "Würzburg",
};

describe("AntragHeader", () => {
  it("rendert Stadt-Würzburg-Briefkopf + Aktenzeichen + Haushaltsjahr", () => {
    render(<AntragHeader antrag={BASE} />);
    expect(screen.getByText(/STADT WÜRZBURG/)).toBeInTheDocument();
    expect(screen.getByText(BASE.antragsnummer!)).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
  });

  it("zeigt FB-spezifischen Hero-Titel für FB I", () => {
    render(<AntragHeader antrag={BASE} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Aufbau niedrigschwelliger Angebote",
    );
  });

  it("zeigt FB-spezifischen Hero-Titel für FB III", () => {
    render(<AntragHeader antrag={{ ...BASE, foerderbereich: "III" }} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Förderung bewährter Strukturen",
    );
  });

  it("rendert Einrichtungs-Block mit rotem Linkrand (border-l, wue-rot)", () => {
    const { container } = render(<AntragHeader antrag={BASE} />);
    expect(screen.getByText("DEMO-Caritas Quartier Heuchelhof")).toBeInTheDocument();
    const block = container.querySelector(".border-wue-rot.border-l-\\[3px\\]");
    expect(block).toBeTruthy();
  });

  it("rendert Förder-Summary mit Summe aus FB-I-Detail (Personal + Sach)", () => {
    const fbI: FbIProjekt = {
      antrag_id: "x",
      projekt_titel: "x",
      laufzeit: null,
      stadtteil: null,
      personalkosten_euro: 12000,
      sachkosten_euro: 3000,
      drittmittel_jsonb: [],
      andere_mittel_jsonb: [],
    };
    render(<AntragHeader antrag={BASE} fbI={fbI} />);
    expect(screen.getByText(/15\.000,00.*€/)).toBeInTheDocument();
    expect(screen.getByText(/Personalkosten \+ Sachkosten/)).toBeInTheDocument();
  });

  it("rendert FB-II Summary als Pauschal", () => {
    render(<AntragHeader antrag={{ ...BASE, foerderbereich: "II" }} />);
    expect(screen.getByText("Pauschal")).toBeInTheDocument();
    expect(screen.getByText(/Helferstunden/)).toBeInTheDocument();
  });

  it("rendert FB-III/C Summary mit 600 € bei GT_10", () => {
    const fbIii: FbIiiVarianteRow = {
      antrag_id: "x",
      variante: "C",
      a_anmerkung: null,
      b_anzahl_veranstaltungen: null,
      b_teilnehmer_senioren: null,
      b_teilnehmer_generationen: null,
      b_stadtbewohner_anteil: null,
      b_quartierstreffen_teilnahme: null,
      b_quartiere: null,
      b_quartier_person_name: null,
      c_treffen_schwelle: "GT_10",
      c_teilnehmer_durchschnitt: null,
      c_quartierstreffen_anzahl: null,
      c_quartier_kooperation: null,
      c_quartier_person_name: null,
      d_hauptamt_name: null,
      d_hauptamt_stunden_woche: null,
      d_hauptamt_stunden_monat: null,
      d_ehrenamt_personen_jsonb: [],
    };
    render(<AntragHeader antrag={{ ...BASE, foerderbereich: "III" }} fbIii={fbIii} />);
    expect(screen.getByText("bis 600 €")).toBeInTheDocument();
  });

  it("rendert FB-III/A Summary mit 800 €", () => {
    const fbIii: FbIiiVarianteRow = {
      antrag_id: "x",
      variante: "A",
      a_anmerkung: null,
      b_anzahl_veranstaltungen: null,
      b_teilnehmer_senioren: null,
      b_teilnehmer_generationen: null,
      b_stadtbewohner_anteil: null,
      b_quartierstreffen_teilnahme: null,
      b_quartiere: null,
      b_quartier_person_name: null,
      c_treffen_schwelle: null,
      c_teilnehmer_durchschnitt: null,
      c_quartierstreffen_anzahl: null,
      c_quartier_kooperation: null,
      c_quartier_person_name: null,
      d_hauptamt_name: null,
      d_hauptamt_stunden_woche: null,
      d_hauptamt_stunden_monat: null,
      d_ehrenamt_personen_jsonb: [],
    };
    render(<AntragHeader antrag={{ ...BASE, foerderbereich: "III" }} fbIii={fbIii} />);
    expect(screen.getByText("bis 800 €")).toBeInTheDocument();
  });
});
