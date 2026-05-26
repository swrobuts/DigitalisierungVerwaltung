// Verifiziert, dass buildPayload() pro FB die richtigen Sub-Felder
// in den Submit-Body schreibt (E2E-Submit-Test ohne Netzwerk).

import { describe, it, expect } from "vitest";
import { buildPayload } from "../src/lib/submit";
import { initialAntragState, type AntragState } from "../src/state/AntragContext";

function basisState(): AntragState {
  return {
    ...initialAntragState,
    einrichtung: "Verein X",
    ansprechpartner: "Max Mustermann",
    strasse: "Hauptstr.", hausnummer: "1", plz: "97070", ort: "Würzburg",
    telefon: "0931 123", email: "test@verein.de",
    bankname: "Sparkasse Mainfranken", iban: "DE89370400440532013000", bic: "BYLADEM1SWU",
  };
}

describe("buildPayload pro FB", () => {
  it("FB I — fb_i_projekt mit gestripten Drittmittel-Numbers", () => {
    const s: AntragState = {
      ...basisState(),
      foerderbereich: "I",
      fb_i: { projekt_titel: "Neues Café", laufzeit: "12M", stadtteil: "Heuchelhof",
              personalkosten_euro: "5000", sachkosten_euro: "1200",
              drittmittel: [{ geber: "Bund", betrag_euro: "2000" }] },
    };
    const p = buildPayload(s) as any;
    expect(p.foerderbereich).toBe("I");
    expect(p.fb_i_projekt.projekt_titel).toBe("Neues Café");
    expect(p.fb_i_projekt.personalkosten_euro).toBe(5000);
    expect(p.fb_i_projekt.drittmittel_jsonb[0]).toEqual({ geber: "Bund", betrag_euro: 2000 });
    expect(p.fb_ii_ehrenamt).toBeUndefined();
    expect(p.iban).toBe("DE89370400440532013000");
  });

  it("FB II — fb_ii_ehrenamt + fb_ii_helfer mit Positionen", () => {
    const s: AntragState = {
      ...basisState(),
      foerderbereich: "II",
      fb_ii: { ehrenamt_titel: "Besuchsdienst", anzahl_helfer_vorjahr: "12",
               gesamt_helferstunden_vorjahr: "2400", direkter_kontakt_senioren: true,
               helfer: [
                 { name: "Schmidt", vorname: "Anna", einsatzbereich: "Besuche",
                   eintritt: "2024-01-15", austritt: "",
                   stunden_monat: "10", stunden_jahr: "120" },
                 { name: "Müller", vorname: "Bert", einsatzbereich: "Orga",
                   eintritt: "", austritt: "",
                   stunden_monat: "", stunden_jahr: "60" },
               ] },
    };
    const p = buildPayload(s) as any;
    expect(p.fb_ii_ehrenamt.ehrenamt_titel).toBe("Besuchsdienst");
    expect(p.fb_ii_ehrenamt.direkter_kontakt_senioren).toBe(true);
    expect(p.fb_ii_helfer).toHaveLength(2);
    expect(p.fb_ii_helfer[0]).toMatchObject({ position: 1, name: "Schmidt", stunden_jahr: 120 });
    expect(p.fb_ii_helfer[1]).toMatchObject({ position: 2, eintritt: null });
  });

  it("FB III Variante C — nur variant-spezifische Felder", () => {
    const s: AntragState = {
      ...basisState(),
      foerderbereich: "III",
      fb_iii: { ...initialAntragState.fb_iii, variante: "C",
                c_treffen_schwelle: "GT_20", c_teilnehmer_durchschnitt: "15" },
    };
    const p = buildPayload(s) as any;
    expect(p.fb_iii_variante.variante).toBe("C");
    expect(p.fb_iii_variante.c_treffen_schwelle).toBe("GT_20");
    expect(p.fb_iii_variante.c_teilnehmer_durchschnitt).toBe(15);
    expect(p.fb_iii_variante.b_anzahl_veranstaltungen).toBeUndefined();
  });

  it("FB IV — fb_iv_freitext mit Numerik-Konvertierung", () => {
    const s: AntragState = {
      ...basisState(),
      foerderbereich: "IV",
      fb_iv: { vorhaben_titel: "Pilot-Projekt", kurzbeschreibung: "kurz",
               geplante_massnahmen: "Maßnahmen", beantragte_summe_euro: "12500",
               laufzeit: "18 Monate" },
    };
    const p = buildPayload(s) as any;
    expect(p.fb_iv_freitext.vorhaben_titel).toBe("Pilot-Projekt");
    expect(p.fb_iv_freitext.beantragte_summe_euro).toBe(12500);
  });

  it("Anlagen-Liste enthält upload_key fürs Multipart-Mapping", () => {
    const s: AntragState = {
      ...basisState(),
      foerderbereich: "I",
      fb_i: { ...initialAntragState.fb_i, projekt_titel: "x",
              personalkosten_euro: "0", sachkosten_euro: "0" },
      anlagen: [{ anlagentyp: "projektskizze", dateiname: "skizze.pdf",
                  groesse_bytes: 1234 }],
    };
    const p = buildPayload(s) as any;
    expect(p.anlagen).toHaveLength(1);
    expect(p.anlagen[0]).toMatchObject({
      anlagentyp: "projektskizze", dateiname: "skizze.pdf", upload_key: "file_0",
    });
  });

  it("Wirft, wenn kein Förderbereich gesetzt", () => {
    expect(() => buildPayload({ ...basisState(), foerderbereich: null })).toThrow();
  });
});
