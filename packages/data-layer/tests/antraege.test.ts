import { beforeEach, describe, expect, it, vi } from "vitest";

// Recording-Stubs für den Supabase-Mock. Jeder Test hängt die gewünschten
// Antworten in `nextResult` ein und liest die Aufrufe aus `calls`.
type Call = { table: string; chain: Array<[string, unknown[]]> };
const calls: Call[] = [];
let nextResult: { data: unknown; error: unknown } = { data: null, error: null };
let nextSingleResult: { data: unknown; error: unknown } | null = null;

function makeChain(table: string) {
  const call: Call = { table, chain: [] };
  calls.push(call);

  const proxy: Record<string, (...args: unknown[]) => unknown> = {};
  const methods = ["select", "insert", "update", "delete", "eq", "order"];
  for (const m of methods) {
    proxy[m] = (...args: unknown[]) => {
      call.chain.push([m, args]);
      return proxy;
    };
  }
  // Terminale: .single() resolved auf ein {data, error}-Result.
  proxy.single = (...args: unknown[]) => {
    call.chain.push(["single", args]);
    return Promise.resolve(nextSingleResult ?? nextResult);
  };
  // Awaitable Chain (für list/update/delete/insert ohne .single()).
  // Wir hängen `then` als Property an, damit `await q` funktioniert.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (proxy as any).then = (
    onFulfilled?: ((v: unknown) => unknown) | null,
    onRejected?: ((r: unknown) => unknown) | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise.resolve(nextResult).then(onFulfilled as any, onRejected as any);

  return proxy;
}

vi.mock("../src/supabase-client", () => ({
  getSupabase: () => ({
    from: (table: string) => makeChain(table),
  }),
  resetSupabaseClient: vi.fn(),
}));

import { changeStatus, getAntrag, listAntraege } from "../src/antraege";

beforeEach(() => {
  calls.length = 0;
  nextResult = { data: null, error: null };
  nextSingleResult = null;
});

describe("listAntraege", () => {
  it("ruft antrag_inbox auf, sortiert absteigend, ohne Filter", async () => {
    nextResult = { data: [{ id: "a1" }, { id: "a2" }], error: null };
    const rows = await listAntraege();
    expect(rows).toEqual([{ id: "a1" }, { id: "a2" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe("antrag_inbox");
    const ops = calls[0]?.chain.map((c) => c[0]);
    expect(ops).toEqual(["select", "order"]);
    expect(calls[0]?.chain[1]?.[1]).toEqual(["submitted_at", { ascending: false }]);
  });

  it("hängt .eq('foerderbereich', ...) wenn foerderbereich gesetzt", async () => {
    nextResult = { data: [], error: null };
    await listAntraege({ foerderbereich: "II" });
    const ops = calls[0]?.chain.map((c) => c[0]);
    expect(ops).toEqual(["select", "order", "eq"]);
    expect(calls[0]?.chain[2]?.[1]).toEqual(["foerderbereich", "II"]);
  });

  it("wirft, wenn PostgREST einen Error meldet", async () => {
    nextResult = { data: null, error: { message: "boom", code: "X" } };
    await expect(listAntraege()).rejects.toMatchObject({ message: "boom" });
  });

  it("liefert [] wenn data null ist", async () => {
    nextResult = { data: null, error: null };
    const rows = await listAntraege();
    expect(rows).toEqual([]);
  });
});

describe("getAntrag", () => {
  it("liefert den Antrag bei Treffer", async () => {
    nextSingleResult = { data: { id: "a1", einrichtung: "X" }, error: null };
    const a = await getAntrag("a1");
    expect(a).toEqual({ id: "a1", einrichtung: "X" });
    expect(calls[0]?.table).toBe("antraege");
    const ops = calls[0]?.chain.map((c) => c[0]);
    expect(ops).toEqual(["select", "eq", "single"]);
  });

  it("liefert null bei PGRST116 (no rows)", async () => {
    nextSingleResult = { data: null, error: { code: "PGRST116", message: "no rows" } };
    const a = await getAntrag("missing");
    expect(a).toBeNull();
  });

  it("wirft bei anderen Fehlern", async () => {
    nextSingleResult = { data: null, error: { code: "42P01", message: "no table" } };
    await expect(getAntrag("x")).rejects.toMatchObject({ code: "42P01" });
  });
});

describe("changeStatus", () => {
  it("führt UPDATE antraege + INSERT antrag_history aus", async () => {
    nextResult = { data: null, error: null };
    await changeStatus("a1", "bewilligt", "passt");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.table).toBe("antraege");
    expect(calls[0]?.chain.map((c) => c[0])).toEqual(["update", "eq"]);
    expect(calls[0]?.chain[0]?.[1]).toEqual([{ status: "bewilligt" }]);
    expect(calls[0]?.chain[1]?.[1]).toEqual(["id", "a1"]);

    expect(calls[1]?.table).toBe("antrag_history");
    expect(calls[1]?.chain[0]?.[0]).toBe("insert");
    expect(calls[1]?.chain[0]?.[1]?.[0]).toEqual({
      antrag_id: "a1",
      nach_status: "bewilligt",
      kommentar: "passt",
      geaendert_von: "ui",
    });
  });

  it("setzt kommentar auf null wenn nicht übergeben", async () => {
    await changeStatus("a1", "in_pruefung");
    expect(calls[1]?.chain[0]?.[1]?.[0]).toMatchObject({ kommentar: null });
  });

  it("wirft wenn UPDATE fehlschlägt — KEIN history-Insert", async () => {
    nextResult = { data: null, error: { message: "update boom" } };
    await expect(changeStatus("a1", "bewilligt")).rejects.toMatchObject({
      message: "update boom",
    });
    // Bei diesem Pfad wird nach dem ersten Fehler nichts mehr ausgeführt.
    expect(calls).toHaveLength(1);
  });
});
