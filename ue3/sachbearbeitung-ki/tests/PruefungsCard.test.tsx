import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PruefungsCard } from "../src/components/PruefungsCard";

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

describe("PruefungsCard", () => {
  it("zeigt den Konformitäts-Button wenn keine Prüfung vorliegt", () => {
    render(<PruefungsCard antragId="a-1" />);
    expect(screen.getByText("Konformität per KI prüfen")).toBeInTheDocument();
  });

  it("rendert den Erklärtext zur AHP-Förderrichtlinie", () => {
    render(<PruefungsCard antragId="a-1" />);
    expect(screen.getByText(/AHP-Förderrichtlinie/i)).toBeInTheDocument();
  });
});
