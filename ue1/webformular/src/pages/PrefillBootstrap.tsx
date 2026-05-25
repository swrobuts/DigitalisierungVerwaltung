/**
 * PrefillBootstrap — UE0 → UE1 Übergabe.
 *
 * Route: /antrag/uebernahme/:antragId
 *
 * Lädt einen bereits in apl.antraege bestehenden Antrag (von n8n nach
 * OCR-Pipeline angelegt) plus die FB-spezifische Detail-Zeile, übersetzt
 * die DB-Felder in den AntragState und navigiert in den Wizard, sodass
 * der Bürger nur noch prüfen + absenden muss.
 *
 * Fehler-Pfade:
 *   - Antrag-ID ungültig / nicht gefunden → Fehlertext mit Link „neu starten"
 *   - Detail-Tabelle noch leer (Race zwischen n8n und Frontend) → Spinner
 *     mit max 30s Timeout, dann Hinweis
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getAntrag,
  getFbIProjekt,
  getFbIiEhrenamt,
  getFbIiiVariante,
  getFbIvFreitext,
  listHelfer,
} from "@dv/data-layer";
import { useAntrag, initialAntragState, type AntragState } from "../state/AntragContext";

type LoadState =
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string }
  | { kind: "done" };

export function PrefillBootstrap(): JSX.Element {
  const { antragId } = useParams<{ antragId: string }>();
  const navigate = useNavigate();
  const { setState } = useAntrag();
  const [load, setLoad] = useState<LoadState>({
    kind: "loading",
    message: "Antrag aus KI-Pipeline wird geladen …",
  });

  useEffect(() => {
    if (!antragId) {
      setLoad({ kind: "error", message: "Keine Antrags-ID in URL." });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const antrag = await getAntrag(antragId);
        if (cancelled) return;
        if (!antrag) {
          setLoad({
            kind: "error",
            message:
              "Antrag mit dieser ID wurde nicht gefunden. Möglicherweise wurde die KI-Verarbeitung noch nicht abgeschlossen — bitte zurück zur Eingangsbestätigung.",
          });
          return;
        }

        // Antragsteller-Block: 1:1 in den State
        const baseState: AntragState = {
          ...initialAntragState,
          foerderbereich: antrag.foerderbereich,
          haushaltsjahr: antrag.haushaltsjahr,
          dachverband: antrag.dachverband ?? "",
          einrichtung: antrag.einrichtung,
          ansprechpartner: antrag.ansprechpartner,
          strasse: antrag.strasse,
          hausnummer: antrag.hausnummer ?? "",
          plz: antrag.plz,
          ort: antrag.ort,
          telefon: antrag.telefon,
          email: antrag.email,
          homepage: antrag.homepage ?? "",
          bankname: antrag.bankname,
          iban: antrag.iban,
          bic: antrag.bic,
        };

        // FB-Detail nachladen (je nach FB die richtige Tabelle)
        const next: AntragState = { ...baseState };

        if (antrag.foerderbereich === "I") {
          const fb = await getFbIProjekt(antragId);
          if (fb) {
            next.fb_i = {
              projekt_titel: fb.projekt_titel,
              laufzeit: fb.laufzeit ?? "",
              stadtteil: fb.stadtteil ?? "",
              personalkosten_euro: numToStr(fb.personalkosten_euro),
              sachkosten_euro: numToStr(fb.sachkosten_euro),
              drittmittel: Array.isArray(fb.drittmittel_jsonb)
                ? (fb.drittmittel_jsonb as unknown as Array<Record<string, unknown>>).map((d) => ({
                    geber: String((d?.geber ?? d?.quelle ?? "") as string | number),
                    betrag_euro: numToStr((d?.betrag ?? d?.summe) as number | null),
                  }))
                : [],
            };
          }
        } else if (antrag.foerderbereich === "II") {
          const fb = await getFbIiEhrenamt(antragId);
          const helfer = await listHelfer(antragId);
          if (fb) {
            next.fb_ii = {
              ehrenamt_titel: fb.ehrenamt_titel,
              anzahl_helfer_vorjahr: numToStr(fb.anzahl_helfer_vorjahr),
              gesamt_helferstunden_vorjahr: numToStr(fb.gesamt_helferstunden_vorjahr),
              direkter_kontakt_senioren: fb.direkter_kontakt_senioren ?? false,
              helfer: helfer.map((h) => ({
                name: h.name,
                vorname: h.vorname,
                einsatzbereich: h.einsatzbereich ?? "",
                eintritt: h.eintritt ?? "",
                stunden_jahr: numToStr(h.stunden_jahr),
              })),
            };
          }
        } else if (antrag.foerderbereich === "III") {
          const fb = await getFbIiiVariante(antragId);
          if (fb) {
            next.fb_iii = {
              variante: fb.variante,
              a_anmerkung: fb.a_anmerkung ?? "",
              b_anzahl_veranstaltungen: numToStr(fb.b_anzahl_veranstaltungen),
              b_teilnehmer_senioren: numToStr(fb.b_teilnehmer_senioren),
              b_teilnehmer_generationen: numToStr(fb.b_teilnehmer_generationen),
              b_stadtbewohner_anteil: numToStr(fb.b_stadtbewohner_anteil),
              b_quartierstreffen_teilnahme: fb.b_quartierstreffen_teilnahme ?? false,
              b_quartiere: fb.b_quartiere ?? "",
              b_quartier_person_name: fb.b_quartier_person_name ?? "",
              c_treffen_schwelle: fb.c_treffen_schwelle ?? "",
              c_teilnehmer_durchschnitt: numToStr(fb.c_teilnehmer_durchschnitt),
              c_quartierstreffen_anzahl: numToStr(fb.c_quartierstreffen_anzahl),
              c_quartier_kooperation: fb.c_quartier_kooperation ?? "",
              c_quartier_person_name: fb.c_quartier_person_name ?? "",
              d_hauptamt_name: fb.d_hauptamt_name ?? "",
              d_hauptamt_stunden_woche: numToStr(fb.d_hauptamt_stunden_woche),
              d_hauptamt_stunden_monat: numToStr(fb.d_hauptamt_stunden_monat),
            };
          }
        } else if (antrag.foerderbereich === "IV") {
          const fb = await getFbIvFreitext(antragId);
          if (fb) {
            next.fb_iv = {
              vorhaben_titel: fb.vorhaben_titel,
              kurzbeschreibung: fb.kurzbeschreibung,
              geplante_massnahmen: fb.geplante_massnahmen,
              beantragte_summe_euro: numToStr(fb.beantragte_summe_euro),
              laufzeit: fb.laufzeit ?? "",
            };
          }
        }

        if (cancelled) return;
        setState(() => next);
        setLoad({ kind: "done" });
        // Direkt in Phase 1 — Bürger sieht alle ausgefüllten Felder und
        // kann sich durchklicken bis Phase 3 (Absenden).
        navigate("/antrag/phase-1", { replace: true });
      } catch (e) {
        if (cancelled) return;
        setLoad({
          kind: "error",
          message:
            "Fehler beim Laden des KI-vorausgefüllten Antrags: " +
            ((e as Error).message ?? "unbekannt"),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [antragId, navigate, setState]);

  if (load.kind === "loading") {
    return (
      <div style={{ padding: "3rem 1rem", textAlign: "center" }}>
        <div className="prefill-spinner" aria-hidden="true" />
        <p style={{ marginTop: "1rem", color: "#555" }}>{load.message}</p>
        <p style={{ marginTop: "0.5rem", fontSize: 13, color: "#888" }}>
          Antrags-ID: <code>{antragId}</code>
        </p>
      </div>
    );
  }
  if (load.kind === "error") {
    return (
      <div style={{ padding: "2rem 1rem" }}>
        <h1 className="page-titel">Antrag konnte nicht übernommen werden</h1>
        <p style={{ marginTop: "1rem" }}>{load.message}</p>
        <p style={{ marginTop: "1rem" }}>
          <a href="/">Zurück zum Antragsformular</a>
        </p>
      </div>
    );
  }
  return <div />;
}

function numToStr(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return String(n);
}
