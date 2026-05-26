import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePruefungen } from "../../src/hooks/usePruefungen";

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({
            data: [
              { id: "p1", antrag_id: "a1", rolle: "erstpruefung", pruefer_typ: "mensch",
                pruefer_id: "test@example.com", angelegt_am: "2026-05-26T10:00:00Z",
                abhakungen_jsonb: {}, abgeschlossen_am: null, gesamt_kommentar: null,
                entscheidungs_vorschlag: null, pruefprotokoll_id: null, pruefer_modus: null },
              { id: "p2", antrag_id: "a1", rolle: "zweitpruefung", pruefer_typ: "ki",
                pruefer_id: "claude-sonnet-4-5", angelegt_am: "2026-05-26T10:05:00Z",
                abhakungen_jsonb: {}, abgeschlossen_am: null, gesamt_kommentar: null,
                entscheidungs_vorschlag: null, pruefprotokoll_id: null, pruefer_modus: "adversariell" },
            ],
            error: null,
          }),
        }),
      }),
    }),
  },
}));

describe("usePruefungen", () => {
  it("trennt Erst- und Zweitprüfung", async () => {
    const { result } = renderHook(() => usePruefungen("a1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pruefungen.length).toBe(2);
    expect(result.current.erstpruefung?.rolle).toBe("erstpruefung");
    expect(result.current.zweitpruefung?.rolle).toBe("zweitpruefung");
    expect(result.current.zweitpruefung?.pruefer_typ).toBe("ki");
  });
});
