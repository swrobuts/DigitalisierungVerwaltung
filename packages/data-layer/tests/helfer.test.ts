import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockClient, mockState, resetMock } from "./_mock";

vi.mock("../src/supabase-client", () => ({
  getSupabase: () => mockClient(),
  resetSupabaseClient: vi.fn(),
}));

import { listHelfer, upsertHelfer } from "../src/helfer";

beforeEach(resetMock);

describe("listHelfer", () => {
  it("liest fb_ii_helfer für einen Antrag, sortiert nach position asc", async () => {
    mockState.nextResult = {
      data: [
        { id: "h1", antrag_id: "a1", position: 1, name: "X", vorname: "Y" },
      ],
      error: null,
    };
    const rows = await listHelfer("a1");
    expect(rows).toHaveLength(1);
    const call = mockState.calls[0];
    expect(call?.table).toBe("fb_ii_helfer");
    expect(call?.chain.map((c) => c[0])).toEqual(["select", "eq", "order"]);
    expect(call?.chain[1]?.[1]).toEqual(["antrag_id", "a1"]);
    expect(call?.chain[2]?.[1]).toEqual(["position", { ascending: true }]);
  });

  it("wirft bei Postgres-Fehler", async () => {
    mockState.nextResult = { data: null, error: { message: "boom" } };
    await expect(listHelfer("a1")).rejects.toMatchObject({ message: "boom" });
  });
});

describe("upsertHelfer", () => {
  it("löscht zunächst alte Helfer, dann INSERT mit fortlaufenden Positionen wenn position fehlt", async () => {
    // Caller übergibt position als undefined → Wrapper füllt mit i+1
    await upsertHelfer("a1", [
      { name: "A", vorname: "Anne", einsatzbereich: null,
        eintritt: null, austritt: null, stunden_monat: null, stunden_jahr: null,
      } as unknown as Omit<import("../src/db-types").FbIiHelfer, "id" | "antrag_id">,
      { name: "B", vorname: "Bert", einsatzbereich: null,
        eintritt: null, austritt: null, stunden_monat: null, stunden_jahr: null,
      } as unknown as Omit<import("../src/db-types").FbIiHelfer, "id" | "antrag_id">,
    ]);
    expect(mockState.calls).toHaveLength(2);

    const del = mockState.calls[0];
    expect(del?.table).toBe("fb_ii_helfer");
    expect(del?.chain.map((c) => c[0])).toEqual(["delete", "eq"]);
    expect(del?.chain[1]?.[1]).toEqual(["antrag_id", "a1"]);

    const ins = mockState.calls[1];
    expect(ins?.table).toBe("fb_ii_helfer");
    expect(ins?.chain[0]?.[0]).toBe("insert");
    const rows = ins?.chain[0]?.[1]?.[0] as Array<{ position: number; antrag_id: string }>;
    expect(rows).toHaveLength(2);
    // position fehlt → fallback i+1 (1, 2)
    expect(rows[0]?.position).toBe(1);
    expect(rows[1]?.position).toBe(2);
    expect(rows[0]?.antrag_id).toBe("a1");
  });

  it("respektiert explizit gesetzte position-Werte des Callers", async () => {
    await upsertHelfer("a1", [
      { position: 5, name: "A", vorname: "Anne", einsatzbereich: null,
        eintritt: null, austritt: null, stunden_monat: null, stunden_jahr: null },
      { position: 7, name: "B", vorname: "Bert", einsatzbereich: null,
        eintritt: null, austritt: null, stunden_monat: null, stunden_jahr: null },
    ]);
    const ins = mockState.calls[1];
    const rows = ins?.chain[0]?.[1]?.[0] as Array<{ position: number }>;
    expect(rows[0]?.position).toBe(5);
    expect(rows[1]?.position).toBe(7);
  });

  it("überspringt INSERT wenn Liste leer ist (nur DELETE)", async () => {
    await upsertHelfer("a1", []);
    expect(mockState.calls).toHaveLength(1);
    expect(mockState.calls[0]?.chain[0]?.[0]).toBe("delete");
  });

  it("wirft wenn DELETE fehlschlägt — kein INSERT", async () => {
    mockState.nextResult = { data: null, error: { message: "del boom" } };
    await expect(
      upsertHelfer("a1", [
        { position: 1, name: "A", vorname: "Anne", einsatzbereich: null,
          eintritt: null, austritt: null, stunden_monat: null, stunden_jahr: null },
      ]),
    ).rejects.toMatchObject({ message: "del boom" });
    expect(mockState.calls).toHaveLength(1);
  });
});
