import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePruefung } from "../../src/hooks/usePruefung";

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: "http://signed" }, error: null }),
      }),
    },
  },
}));

describe("usePruefung", () => {
  it("liefert latest=null wenn keine Prüfung existiert", async () => {
    const { result } = renderHook(() => usePruefung("antrag-id"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.latest).toBeNull();
  });

  it("pruefen() ruft pruefung-service auf", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ protokoll_id: "p1", anzahl_verstoesse: 0 }),
    });
    const { result } = renderHook(() => usePruefung("antrag-id"));
    await act(async () => {
      await result.current.pruefen("test@example.com");
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://pruefung.butscher.cloud/api/pruefen",
      expect.objectContaining({ method: "POST" })
    );
  });
});
