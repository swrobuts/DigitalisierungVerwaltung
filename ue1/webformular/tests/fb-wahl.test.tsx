import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AntragProvider } from "../src/state/AntragContext";
import { FBWahl } from "../src/pages/FBWahl";

function renderWithCtx() {
  return render(
    <MemoryRouter>
      <AntragProvider>
        <FBWahl />
      </AntragProvider>
    </MemoryRouter>,
  );
}

describe("FBWahl-Page", () => {
  it("rendert alle 4 Förderbereich-Karten", () => {
    renderWithCtx();
    expect(screen.getByTestId("fb-card-I")).toBeInTheDocument();
    expect(screen.getByTestId("fb-card-II")).toBeInTheDocument();
    expect(screen.getByTestId("fb-card-III")).toBeInTheDocument();
    expect(screen.getByTestId("fb-card-IV")).toBeInTheDocument();
  });

  it("zeigt den Mini-Wizard-Trigger an", () => {
    renderWithCtx();
    expect(screen.getByText(/Mini-Wizard starten/)).toBeInTheDocument();
  });
});
