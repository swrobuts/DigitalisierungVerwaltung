/**
 * Tests für FB-spezifische Upload-Page.
 * - FB III ohne Variante → zeigt Varianten-Wahl (4 Optionen), kein Upload-Slot
 * - FB III mit Variante D → Stundenzettel-Slot ist Pflicht
 * - FB I → Hauptantrag + Projektskizze-Slot
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderFbUpload } from "../views/fb-upload";

describe("renderFbUpload", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("FB III ohne Variante zeigt Varianten-Wahl", () => {
    const view = renderFbUpload({ fb: "III", variante: null, navigate: vi.fn() });
    document.body.appendChild(view);
    const variantCards = document.querySelectorAll(".variante-grid .fb-card");
    expect(variantCards.length).toBe(4);
    // Kein Upload-Slot
    expect(document.querySelectorAll(".upload-zone").length).toBe(0);
  });

  it("FB III + Variante D → Hauptantrag + Stundenzettel-Pflicht", () => {
    const view = renderFbUpload({ fb: "III", variante: "D", navigate: vi.fn() });
    document.body.appendChild(view);
    const rows = document.querySelectorAll(".antrag-row");
    expect(rows.length).toBe(2);
    // Beide Pflicht (nicht „antrag-row-optional")
    expect(rows[1]?.classList.contains("antrag-row-optional")).toBe(false);
    const titel = rows[1]?.querySelector(".antrag-section-title")?.textContent;
    expect(titel).toBe("Stundenzettel");
  });

  it("FB I → Hauptantrag (Pflicht) + Projektskizze (laut Plugin Pflicht)", () => {
    const view = renderFbUpload({ fb: "I", variante: null, navigate: vi.fn() });
    document.body.appendChild(view);
    const rows = document.querySelectorAll(".antrag-row");
    expect(rows.length).toBe(2);
    expect(rows[1]?.querySelector(".antrag-section-title")?.textContent).toBe("Projektskizze");
  });

  it("FB II → Hauptantrag + Helferliste (optional)", () => {
    const view = renderFbUpload({ fb: "II", variante: null, navigate: vi.fn() });
    document.body.appendChild(view);
    const rows = document.querySelectorAll(".antrag-row");
    expect(rows.length).toBe(2);
    expect(rows[1]?.classList.contains("antrag-row-optional")).toBe(true);
    expect(rows[1]?.querySelector(".antrag-section-title")?.textContent).toBe("Helferliste");
  });

  it("FB IV → Hauptantrag + Beliebige Anlagen (optional)", () => {
    const view = renderFbUpload({ fb: "IV", variante: null, navigate: vi.fn() });
    document.body.appendChild(view);
    const rows = document.querySelectorAll(".antrag-row");
    expect(rows.length).toBe(2);
    expect(rows[1]?.classList.contains("antrag-row-optional")).toBe(true);
    expect(rows[1]?.querySelector(".antrag-section-title")?.textContent).toBe("Beliebige Anlagen");
  });
});
