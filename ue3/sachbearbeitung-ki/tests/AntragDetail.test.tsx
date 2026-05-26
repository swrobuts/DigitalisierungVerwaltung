/**
 * Smoke-Test für die AntragDetail-Vollrestoration (Etappe D).
 *
 * Verifiziert, dass das neue Layout — Stepper, Metrics-Bar, AntragViewer,
 * PruefungsCard, BescheideListe, Workflow-Card, VorjahresVergleich,
 * HistoryTimeline — crashfrei rendert. Bewusst flach: keine Behaviour-
 * Tests (die wohnen in den Komponenten-Tests), nur Layout-Sanity.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import type { Antrag } from "@dv/data-layer";

// ── Hooks mocken ───────────────────────────────────────────────────
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

vi.mock("../src/hooks/useAntrag", () => ({
  useAntrag: () => ({
    bundle: {
      antrag: baseAntrag,
      anlagen: [],
      history: [],
      fb_i: null,
      fb_ii: null,
      fb_ii_helfer: [],
      fb_iii: null,
      fb_iv: null,
    },
    loading: false,
    error: null,
    reload: vi.fn(),
    changeStatus: vi.fn(async () => ({ error: null })),
  }),
}));

vi.mock("../src/hooks/useBescheide", () => ({
  useBescheide: () => ({
    bescheide: [],
    loading: false,
    error: null,
    creating: false,
    erstelleBescheid: vi.fn(),
    downloadBescheidPdf: vi.fn(),
    downloadBescheidDocx: vi.fn(),
    loeschBescheid: vi.fn(),
    reload: vi.fn(),
  }),
}));

vi.mock("../src/hooks/usePruefung", () => ({
  usePruefung: () => ({
    latest: null,
    loading: false,
    running: false,
    error: null,
    pruefen: vi.fn(),
    downloadPdf: vi.fn(),
    reload: vi.fn(),
  }),
}));

vi.mock("../src/hooks/usePruefungen", () => ({
  usePruefungen: () => ({
    pruefungen: [],
    erstpruefung: undefined,
    zweitpruefung: undefined,
    loading: false,
    error: null,
    kiZweitpruefungRunning: false,
    upsert: vi.fn().mockResolvedValue({}),
    triggerKiZweitpruefung: vi.fn().mockResolvedValue({}),
    loesche: vi.fn().mockResolvedValue({}),
    reload: vi.fn(),
  }),
}));

vi.mock("../src/hooks/useSession", () => ({
  useSession: () => ({
    session: { user: { email: "test@thws.de" } } as never,
    loading: false,
  }),
}));

vi.mock("../src/hooks/useAhpTree", () => ({
  useAhpTree: () => ({ tree: null, loading: false }),
  findNodeByPath: () => null,
  pathFromParagraphRef: () => null,
}));

vi.mock("../src/hooks/useExterneValidierung", () => ({
  useExterneValidierung: () => ({
    data: null,
    running: false,
    error: null,
    validieren: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../src/hooks/useVergleichVorjahr", () => ({
  useVergleichVorjahr: () => ({
    data: null,
    loading: true, // Lade-Zustand, damit die Karte gerendert wird (statt null)
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock("../src/hooks/useManuellePruefung", () => ({
  ManuellePruefungProvider: ({ children }: { children: React.ReactNode }) => children,
  useManuellePruefungContext: () => ({
    loading: false,
    error: null,
    get: () => ({
      status: "offen",
      kommentar: null,
      geprueft_am: null,
      geprueft_von: null,
    }),
    save: vi.fn(async () => ({ error: null })),
  }),
}));

// Supabase-Stub für AntragMetricsBar's pruefprotokoll-Query
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ count: 0 }),
      }),
    }),
  },
}));

// AntragViewer aus dem Renderer-Paket flachstubben, damit der Test
// nicht an FB-Schema-Wiring scheitert.
vi.mock("@dv/antrag-renderer", () => ({
  AntragViewer: () => <div data-testid="antrag-viewer">[FB-Renderer-Stub]</div>,
}));

// DemoDatenBanner greift auf window.localStorage zu — in der aktuellen
// Vitest-Config nicht zuverlässig verfügbar. Stubben, der Banner ist für
// dieses Layout-Smoke-Test irrelevant.
vi.mock("../src/components/DemoDatenBanner", () => ({
  DemoDatenBanner: () => null,
}));

import { AntragDetail } from "../src/pages/AntragDetail";

describe("AntragDetail (Etappe D — Vollrestoration)", () => {
  it("rendert das komplette Layout ohne Crash", () => {
    render(
      <MemoryRouter initialEntries={["/antrag/a-1"]}>
        <Routes>
          <Route path="/antrag/:id" element={<AntragDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    // Header
    expect(screen.getByText("2026-001")).toBeInTheDocument();
    expect(screen.getByText("KI-Variante (UE3)")).toBeInTheDocument();

    // Bearbeitungsstand-Stepper (alle 3 Schritt-Labels). 'In Prüfung'
    // erscheint zweimal — einmal im Stepper, einmal im StatusBadge.
    expect(screen.getByText("Eingegangen")).toBeInTheDocument();
    expect(screen.getAllByText("In Prüfung").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Entschieden")).toBeInTheDocument();

    // AntragMetricsBar (Header-Streifen)
    expect(screen.getByText("Prozess-Metriken")).toBeInTheDocument();

    // AntragViewer-Stub
    expect(screen.getByTestId("antrag-viewer")).toBeInTheDocument();

    // PruefungsCard
    expect(screen.getByText("Konformität per KI prüfen")).toBeInTheDocument();

    // ZweitpruefungsCard (optional, weil keine Pflicht-Empfehlung)
    expect(screen.getByText(/Zweitprüfung \(optional\)/)).toBeInTheDocument();

    // Workflow-Card
    expect(screen.getByText("Workflow · Status-Wechsel")).toBeInTheDocument();

    // VorjahresVergleich (Lade-Zustand)
    expect(screen.getByText("Vorjahres-Vergleich")).toBeInTheDocument();

    // ExterneValidierungCard — Titel kann mehrfach im DOM stehen
    // (CardTitle + ggf. Erwähnung in Hinweis-Text)
    expect(screen.getAllByText("Externe Validierung").length).toBeGreaterThanOrEqual(1);

    // HistoryTimeline-Wrapper
    expect(screen.getByText("Verlauf")).toBeInTheDocument();
  });
});
