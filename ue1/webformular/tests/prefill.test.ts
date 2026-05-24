import { describe, expect, it } from "vitest";
import { mapExtractedToFormState } from "../src/prefill";

describe("mapExtractedToFormState", () => {
  it("übernimmt einfache String-Felder", () => {
    const out = mapExtractedToFormState({
      name: "Seniorentreff Heidingsfeld",
      traeger: "Caritas",
      iban: "DE89370400440532013000",
    });
    expect(out.name).toBe("Seniorentreff Heidingsfeld");
    expect(out.traeger).toBe("Caritas");
    expect(out.iban).toBe("DE89370400440532013000");
  });

  it("ignoriert leere Strings und null/undefined-Werte", () => {
    const out = mapExtractedToFormState({
      name: "Foo",
      traeger: "",
      strasse: null as unknown as string,
      hausnummer: undefined as unknown as string,
    });
    expect(out.name).toBe("Foo");
    expect(out.traeger).toBeUndefined();
    expect(out.strasse).toBeUndefined();
    expect(out.hausnummer).toBeUndefined();
  });

  it("übernimmt numerische Felder, ignoriert NaN/null", () => {
    const out = mapExtractedToFormState({
      haushaltsjahr: 2026,
      betriebskosten_vorjahr_euro: 12500.5,
      personalkosten_vorjahr_euro: null,
      monatliche_miete_euro: Number.NaN,
    });
    expect(out.haushaltsjahr).toBe(2026);
    expect(out.betriebskosten_vorjahr_euro).toBe(12500.5);
    expect(out.personalkosten_vorjahr_euro).toBeUndefined();
    expect(out.monatliche_miete_euro).toBeUndefined();
  });

  it("akzeptiert nur ja|nein für raeume-Felder", () => {
    expect(mapExtractedToFormState({ raeume_vorhanden: "ja" }).raeume_vorhanden).toBe("ja");
    expect(mapExtractedToFormState({ raeume_unentgeltlich: "nein" }).raeume_unentgeltlich).toBe(
      "nein",
    );
    expect(mapExtractedToFormState({ raeume_vorhanden: "vielleicht" }).raeume_vorhanden).toBeUndefined();
    expect(mapExtractedToFormState({ raeume_vorhanden: "" }).raeume_vorhanden).toBeUndefined();
  });

  it("liefert 7 Wochentag-Slots in Mo–So-Reihenfolge bei OCR-Wochenplan", () => {
    const out = mapExtractedToFormState({
      oeffnungszeiten: [
        { wochentag: "mi", oeffnungszeit: "14–17", angebot: "Spielenachmittag" },
        { wochentag: "fr", oeffnungszeit: "10–12", angebot: "Frühstück" },
      ],
    });
    const oz = out.oeffnungszeiten!;
    expect(oz).toHaveLength(7);
    expect(oz.map((o) => o.wochentag)).toEqual(["mo", "di", "mi", "do", "fr", "sa", "so"]);
    expect(oz[2]).toMatchObject({ oeffnungszeit: "14–17", angebot: "Spielenachmittag" });
    expect(oz[4]).toMatchObject({ oeffnungszeit: "10–12", angebot: "Frühstück" });
    expect(oz[0]).toMatchObject({ oeffnungszeit: "", angebot: "" });
  });

  it("ignoriert unbekannte Wochentag-Kürzel", () => {
    const out = mapExtractedToFormState({
      oeffnungszeiten: [{ wochentag: "xx", oeffnungszeit: "9", angebot: "x" }],
    });
    expect(out.oeffnungszeiten!.every((o) => o.oeffnungszeit === "" && o.angebot === "")).toBe(true);
  });

  it("trimmt String-Werte", () => {
    const out = mapExtractedToFormState({ name: "  Foo  " });
    expect(out.name).toBe("Foo");
  });

  it("übernimmt antragsdatum als String", () => {
    const out = mapExtractedToFormState({ antragsdatum: "2026-03-15" });
    expect(out.antragsdatum).toBe("2026-03-15");
  });
});
