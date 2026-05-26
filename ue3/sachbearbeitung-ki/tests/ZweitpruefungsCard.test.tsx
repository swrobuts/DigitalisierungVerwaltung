import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZweitpruefungsCard } from "../src/components/ZweitpruefungsCard";

// Mock-State, der pro Test überschrieben werden kann
const pruefungenState: {
  zweitpruefung: unknown;
  error: string | null;
} = {
  zweitpruefung: undefined,
  error: null,
};
const pruefungState: { latest: unknown } = { latest: null };

vi.mock("../src/hooks/usePruefungen", () => ({
  usePruefungen: () => ({
    pruefungen: [],
    erstpruefung: undefined,
    zweitpruefung: pruefungenState.zweitpruefung,
    loading: false,
    error: pruefungenState.error,
    kiZweitpruefungRunning: false,
    upsert: vi.fn().mockResolvedValue({}),
    triggerKiZweitpruefung: vi.fn().mockResolvedValue({}),
    loesche: vi.fn().mockResolvedValue({}),
    reload: vi.fn(),
  }),
}));

vi.mock("../src/hooks/usePruefung", () => ({
  usePruefung: () => ({
    latest: pruefungState.latest,
    loading: false,
    running: false,
    error: null,
    pruefen: vi.fn(),
    downloadPdf: vi.fn(),
    reload: vi.fn(),
  }),
}));

vi.mock("../src/hooks/useSession", () => ({
  useSession: () => ({
    session: { user: { email: "test@thws.de" } } as never,
    loading: false,
  }),
}));

describe("ZweitpruefungsCard", () => {
  beforeEach(() => {
    pruefungenState.zweitpruefung = undefined;
    pruefungenState.error = null;
    pruefungState.latest = null;
  });

  it("zeigt optionalen Trigger wenn keine Pflicht und keine Zweitprüfung existiert", () => {
    render(<ZweitpruefungsCard antragId="a-1" />);
    expect(screen.getByText(/Zweitprüfung \(optional\)/)).toBeInTheDocument();
    // Auswahl-Buttons sichtbar
    expect(screen.getByText("Ich selbst")).toBeInTheDocument();
    expect(screen.getByText("Andere Person")).toBeInTheDocument();
    expect(screen.getByText("KI adversariell")).toBeInTheDocument();
  });

  it("markiert Zweitprüfung als pflichtig wenn KI eine Ablehnung empfiehlt", () => {
    pruefungState.latest = {
      id: "p-1",
      antrag_id: "a-1",
      geprueft_am: "2026-05-26T10:00:00Z",
      geprueft_von: null,
      doctree_version: null,
      duration_ms: null,
      pdf_storage_path: null,
      ergebnis_jsonb: {
        befunde: [],
        empfehlung: {
          aktion: "ablehnen",
          begruendung: "Verstoß",
          nicht_heilbare_verstoesse: [],
          heilbare_verstoesse: [],
        },
      },
    };
    render(<ZweitpruefungsCard antragId="a-1" />);
    expect(screen.getByText(/Zweitprüfung erforderlich/)).toBeInTheDocument();
    expect(screen.getByText(/Vier-Augen-Prinzip vorgeschrieben/)).toBeInTheDocument();
  });

  it("rendert Body inklusive Befund-Checkliste wenn Zweitprüfung existiert", () => {
    pruefungState.latest = {
      id: "p-1",
      antrag_id: "a-1",
      geprueft_am: "2026-05-26T10:00:00Z",
      geprueft_von: null,
      doctree_version: null,
      duration_ms: null,
      pdf_storage_path: null,
      ergebnis_jsonb: {
        befunde: [
          {
            schwere: "verstoss",
            layer: "A",
            beschreibung: "Fehlende Anlage",
          },
        ],
      },
    };
    pruefungenState.zweitpruefung = {
      id: "z-1",
      antrag_id: "a-1",
      rolle: "zweitpruefung",
      pruefer_typ: "mensch",
      pruefer_id: "test@thws.de",
      pruefer_modus: null,
      pruefprotokoll_id: "p-1",
      abhakungen_jsonb: {},
      gesamt_kommentar: null,
      entscheidungs_vorschlag: null,
      abgeschlossen_am: null,
      angelegt_am: "2026-05-26T10:01:00Z",
    };
    render(<ZweitpruefungsCard antragId="a-1" />);
    expect(screen.getByText(/Befunde der Erstprüfung/)).toBeInTheDocument();
    expect(screen.getByText(/Fehlende Anlage/)).toBeInTheDocument();
    expect(screen.getByText("Antrags-Abschnitte")).toBeInTheDocument();
  });
});
