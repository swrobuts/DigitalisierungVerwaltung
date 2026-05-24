import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Supabase-Client ───────────────────────────────────────────
// Speichert pro Test einen frischen Satz an Rows + zeichnet upsert-Aufrufe auf.
type Row = {
  paragraph: string;
  status: "offen" | "ok" | "fraglich" | "fehlt";
  kommentar: string | null;
  geprueft_am: string | null;
  geprueft_von: string | null;
};

const state: {
  rows: Row[];
  upsertCalls: Array<Record<string, unknown>>;
  upsertError: { message: string } | null;
} = { rows: [], upsertCalls: [], upsertError: null };

vi.mock("../src/lib/supabase", () => {
  function buildSelectChain(rows: Row[]) {
    return {
      eq: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    };
  }
  function from(_table: string) {
    return {
      select: vi.fn(() => buildSelectChain(state.rows)),
      upsert: vi.fn((payload: Record<string, unknown>) => {
        state.upsertCalls.push(payload);
        if (state.upsertError) {
          return {
            select: () => ({
              single: () =>
                Promise.resolve({ data: null, error: state.upsertError }),
            }),
          };
        }
        const merged: Row = {
          paragraph: String(payload.paragraph),
          status: payload.status as Row["status"],
          kommentar: (payload.kommentar as string | null) ?? null,
          geprueft_am: new Date().toISOString(),
          geprueft_von: null,
        };
        // mirror DB upsert: update or insert
        const idx = state.rows.findIndex(
          (r) => r.paragraph === merged.paragraph,
        );
        if (idx >= 0) state.rows[idx] = merged;
        else state.rows.push(merged);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: merged, error: null }),
          }),
        };
      }),
    };
  }
  return { supabase: { from } };
});

import {
  ManuellePruefungProvider,
  useManuellePruefung,
} from "../src/hooks/useManuellePruefung";
import { SektionPruefung } from "../src/components/SektionPruefung";
import { renderHook } from "@testing-library/react";

beforeEach(() => {
  state.rows = [];
  state.upsertCalls = [];
  state.upsertError = null;
});

describe("SektionPruefung (UI)", () => {
  it("zeigt Status 'offen' bei leerer DB", async () => {
    render(
      <ManuellePruefungProvider antragId="antrag-1">
        <SektionPruefung antragId="antrag-1" paragraph="§ 1" />
      </ManuellePruefungProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Prüfstatus § 1/ })).toBeEnabled();
    });
    expect(screen.getByText("offen")).toBeInTheDocument();
  });

  it("öffnet Dropdown und speichert per upsert", async () => {
    render(
      <ManuellePruefungProvider antragId="antrag-1">
        <SektionPruefung antragId="antrag-1" paragraph="§ 2" />
      </ManuellePruefungProvider>,
    );
    const chip = await waitFor(() =>
      screen.getByRole("button", { name: /Prüfstatus § 2/ }),
    );
    await act(async () => {
      fireEvent.click(chip);
    });
    const okOption = screen.getByRole("option", { name: /^ok$/i });
    await act(async () => {
      fireEvent.click(okOption);
    });
    await waitFor(() => {
      expect(state.upsertCalls).toHaveLength(1);
    });
    expect(state.upsertCalls[0]).toMatchObject({
      antrag_id: "antrag-1",
      paragraph: "§ 2",
      status: "ok",
    });
    // Chip-Label aktualisiert
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Prüfstatus § 2: ok/ }),
      ).toBeInTheDocument();
    });
  });

  it("rendert vorhandene Rows mit korrektem Status", async () => {
    state.rows = [
      {
        paragraph: "§ 3",
        status: "fraglich",
        kommentar: "bitte prüfen",
        geprueft_am: "2026-05-20T10:00:00Z",
        geprueft_von: null,
      },
    ];
    render(
      <ManuellePruefungProvider antragId="antrag-1">
        <SektionPruefung antragId="antrag-1" paragraph="§ 3" />
      </ManuellePruefungProvider>,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Prüfstatus § 3: fraglich/ }),
      ).toBeInTheDocument();
    });
  });
});

describe("useManuellePruefung (Hook)", () => {
  it("lädt Map initial leer und liefert default 'offen'", async () => {
    const { result } = renderHook(() => useManuellePruefung("antrag-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.get("§ 1").status).toBe("offen");
    expect(result.current.error).toBeNull();
  });

  it("save() schreibt per upsert und aktualisiert den State", async () => {
    const { result } = renderHook(() => useManuellePruefung("antrag-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      const res = await result.current.save("§ 4", "fehlt", "Beleg fehlt");
      expect(res.error).toBeNull();
    });
    expect(state.upsertCalls).toHaveLength(1);
    expect(state.upsertCalls[0]).toMatchObject({
      paragraph: "§ 4",
      status: "fehlt",
      kommentar: "Beleg fehlt",
    });
    expect(result.current.get("§ 4").status).toBe("fehlt");
    expect(result.current.get("§ 4").kommentar).toBe("Beleg fehlt");
  });

  it("save() rollbackt bei Fehler", async () => {
    const { result } = renderHook(() => useManuellePruefung("antrag-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    state.upsertError = { message: "RLS verweigert" };
    await act(async () => {
      const res = await result.current.save("§ 5", "ok", null);
      expect(res.error).toBe("RLS verweigert");
    });
    // Rollback: §5 wieder 'offen'
    expect(result.current.get("§ 5").status).toBe("offen");
    expect(result.current.error).toBe("RLS verweigert");
  });
});
