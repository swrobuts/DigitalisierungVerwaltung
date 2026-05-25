/**
 * Edge-Function-Vertrag — was an Backend gesendet wird.
 * Wir mocken `fetch` und prüfen FormData-Felder + Endpoint.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { einreichen, klassifizierePdf } from "../lib/api";

const origFetch = globalThis.fetch;

function mockFetchOk(json: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(json), {
    status: 200, headers: { "content-type": "application/json" },
  }));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  // ANON_KEY ist via import.meta.env in der Quelle gelesen; im Test über
  // Vite-Define / vitest config injizierbar — wir setzen direkt:
  (globalThis as unknown as { __vite_define__?: unknown }).__vite_define__ = undefined;
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon");
});

afterEach(() => {
  globalThis.fetch = origFetch;
  vi.unstubAllEnvs();
});

describe("einreichen", () => {
  it("sendet datei + foerderbereich + variante an Edge Function", async () => {
    const fn = mockFetchOk({ einreichung_id: "uuid-xyz", tracking_id: "uuid-xyz" });
    const file = new File([new Uint8Array(10)], "antrag.pdf", { type: "application/pdf" });
    const res = await einreichen({
      datei: file,
      foerderbereich: "III",
      variante: "B",
    });
    expect(res.einreichung_id).toBe("uuid-xyz");
    expect(fn).toHaveBeenCalledOnce();
    const call = fn.mock.calls[0]!;
    const [url, init] = call as [string, RequestInit];
    expect(url).toMatch(/\/functions\/v1\/upload-antragspdf$/);
    const fd = init.body as FormData;
    expect(fd.get("foerderbereich")).toBe("III");
    expect(fd.get("variante")).toBe("B");
    expect(fd.get("datei")).toBeInstanceOf(File);
  });

  it("sendet erkannter_fb (Smart-Upload-Modus) wenn gesetzt", async () => {
    const fn = mockFetchOk({ einreichung_id: "u1", tracking_id: "u1" });
    const file = new File([new Uint8Array(5)], "x.pdf", { type: "application/pdf" });
    await einreichen({ datei: file, erkannter_fb: "II" });
    const fd = (fn.mock.calls[0]![1] as RequestInit).body as FormData;
    expect(fd.get("erkannter_fb")).toBe("II");
    expect(fd.get("foerderbereich")).toBeNull();
  });

  it("sendet anlage NUR wenn anlage_typ gesetzt", async () => {
    const fn = mockFetchOk({ einreichung_id: "u2", tracking_id: "u2" });
    const main = new File([new Uint8Array(1)], "h.pdf", { type: "application/pdf" });
    const anlage = new File([new Uint8Array(1)], "a.pdf", { type: "application/pdf" });
    await einreichen({
      datei: main, foerderbereich: "I", anlage, anlage_typ: "projektskizze",
    });
    const fd = (fn.mock.calls[0]![1] as RequestInit).body as FormData;
    expect(fd.get("anlage")).toBeInstanceOf(File);
    expect(fd.get("anlage_typ")).toBe("projektskizze");
  });
});

describe("klassifizierePdf", () => {
  it("postet file an Klassifikations-Endpoint und returnt Ergebnis", async () => {
    const fn = mockFetchOk({ fb: "II", variante: null, konfidenz: 0.87, begruendung: "Helferliste erkannt" });
    const file = new File([new Uint8Array(1)], "x.pdf", { type: "application/pdf" });
    const res = await klassifizierePdf(file);
    expect(res.fb).toBe("II");
    expect(res.konfidenz).toBeCloseTo(0.87);
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toMatch(/klassifiziere-pdf$/);
    const fd = (init as RequestInit).body as FormData;
    expect(fd.get("file")).toBeInstanceOf(File);
  });
});
