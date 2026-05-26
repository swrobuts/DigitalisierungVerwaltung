// Render-Smoke-Test pro Page. Wir initialisieren den Provider mit einem
// vorgefertigten State (sonst leitet die Page auf "/" um, weil kein FB gesetzt).

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AntragProvider, type AntragState } from "../src/state/AntragContext";
import { Phase1Antragsteller } from "../src/pages/Phase1Antragsteller";
import { Phase2Dispatch } from "../src/pages/Phase2Dispatch";
import { Phase3Anlagen } from "../src/pages/Phase3Anlagen";

function renderWith(page: React.ReactNode, patch: Partial<AntragState>) {
  return render(
    <MemoryRouter>
      <AntragProvider initial={patch}>
        {page}
      </AntragProvider>
    </MemoryRouter>,
  );
}

describe("Page-Render-Smoke", () => {
  it("Phase 1 zeigt den Antragsteller-Block (mit FB I gesetzt)", () => {
    renderWith(<Phase1Antragsteller />, { foerderbereich: "I" });
    // Der Text "Angaben zum Antragsteller" steht zweimal im DOM:
    // einmal als Page-Heading, einmal in der Stepper-Preview oben.
    // → getAllByText nutzen statt getByText.
    expect(screen.getAllByText(/Angaben zum Antragsteller/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/IBAN/)).toBeInTheDocument();
  });

  it("Phase 2 — FB I rendert Projektkosten-Felder", () => {
    renderWith(<Phase2Dispatch />, { foerderbereich: "I" });
    expect(screen.getByText(/Aufbau eines neuen Angebots/)).toBeInTheDocument();
  });

  it("Phase 2 — FB II rendert Helfer-Tabelle", () => {
    renderWith(<Phase2Dispatch />, { foerderbereich: "II" });
    expect(screen.getByText(/Bürgerschaftliches Engagement/)).toBeInTheDocument();
    expect(screen.getByText(/Helfer:in hinzufügen/)).toBeInTheDocument();
  });

  it("Phase 2 — FB III zeigt 4 Variante-Karten", () => {
    renderWith(<Phase2Dispatch />, { foerderbereich: "III" });
    expect(screen.getByTestId("variante-A")).toBeInTheDocument();
    expect(screen.getByTestId("variante-D")).toBeInTheDocument();
  });

  it("Phase 2 — FB IV zeigt formloser-Antrag-Hinweis + PDF-Upload-Input", () => {
    renderWith(<Phase2Dispatch />, { foerderbereich: "IV" });
    // Hinweis-Section ist standardmäßig offen — der Begriff
    // „formloser Antrag" kommt mehrfach vor (Lead, Hinweis-Body).
    expect(screen.getAllByText(/formloser Antrag/i).length).toBeGreaterThan(0);
    // PDF-Upload-Section ist standardmäßig offen
    expect(screen.getByLabelText(/Formloser Antrag als PDF/)).toBeInTheDocument();
    // alte erfundene Felder dürfen nicht mehr vorkommen
    expect(screen.queryByText(/Geplante Maßnahmen/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Beantragte Summe/i)).not.toBeInTheDocument();
  });

  it("Phase 3 zeigt Anlagen-Slot für FB I (Projektskizze)", () => {
    renderWith(<Phase3Anlagen />, { foerderbereich: "I" });
    expect(screen.getByText(/Projektskizze/)).toBeInTheDocument();
  });
});
