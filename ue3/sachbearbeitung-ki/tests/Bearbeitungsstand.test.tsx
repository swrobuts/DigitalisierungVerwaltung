import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Bearbeitungsstand } from "../src/components/Bearbeitungsstand";

describe("Bearbeitungsstand", () => {
  it("zeigt alle drei Schritte mit ihren Labels", () => {
    render(<Bearbeitungsstand status="eingegangen" />);
    expect(screen.getByText("Eingegangen")).toBeInTheDocument();
    expect(screen.getByText("In Prüfung")).toBeInTheDocument();
    expect(screen.getByText("Entschieden")).toBeInTheDocument();
  });

  it("rendert das Entscheidung-Sub-Label nur bei Schritt 3 (bewilligt)", () => {
    render(<Bearbeitungsstand status="bewilligt" entscheidung="bewilligt" />);
    expect(screen.getByText("bewilligt")).toBeInTheDocument();
  });

  it("zeigt KEIN Entscheidung-Sub-Label, solange der Antrag noch in Prüfung ist", () => {
    render(<Bearbeitungsstand status="in_pruefung" entscheidung="bewilligt" />);
    // Sub-Label darf nicht erscheinen, wenn aktiver Schritt < 3
    expect(screen.queryByText("bewilligt")).toBeNull();
  });
});
