import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockClient, mockState, resetMock } from "./_mock";

vi.mock("../src/supabase-client", () => ({
  getSupabase: () => mockClient(),
  resetSupabaseClient: vi.fn(),
}));

import { listAnlagen, uploadAnlage } from "../src/anlagen";

beforeEach(resetMock);

describe("uploadAnlage", () => {
  it("uploaded in bucket antragsbelege und schreibt anlagen-Row", async () => {
    mockState.nextSingleResult = {
      data: {
        id: "an1",
        antrag_id: "a1",
        anlagentyp: "projektskizze",
        dateiname: "p.pdf",
        storage_path: "a1/projektskizze/123-p.pdf",
        groesse_bytes: 4,
        hochgeladen_am: "2026-05-25T00:00:00Z",
      },
      error: null,
    };

    const blob = new Blob(["data"], { type: "application/pdf" });
    const result = await uploadAnlage("a1", blob, "projektskizze", "p.pdf");

    // Storage-Aufruf
    expect(mockState.storage.calls).toHaveLength(1);
    const sc = mockState.storage.calls[0]!;
    expect(sc.bucket).toBe("antragsbelege");
    expect(sc.op).toBe("upload");
    const [path, payload] = sc.args as [string, unknown];
    expect(path).toMatch(/^a1\/projektskizze\/\d+-p\.pdf$/);
    expect(payload).toBe(blob);

    // INSERT in anlagen
    expect(mockState.calls).toHaveLength(1);
    expect(mockState.calls[0]?.table).toBe("anlagen");
    const ops = mockState.calls[0]?.chain.map((c) => c[0]);
    expect(ops).toEqual(["insert", "select", "single"]);
    const row = mockState.calls[0]?.chain[0]?.[1]?.[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      antrag_id: "a1",
      anlagentyp: "projektskizze",
      dateiname: "p.pdf",
      groesse_bytes: 4,
    });
    expect(row.storage_path).toBe(path);

    expect(result.id).toBe("an1");
  });

  it("wirft wenn Storage-Upload fehlschlägt — kein INSERT", async () => {
    mockState.storage.nextUploadResult = { data: null, error: { message: "up boom" } };
    await expect(
      uploadAnlage("a1", new Blob(["x"]), "sonstige", "x.pdf"),
    ).rejects.toMatchObject({ message: "up boom" });
    expect(mockState.calls).toHaveLength(0);
  });
});

describe("listAnlagen", () => {
  it("liest anlagen für einen Antrag, sortiert nach hochgeladen_am asc", async () => {
    mockState.nextResult = {
      data: [{ id: "an1" }, { id: "an2" }],
      error: null,
    };
    const rows = await listAnlagen("a1");
    expect(rows).toHaveLength(2);
    const call = mockState.calls[0];
    expect(call?.table).toBe("anlagen");
    expect(call?.chain.map((c) => c[0])).toEqual(["select", "eq", "order"]);
    expect(call?.chain[2]?.[1]).toEqual(["hochgeladen_am", { ascending: true }]);
  });

  it("liefert [] bei null data", async () => {
    mockState.nextResult = { data: null, error: null };
    expect(await listAnlagen("a1")).toEqual([]);
  });
});
