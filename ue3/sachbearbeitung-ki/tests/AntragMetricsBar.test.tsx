import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Antrag } from "@dv/data-layer";
import { AntragMetricsBar } from "../src/components/AntragMetricsBar";

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_col: string, _val: string) =>
          // Supabase-Pattern: `eq().then(cb)` wird aufgerufen — wir liefern
          // direkt einen Promise-Mock mit count.
          Promise.resolve({ count: 0 }),
      }),
    }),
  },
}));

const baseAntrag: Antrag = {
  id: "a-1",
  antragsnummer: "2026-001",
  haushaltsjahr: 2026,
  foerderbereich: "I",
  dachverband: null,
  einrichtung: "Test e.V.",
  ansprechpartner: "Erika Mustermann",
  strasse: "Hauptstr.",
  hausnummer: "1",
  plz: "97070",
  ort: "Würzburg",
  telefon: "0931 123",
  email: "test@example.com",
  homepage: null,
  bankname: "Sparkasse",
  iban: "DE00 0000 0000 0000 0000 00",
  bic: "BYLADEM1SWU",
  status: "in_pruefung",
  submitted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  submitted_language: "de",
  user_agent: null,
  ip_address: null,
};

describe("AntragMetricsBar", () => {
  it("rendert ohne Crash mit leerer History und 0 Bescheiden", () => {
    render(<AntragMetricsBar antrag={baseAntrag} history={[]} bescheideCount={0} />);
    expect(screen.getByText("Prozess-Metriken")).toBeInTheDocument();
    expect(screen.getByText("Seit Einreichung")).toBeInTheDocument();
    expect(screen.getAllByText("Bescheide").length).toBeGreaterThan(0);
  });

  it("zeigt 'Durchlaufzeit' bei bewilligtem Antrag, 'In Bearbeitung' sonst", () => {
    const { rerender } = render(
      <AntragMetricsBar antrag={baseAntrag} history={[]} bescheideCount={0} />,
    );
    expect(screen.getByText("In Bearbeitung")).toBeInTheDocument();
    rerender(
      <AntragMetricsBar
        antrag={{ ...baseAntrag, status: "bewilligt" }}
        history={[]}
        bescheideCount={1}
      />,
    );
    expect(screen.getByText("Durchlaufzeit")).toBeInTheDocument();
  });
});
