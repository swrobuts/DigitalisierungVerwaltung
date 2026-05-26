import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Bearbeitungsstand } from "../src";

describe("Bearbeitungsstand", () => {
  it("rendert die drei Phasen Eingegangen — In Prüfung — Entscheidung", () => {
    render(<Bearbeitungsstand status="eingegangen" sticky={false} />);
    expect(screen.getByText("Eingegangen")).toBeInTheDocument();
    expect(screen.getByText("In Prüfung")).toBeInTheDocument();
    expect(screen.getByText("Entscheidung")).toBeInTheDocument();
  });

  it("hebt Schritt 2 hervor wenn Status = in_pruefung", () => {
    render(<Bearbeitungsstand status="in_pruefung" sticky={false} />);
    const aktiv = screen.getByTestId("bearbeitungsstand-aktiv");
    expect(aktiv).toHaveTextContent("In Prüfung");
  });

  it("zeigt Rückfrage-Sub-Label, wenn Status = rueckfrage (Phase 2 aktiv)", () => {
    render(<Bearbeitungsstand status="rueckfrage" sticky={false} />);
    const aktiv = screen.getByTestId("bearbeitungsstand-aktiv");
    expect(aktiv).toHaveTextContent("In Prüfung");
    expect(aktiv).toHaveTextContent("Rückfrage");
  });

  it("hebt Schritt 3 mit Bewilligt-Sub-Label hervor wenn Status = bewilligt", () => {
    render(<Bearbeitungsstand status="bewilligt" sticky={false} />);
    const aktiv = screen.getByTestId("bearbeitungsstand-aktiv");
    expect(aktiv).toHaveTextContent("Entscheidung");
    expect(aktiv).toHaveTextContent("Bewilligt");
  });

  it("zeigt KEIN Sub-Label, wenn Status = eingegangen (Step-Label = Status-Label)", () => {
    render(<Bearbeitungsstand status="eingegangen" sticky={false} />);
    const aktiv = screen.getByTestId("bearbeitungsstand-aktiv");
    // Aktiver Step hat nur „Eingegangen" — kein Sub-Label
    expect(aktiv.textContent?.match(/Eingegangen/g)?.length).toBe(1);
  });
});
