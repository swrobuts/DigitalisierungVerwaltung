import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { postAgentChat, __TEST__ } from "../src/lib/agent-api";

describe("parseDraft (Halluzinations-Schutz)", () => {
  const { parseDraft } = __TEST__;

  it("akzeptiert bekannten FB", () => {
    expect(parseDraft({ foerderbereich: "II" }).foerderbereich).toBe("II");
  });

  it("verwirft erfundenen FB", () => {
    expect(parseDraft({ foerderbereich: "V" }).foerderbereich).toBeUndefined();
    expect(parseDraft({ foerderbereich: "ZZZ" }).foerderbereich).toBeUndefined();
  });

  it("verwirft Variante wenn FB nicht III ist", () => {
    const d = parseDraft({ foerderbereich: "I", fb_iii_variante: "C" });
    expect(d.foerderbereich).toBe("I");
    expect(d.fb_iii_variante).toBeUndefined();
  });

  it("akzeptiert Variante nur bei FB III + valider Variante", () => {
    expect(
      parseDraft({ foerderbereich: "III", fb_iii_variante: "C" }).fb_iii_variante,
    ).toBe("C");
    expect(
      parseDraft({ foerderbereich: "III", fb_iii_variante: "Z" }).fb_iii_variante,
    ).toBeUndefined();
  });

  it("liefert leeres Objekt bei null/undefined", () => {
    expect(parseDraft(null)).toEqual({});
    expect(parseDraft(undefined)).toEqual({});
    expect(parseDraft("string")).toEqual({});
  });

  it("uebernimmt antrag_id und antragsnummer wenn strings", () => {
    const d = parseDraft({
      antrag_id: "uuid-1",
      antragsnummer: "AHP-2026-III-ABC123",
      status: "submitted",
    });
    expect(d.antrag_id).toBe("uuid-1");
    expect(d.antragsnummer).toBe("AHP-2026-III-ABC123");
    expect(d.status).toBe("submitted");
  });
});

describe("postAgentChat", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("postet korrekt formatiertes Body und parsed Response", async () => {
    const fakeResponse = {
      session_id: "sess-1",
      assistant_message: "Verstanden — FB III C.",
      updated_draft: { foerderbereich: "III", fb_iii_variante: "C" },
      next_action: "ask_field",
      tool_trace: [],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeResponse,
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await postAgentChat({
      sessionId: "sess-1",
      history: [],
      userMessage: "Seniorenkreis aufbauen",
      currentDraft: {},
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/agent/chat");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.session_id).toBe("sess-1");
    expect(body.user_message).toBe("Seniorenkreis aufbauen");
    expect(res.assistant_message).toBe("Verstanden — FB III C.");
    expect(res.updated_draft.foerderbereich).toBe("III");
    expect(res.updated_draft.fb_iii_variante).toBe("C");
  });

  it("wirft bei HTTP-Fehler", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Error",
      text: async () => "Backend kaputt",
    }) as unknown as typeof fetch;

    await expect(
      postAgentChat({
        sessionId: "x",
        history: [],
        userMessage: "test",
        currentDraft: {},
      }),
    ).rejects.toThrow(/500/);
  });

  it("filtert halluzinierten FB aus Response heraus", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: "x",
        assistant_message: "Hier ist FB V!",
        updated_draft: { foerderbereich: "V" },
        next_action: "ask_field",
        tool_trace: [],
      }),
    }) as unknown as typeof fetch;

    const res = await postAgentChat({
      sessionId: "x",
      history: [],
      userMessage: "test",
      currentDraft: {},
    });
    // Defense-in-Depth: Client filtert den erfundenen FB raus
    expect(res.updated_draft.foerderbereich).toBeUndefined();
  });
});
