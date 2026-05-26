import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BescheideListe } from "../src/components/BescheideListe";
import type { BescheidRow } from "../src/hooks/useBescheide";

describe("BescheideListe", () => {
  it("rendert nichts bei leerer Liste (Component returnt null)", () => {
    const { container } = render(
      <BescheideListe
        bescheide={[]}
        onOpen={vi.fn()}
        onOpenDocx={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("zeigt einen Bescheid mit Entscheidung 'Bewilligt'", () => {
    const b: BescheidRow = {
      id: "b-1",
      antrag_id: "a-1",
      entscheidung: "bewilligt",
      bewilligte_summe_euro: 1500,
      bearbeiter_kommentar: null,
      ausgestellt_von: "sb@example.com",
      ausgestellt_am: new Date().toISOString(),
      pdf_storage_path: "bescheide/b-1.pdf",
      doctree_version: "v1",
    };
    render(
      <BescheideListe
        bescheide={[b]}
        onOpen={vi.fn()}
        onOpenDocx={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // Gruppen-Titel + Bescheid-Zeile beide enthalten "Bewilligt"
    expect(screen.getAllByText("Bewilligt").length).toBeGreaterThan(0);
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("DOCX")).toBeInTheDocument();
  });
});
