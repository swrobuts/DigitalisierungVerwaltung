/**
 * Smoke-Tests fürs Multi-FB-Routing.
 * - FB-Wahl zeigt genau 4 Karten + Smart-Upload-Brücke
 * - Klick auf Karte navigiert mit korrekter ?fb=…-Query
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderFbWahl } from "../views/fb-wahl";

describe("renderFbWahl", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("rendert 4 FB-Karten", () => {
    const navigate = vi.fn();
    const view = renderFbWahl(navigate);
    document.body.appendChild(view);

    const cards = document.querySelectorAll(".fb-grid .fb-card");
    expect(cards.length).toBe(4);

    const romanNumerals = Array.from(cards).map(
      (c) => c.querySelector(".fb-card-roman")?.textContent,
    );
    expect(romanNumerals).toEqual(["FB I", "FB II", "FB III", "FB IV"]);
  });

  it("navigiert zu ?fb=II bei Klick auf zweite Karte", () => {
    const navigate = vi.fn();
    const view = renderFbWahl(navigate);
    document.body.appendChild(view);

    const cards = document.querySelectorAll(".fb-grid .fb-card");
    (cards[1] as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith("?fb=II");
  });

  it("zeigt Smart-Upload-Brücke + navigiert zu ?smart=1", () => {
    const navigate = vi.fn();
    const view = renderFbWahl(navigate);
    document.body.appendChild(view);

    const teaser = document.querySelector(".smart-upload-teaser");
    expect(teaser).not.toBeNull();

    const btn = teaser!.querySelector("button");
    (btn as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith("?smart=1");
  });
});
