/**
 * UE4 → UE1 Hand-off-Bootstrap.
 *
 * Route: /antrag/uebernahme-chat   (Payload als URL-Hash `#<base64>`)
 *
 * Der UE4-Agent serialisiert den gesammelten Antrag als Base64-JSON in den
 * URL-Hash und redirected hierher. Wir dekodieren den Hash, befüllen den
 * AntragContext mit den Daten (Antragsteller + FB-Detail) und navigieren in
 * Phase 1, damit der Bürger jedes Feld noch einmal in der strukturierten
 * Formular-UI prüfen kann.
 *
 * Unterschied zu PrefillBootstrap (UE0→UE1):
 *   - UE0 schreibt vor dem Hand-off in apl.antraege (DB-Pfad, Antrag-ID)
 *   - UE4 schreibt NICHTS in die DB — der Bürger sendet selbst final ab
 *
 * Damit ist der Agent reine UI-Schicht und kann nichts halluzinieren, was am
 * Ende nicht vom Bürger bestätigt wurde.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useAntrag,
  initialAntragState,
  type AntragState,
} from "../state/AntragContext";

type LoadState =
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string }
  | { kind: "done" };

/** Base64URL → JSON. Wirft, wenn Hash leer oder kaputt ist. */
function decodeHashPayload(hash: string): unknown {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) throw new Error("Kein Hand-off-Payload im URL-Hash.");
  // urlsafe_b64 (Python) ohne Padding → Padding wiederherstellen
  const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
  // urlsafe → klassisches Base64
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new Error("Hand-off-Payload ist kein gültiges Base64.");
  }
  // bin ist ein Byte-String; UTF-8 dekodieren
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const json = new TextDecoder("utf-8").decode(bytes);
  return JSON.parse(json);
}

interface AgentPayload {
  foerderbereich?: "I" | "II" | "III" | "IV" | null;
  fb_iii_variante?: "A" | "B" | "C" | "D" | null;
  antragsteller?: Record<string, string>;
  fb_specific?: Record<string, string | number | boolean | null | undefined>;
}

/** Sanitizer: macht aus unbekanntem Payload einen typsicheren AntragState. */
function payloadToState(p: unknown): AntragState {
  const next: AntragState = { ...initialAntragState };
  if (!p || typeof p !== "object") return next;
  const payload = p as AgentPayload;

  // FB übernehmen
  const fb = payload.foerderbereich;
  if (fb === "I" || fb === "II" || fb === "III" || fb === "IV") {
    next.foerderbereich = fb;
  }

  // Antragsteller-Block — string-only, nur erlaubte Felder
  const a = payload.antragsteller ?? {};
  const strFields = [
    "dachverband", "einrichtung", "ansprechpartner", "strasse", "hausnummer",
    "plz", "ort", "telefon", "email", "homepage", "bankname", "iban", "bic",
  ] as const;
  for (const f of strFields) {
    const v = a[f];
    if (typeof v === "string") (next as unknown as Record<string, unknown>)[f] = v;
  }
  if (typeof a.haushaltsjahr === "string") {
    const n = parseInt(a.haushaltsjahr, 10);
    if (Number.isFinite(n)) next.haushaltsjahr = n;
  }

  // FB-spezifische Detail-Felder
  const fbs = payload.fb_specific ?? {};
  const str = (k: string): string => {
    const v = fbs[k];
    if (v === null || v === undefined) return "";
    return String(v);
  };
  const bool = (k: string): boolean => fbs[k] === true || fbs[k] === "true";

  if (fb === "I") {
    next.fb_i = {
      projekt_titel: str("projekt_titel"),
      laufzeit: str("laufzeit"),
      stadtteil: str("stadtteil"),
      personalkosten_euro: str("personalkosten_euro"),
      sachkosten_euro: str("sachkosten_euro"),
      drittmittel: [],
    };
  } else if (fb === "II") {
    next.fb_ii = {
      ehrenamt_titel: str("ehrenamt_titel"),
      anzahl_helfer_vorjahr: str("anzahl_helfer_vorjahr"),
      gesamt_helferstunden_vorjahr: str("gesamt_helferstunden_vorjahr"),
      direkter_kontakt_senioren: bool("direkter_kontakt_senioren"),
      helfer: [],
    };
  } else if (fb === "III") {
    const variante = payload.fb_iii_variante;
    next.fb_iii = {
      ...initialAntragState.fb_iii,
      variante: variante === "A" || variante === "B" || variante === "C" || variante === "D"
        ? variante
        : null,
      a_anmerkung: str("a_anmerkung"),
      b_anzahl_veranstaltungen: str("b_anzahl_veranstaltungen"),
      b_teilnehmer_senioren: str("b_teilnehmer_senioren"),
      b_teilnehmer_generationen: str("b_teilnehmer_generationen"),
      b_stadtbewohner_anteil: str("b_stadtbewohner_anteil"),
      b_quartierstreffen_teilnahme: bool("b_quartierstreffen_teilnahme"),
      b_quartiere: str("b_quartiere"),
      b_quartier_person_name: str("b_quartier_person_name"),
      c_treffen_schwelle: (["GT_10", "GT_20", "GT_40"].includes(str("c_treffen_schwelle"))
        ? (str("c_treffen_schwelle") as "GT_10" | "GT_20" | "GT_40")
        : ""),
      c_teilnehmer_durchschnitt: str("c_teilnehmer_durchschnitt"),
      c_quartierstreffen_anzahl: str("c_quartierstreffen_anzahl"),
      c_quartier_kooperation: str("c_quartier_kooperation"),
      c_quartier_person_name: str("c_quartier_person_name"),
      d_hauptamt_name: str("d_hauptamt_name"),
      d_hauptamt_stunden_woche: str("d_hauptamt_stunden_woche"),
      d_hauptamt_stunden_monat: str("d_hauptamt_stunden_monat"),
    };
  } else if (fb === "IV") {
    // FB IV formlos — nur optionale KI-Klassifikations-Hilfsfelder
    // (Agent-Handoff kennt keinen File-Upload; das PDF muss der Bürger
    // selbst auf der FBIV-Seite hochladen).
    next.fb_iv = {
      vorhaben_titel: str("vorhaben_titel"),
      kurzbeschreibung: str("kurzbeschreibung"),
    };
  }

  return next;
}

export function AgentHandoffBootstrap(): JSX.Element {
  const navigate = useNavigate();
  const { setState } = useAntrag();
  const [load, setLoad] = useState<LoadState>({
    kind: "loading",
    message: "Antrag aus Chat-Assistenten wird übernommen …",
  });

  useEffect(() => {
    try {
      const payload = decodeHashPayload(window.location.hash);
      const next = payloadToState(payload);
      if (!next.foerderbereich) {
        setLoad({
          kind: "error",
          message:
            "Der Übergabe-Datensatz enthält keinen Förderbereich. Bitte starten Sie das Gespräch im Agenten neu.",
        });
        return;
      }
      setState(() => next);
      setLoad({ kind: "done" });
      // Hash entfernen, damit ein Reload des Browsers nicht doppelt
      // dekodiert (und keine sensiblen Daten im URL-Verlauf hängen bleiben).
      window.history.replaceState({}, "", "/antrag/uebernahme-chat");
      // Direkt in Phase 1 — Bürger sieht alle vorausgefüllten Felder
      // und kann sich bis Phase 3 (Absenden) durchklicken.
      navigate("/antrag/phase-1", { replace: true });
    } catch (e) {
      setLoad({
        kind: "error",
        message:
          "Übergabe vom Chat-Assistenten fehlgeschlagen: " +
          ((e as Error).message ?? "unbekannter Fehler"),
      });
    }
  }, [navigate, setState]);

  if (load.kind === "loading") {
    return (
      <div style={{ padding: "3rem 1rem", textAlign: "center" }}>
        <div className="prefill-spinner" aria-hidden="true" />
        <p style={{ marginTop: "1rem", color: "#555" }}>{load.message}</p>
        <p style={{ marginTop: "0.5rem", fontSize: 13, color: "#888" }}>
          Sie werden gleich zur Prüfung weitergeleitet.
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
          <a href="https://agent.butscher.cloud">Zurück zum Chat-Assistenten</a> ·{" "}
          <a href="/">Neuen Antrag direkt im Webformular starten</a>
        </p>
      </div>
    );
  }
  return <div />;
}
