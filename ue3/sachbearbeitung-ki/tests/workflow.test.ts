import { describe, it, expect } from "vitest";
import {
  allowedTransitions,
  canTransition,
  isReverseTransition,
  STATUS_LABELS,
} from "../src/lib/workflow";

/**
 * Workflow-Modell seit Migration 035 + 036:
 *   - Endstatus (bewilligt/abgelehnt) sind nicht mehr Endsackgassen,
 *     sondern können in jeden anderen Status zurückkorrigiert werden
 *     (Verwaltungsfehler-Korrektur, „Querweg").
 *   - 'eingegangen' bleibt der einzige reine Eingangs-Status; der
 *     Direktsprung von dort zu Endentscheidungen ist nach wie vor nicht
 *     erlaubt (Prüfung muss durchlaufen werden).
 *
 * Diese Tests spiegeln das aktuelle Workflow-Modell. Forward-Transitions
 * erzeugen einen neuen Bescheid, Reverse-Transitions sind Korrekturen
 * mit Pflicht-Kommentar (UI-Hint, nicht hier getestet).
 */

describe("workflow — Übergänge (Migration 035/036)", () => {
  it("eingegangen → kann nur zu in_pruefung", () => {
    expect(allowedTransitions("eingegangen")).toEqual(["in_pruefung"]);
  });

  it("in_pruefung → rueckfrage, bewilligt, abgelehnt + zurück zu eingegangen", () => {
    expect(allowedTransitions("in_pruefung").sort()).toEqual([
      "abgelehnt",
      "bewilligt",
      "eingegangen",
      "rueckfrage",
    ]);
  });

  it("rueckfrage → zurück zu in_pruefung oder direkt zu Endentscheidung", () => {
    expect(allowedTransitions("rueckfrage").sort()).toEqual([
      "abgelehnt",
      "bewilligt",
      "in_pruefung",
    ]);
  });

  it("bewilligt ist KEIN Endstatus mehr — Korrektur in andere Status erlaubt", () => {
    expect(allowedTransitions("bewilligt").sort()).toEqual([
      "abgelehnt",
      "in_pruefung",
      "rueckfrage",
    ]);
  });

  it("abgelehnt ist KEIN Endstatus mehr — Korrektur erlaubt", () => {
    expect(allowedTransitions("abgelehnt").sort()).toEqual([
      "bewilligt",
      "in_pruefung",
      "rueckfrage",
    ]);
  });
});

describe("workflow — canTransition", () => {
  it("akzeptiert erlaubten Forward-Übergang", () => {
    expect(canTransition("eingegangen", "in_pruefung")).toBe(true);
    expect(canTransition("in_pruefung", "bewilligt")).toBe(true);
  });

  it("akzeptiert erlaubten Reverse-Übergang (bewilligt → in_pruefung)", () => {
    // Vor Migration 035/036 war das false — jetzt true, weil
    // Verwaltungsfehler-Korrektur erlaubt sein muss.
    expect(canTransition("bewilligt", "in_pruefung")).toBe(true);
  });

  it("lehnt verbotenen Übergang ab (eingegangen → bewilligt direkt)", () => {
    expect(canTransition("eingegangen", "bewilligt")).toBe(false);
  });

  it("lehnt verbotenen Übergang ab (bewilligt → eingegangen direkt)", () => {
    // Sprung ganz zurück zum Eingang nicht erlaubt — Weg muss über
    // in_pruefung gehen, damit Audit-Trail eindeutig bleibt.
    expect(canTransition("bewilligt", "eingegangen")).toBe(false);
  });
});

describe("workflow — isReverseTransition", () => {
  it("Forward-Schritt wird nicht als Reverse erkannt", () => {
    expect(isReverseTransition("eingegangen", "in_pruefung")).toBe(false);
    expect(isReverseTransition("in_pruefung", "bewilligt")).toBe(false);
  });

  it("Korrektur eines Endstatus zurück in Bearbeitung ist Reverse", () => {
    expect(isReverseTransition("bewilligt", "in_pruefung")).toBe(true);
    expect(isReverseTransition("abgelehnt", "in_pruefung")).toBe(true);
  });

  it("verbotene Transition ist nie Reverse (false)", () => {
    expect(isReverseTransition("bewilligt", "eingegangen")).toBe(false);
  });
});

describe("workflow — STATUS_LABELS", () => {
  it("hat deutsche Labels für alle 5 Status", () => {
    expect(STATUS_LABELS.eingegangen).toBe("Eingegangen");
    expect(STATUS_LABELS.in_pruefung).toBe("In Prüfung");
    expect(STATUS_LABELS.rueckfrage).toBe("Rückfrage");
    expect(STATUS_LABELS.bewilligt).toBe("Bewilligt");
    expect(STATUS_LABELS.abgelehnt).toBe("Abgelehnt");
  });
});
