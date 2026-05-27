import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AntragVorschau } from "../src/components/AntragVorschau";

describe("AntragVorschau", () => {
  it("zeigt Onboarding-Steps im Empty-State (statt leerer Cards)", () => {
    render(<AntragVorschau draft={{}} />);
    expect(screen.getByText(/So funktioniert CIVA/)).toBeInTheDocument();
    expect(screen.getByText(/Vorhaben beschreiben/)).toBeInTheDocument();
    expect(screen.getByText(/Förderbereich finden/)).toBeInTheDocument();
    expect(screen.getByText(/Antrag übernehmen/)).toBeInTheDocument();
    // Im Empty-State KEINE leeren Pflichtfeld-Karten („0 von 11") und
    // KEINE FB-Karte mit Erkennungs-Platzhalter — die erscheinen erst,
    // sobald der Dialog tatsächlich was produziert.
    expect(screen.queryByText(/0 von 11/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Noch nicht erkannt/)).not.toBeInTheDocument();
  });

  it("zeigt FB-Label wenn FB gesetzt", () => {
    render(<AntragVorschau draft={{ foerderbereich: "II" }} />);
    expect(screen.getByTestId("fb-display")).toHaveTextContent("FB II");
    expect(screen.getByText(/Pauschale Förderung Ehrenamt/)).toBeInTheDocument();
  });

  it("zeigt FB III + Variante C korrekt", () => {
    render(
      <AntragVorschau
        draft={{ foerderbereich: "III", fb_iii_variante: "C" }}
      />,
    );
    expect(screen.getByTestId("fb-display")).toHaveTextContent("FB III");
    expect(screen.getByTestId("fb-display")).toHaveTextContent("Variante C");
    expect(screen.getByText(/Seniorenkreis/)).toBeInTheDocument();
  });

  it("Progressbar reflektiert ausgefüllte Felder", () => {
    render(
      <AntragVorschau
        draft={{
          foerderbereich: "II",
          antragsteller: { einrichtung: "AWO", email: "x@y.de" },
        }}
      />,
    );
    expect(screen.getByText(/2 von 11/)).toBeInTheDocument();
  });

  it("zeigt Erfolgs-Card bei submitted-Status mit Antragsnummer", () => {
    render(
      <AntragVorschau
        draft={{
          foerderbereich: "II",
          status: "submitted",
          antragsnummer: "AHP-2026-II-ABC123",
        }}
      />,
    );
    const card = screen.getByTestId("submitted-card");
    expect(card).toHaveTextContent("AHP-2026-II-ABC123");
  });
});
