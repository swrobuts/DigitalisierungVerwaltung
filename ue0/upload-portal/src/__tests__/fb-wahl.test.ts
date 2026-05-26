/**
 * Smoke-Tests fürs UE0 Multi-FB-Routing.
 *
 * Aktualisiert nach Umbau zur „zwei-wege"-UI (Smart-Upload = Weg A,
 * Förderbereich direkt = Weg B). FB-Karten haben jetzt `.fb-card-marker`
 * statt `.fb-card-roman`, und der Smart-Upload-Brücken-Button sitzt in
 * `.weg-card.weg-a .weg-card-btn` statt `.smart-upload-teaser`.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderFbWahl } from "../views/fb-wahl";

describe("renderFbWahl", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("rendert 4 FB-Karten mit korrekten Markern", () => {
    const navigate = vi.fn();
    const view = renderFbWahl(navigate);
    document.body.appendChild(view);

    const cards = document.querySelectorAll(".fb-grid .fb-card");
    expect(cards.length).toBe(4);

    const markers = Array.from(cards).map(
      (c) => c.querySelector(".fb-card-marker")?.textContent,
    );
    expect(markers).toEqual(["FB I", "FB II", "FB III", "FB IV"]);
  });

  it("navigiert zu ?fb=II bei Klick auf zweite Karte", () => {
    const navigate = vi.fn();
    const view = renderFbWahl(navigate);
    document.body.appendChild(view);

    const cards = document.querySelectorAll(".fb-grid .fb-card");
    (cards[1] as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith("?fb=II");
  });

  it("Weg-A-Button (Smart-Upload) navigiert zu ?smart=1", () => {
    const navigate = vi.fn();
    const view = renderFbWahl(navigate);
    document.body.appendChild(view);

    const wegA = document.querySelector(".weg-card.weg-a");
    expect(wegA).not.toBeNull();
    const btn = wegA!.querySelector(".weg-card-btn") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(navigate).toHaveBeenCalledWith("?smart=1");
  });
});
