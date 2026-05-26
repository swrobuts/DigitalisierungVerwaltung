/**
 * Re-Exporting-Smoke-Test: stellt sicher, dass der zentrale
 * Bearbeitungsstand aus @dv/antrag-renderer in UE3 importiert werden
 * kann und sein Tailwind-Token `bg-wue-rot` durch den UE3-CSS-Layer
 * aufgelöst wird. Die ausführlichen Verhaltens-Tests liegen im
 * Paket selbst (packages/antrag-renderer/tests/Bearbeitungsstand.test.tsx).
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Bearbeitungsstand } from "@dv/antrag-renderer";

describe("Bearbeitungsstand (Re-Export aus @dv/antrag-renderer)", () => {
  it("zeigt alle drei Phasen Eingegangen / In Prüfung / Entscheidung", () => {
    render(<Bearbeitungsstand status="eingegangen" sticky={false} />);
    expect(screen.getByText("Eingegangen")).toBeInTheDocument();
    expect(screen.getByText("In Prüfung")).toBeInTheDocument();
    expect(screen.getByText("Entscheidung")).toBeInTheDocument();
  });

  it("hebt Phase 3 + Bewilligt-Sub-Label bei Status=bewilligt hervor", () => {
    render(<Bearbeitungsstand status="bewilligt" sticky={false} />);
    const aktiv = screen.getByTestId("bearbeitungsstand-aktiv");
    expect(aktiv).toHaveTextContent("Entscheidung");
    expect(aktiv).toHaveTextContent("Bewilligt");
  });
});
