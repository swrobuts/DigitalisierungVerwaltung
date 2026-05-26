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

  it("rendert neutralen Befund mit Quellen + Konfidenz", () => {
    validierungState.data = {
      befunde: [
        {
          name: "adresse",
          titel: "Adress-Existenz + Stadtgebiet",
          art: "neutral",
          konfidenz: 0.92,
          kommentar: "Adresse in Verzeichnissen belegt, Stadtteil Heuchelhof.",
          quellen: ["https://wuerzburgwiki.de/wiki/Berner_Stra%C3%9Fe"],
          details: { adresse_existiert: true },
          parse_fehler: false,
        },
      ],
      summary: { kritisch: 0, neutral: 1, fehler: 0 },
      geprueft_am: "2026-05-26T10:00:00Z",
    };
    render(<ExterneValidierungCard antragId="a-1" />);
    expect(screen.getByText(/1 Recherche ohne Auffälligkeit/)).toBeInTheDocument();
    expect(screen.getByText(/Adress-Existenz \+ Stadtgebiet/)).toBeInTheDocument();
    expect(screen.getByText(/Heuchelhof/)).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("wuerzburgwiki.de")).toBeInTheDocument();
  });

  it("hebt kritischen Befund hervor und zählt Summary", () => {
    validierungState.data = {
      befunde: [
        {
          name: "traeger",
          titel: "Träger-Existenz",
          art: "kritisch",
          konfidenz: 0.7,
          kommentar: "Träger im Vereinsregister nicht eindeutig auffindbar.",
          quellen: [],
          parse_fehler: false,
        },
        {
          name: "adresse",
          titel: "Adresse",
          art: "neutral",
          konfidenz: 0.95,
          kommentar: "Adresse bestätigt.",
          quellen: [],
        },
      ],
      summary: { kritisch: 1, neutral: 1, fehler: 0 },
      geprueft_am: "2026-05-26T10:00:00Z",
    };
    render(<ExterneValidierungCard antragId="a-1" />);
    expect(screen.getByText(/1 Auffälligkeit gefunden/)).toBeInTheDocument();
    expect(screen.getByText(/Träger im Vereinsregister/)).toBeInTheDocument();
  });

  it("zeigt parse_fehler-Hinweis bei unsicher geparsten Antworten", () => {
    validierungState.data = {
      befunde: [
        {
          name: "einrichtung",
          titel: "Einrichtungstyp",
          art: "neutral",
          konfidenz: 0.4,
          kommentar: "Konnte nicht eindeutig zugeordnet werden.",
          quellen: [],
          parse_fehler: true,
        },
      ],
      summary: { kritisch: 0, neutral: 1, fehler: 0 },
      geprueft_am: "2026-05-26T10:00:00Z",
    };
    render(<ExterneValidierungCard antragId="a-1" />);
    expect(
      screen.getByText(/Antwort konnte nicht sicher geparst werden/),
    ).toBeInTheDocument();
  });

  it("zeigt Fehler-Banner wenn error gesetzt ist", () => {
    validierungState.error = "HTTP 500";
    render(<ExterneValidierungCard antragId="a-1" />);
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
  });
});
