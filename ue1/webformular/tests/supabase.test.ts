import { describe, expect, it, beforeEach, vi } from "vitest";

// ENV-Vars für Test setzen, BEVOR supabase.ts importiert wird
vi.stubEnv("VITE_SUPABASE_URL", "https://verwaltung.test");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");

import { toSnakeCase, submitAntrag } from "../src/supabase";
import type { APL2Antrag } from "../src/types";
import { setSprache } from "../src/i18n";

const beispielAntrag: APL2Antrag = {
  haushaltsjahr: 2026,
  name: "Test-Einrichtung",
  anschrift: "Musterstraße 1, 97070 Würzburg",
  traeger: "Diakonie e.V.",
  bankverbindung: "Sparkasse Mainfranken",
  iban: "DE89 3704 0044 0532 0130 00",
  bic: "",
  ansprechpartner: "Erika Mustermann",
  telefon: "0931 1234567",
  email: "kontakt@test.de",
  betriebskostenVorjahrEuro: 10000,
  personalkostenVorjahrEuro: 50000,
  raeumeVorhanden: "ja",
  raeumeUnentgeltlich: "nein",
  monatlicheMieteEuro: 0,
  antragsdatum: "2026-05-18",
  anlagen: [],
};

describe("toSnakeCase", () => {
  beforeEach(() => setSprache("de"));

  it("mappt camelCase auf snake_case", () => {
    const s = toSnakeCase(beispielAntrag);
    expect(s.haushaltsjahr).toBe(2026);
    expect(s.betriebskosten_vorjahr_euro).toBe(10000);
    expect(s.personalkosten_vorjahr_euro).toBe(50000);
    expect(s.raeume_vorhanden).toBe("ja");
    expect(s.monatliche_miete_euro).toBe(0);
    expect(s.submitted_language).toBe("de");
  });

  it("schickt leeren BIC als null", () => {
    expect(toSnakeCase(beispielAntrag).bic).toBeNull();
  });

  it("inkludiert die aktuelle Sprache", () => {
    setSprache("tr");
    expect(toSnakeCase(beispielAntrag).submitted_language).toBe("tr");
    setSprache("de");
  });
});

describe("submitAntrag", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("schickt FormData mit 'antrag' JSON + file__<typ>-Entries", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ antragsnummer: "APL2-2026-DIA-XXXXXX", id: "uuid-xxx" }),
    });
    const file = new File(["pdf-content"], "test.pdf", { type: "application/pdf" });
    const ergebnis = await submitAntrag(beispielAntrag, [{
      typ: "programm-altentagesstaette",
      dateiname: "test.pdf",
      groesseBytes: 11,
      mimeType: "application/pdf",
      file,
    }]);
    expect(ergebnis).toEqual({ antragsnummer: "APL2-2026-DIA-XXXXXX", id: "uuid-xxx" });
    const call = (global.fetch as any).mock.calls[0];
    expect(call[0]).toContain("/functions/v1/submit-antrag");
    expect(call[1].method).toBe("POST");
    expect(call[1].headers.apikey).toBe("test-anon-key");
    const body: FormData = call[1].body;
    expect(body.get("antrag")).toBeTruthy();
    expect(body.get("file__programm-altentagesstaette")).toBeInstanceOf(File);
  });

  it("liefert error wenn Server 500 returnt", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false, status: 500,
      json: async () => ({ error: "db down" }),
    });
    const ergebnis = await submitAntrag(beispielAntrag, []);
    expect(ergebnis).toEqual({ error: "db down" });
  });

  it("liefert Netzwerkfehler wenn fetch wirft", async () => {
    (global.fetch as any).mockRejectedValue(new Error("network unreachable"));
    const ergebnis = await submitAntrag(beispielAntrag, []);
    expect(ergebnis).toEqual({ error: "Netzwerkfehler: network unreachable" });
  });
});
