import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExterneValidierungCard } from "../src/components/ExterneValidierungCard";

const validierungState: {
  data: unknown;
  running: boolean;
  error: string | null;
} = {
  data: null,
  running: false,
  error: null,
};

vi.mock("../src/hooks/useExterneValidierung", () => ({
  useExterneValidierung: () => ({
    data: validierungState.data,
    running: validierungState.running,
    error: validierungState.error,
    validieren: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe("ExterneValidierungCard", () => {
  beforeEach(() => {
    validierungState.data = null;
    validierungState.running = false;
    validierungState.error = null;
  });

  it("zeigt den Recherche-Button im Idle-Zustand", () => {
    render(<ExterneValidierungCard antragId="a-1" />);
    expect(
      screen.getByRole("button", {
        name: /Mit öffentlichen Quellen abgleichen/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Träger, Adresse und Einrichtung/)).toBeInTheDocument();
  });

  it("zeigt Lade-Zustand wenn running=true", () => {
    validierungState.running = true;
    render(<ExterneValidierungCard antragId="a-1" />);
    expect(screen.getByText(/Recherche läuft/)).toBeInTheDocument();
  });

  it("rendert Zusammenfassung, Quellen und Warnungen wenn data vorhanden", () => {
    validierungState.data = {
      recherche_summary: "Träger ist als gemeinnütziger Verein eingetragen.",
      gefundene_quellen: [
        {
          url: "https://www.beispiel.de/verein",
          titel: "Vereinsregister-Eintrag",
          relevanz: "hoch",
        },
      ],
      warnungen: ["Adresse weicht von OSM-Eintrag ab"],
      geprueft_am: "2026-05-26T10:00:00Z",
    };
    render(<ExterneValidierungCard antragId="a-1" />);
    expect(
      screen.getByText(/Träger ist als gemeinnütziger Verein eingetragen/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Adresse weicht von OSM-Eintrag ab/)).toBeInTheDocument();
    expect(screen.getByText("Vereinsregister-Eintrag")).toBeInTheDocument();
    expect(screen.getByText("beispiel.de")).toBeInTheDocument();
  });

  it("zeigt Fehler-Banner wenn error gesetzt ist", () => {
    validierungState.error = "HTTP 500";
    render(<ExterneValidierungCard antragId="a-1" />);
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
  });
});
