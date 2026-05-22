import { describe, it, expect } from "vitest";
import {
  allowedTransitions,
  canTransition,
  STATUS_LABELS,
} from "../src/lib/workflow";

describe("workflow", () => {
  it("eingegangen kann nur zu in_pruefung", () => {
    expect(allowedTransitions("eingegangen")).toEqual(["in_pruefung"]);
  });

  it("in_pruefung kann zu rueckfrage, bewilligt, abgelehnt", () => {
    expect(allowedTransitions("in_pruefung").sort()).toEqual([
      "abgelehnt",
      "bewilligt",
      "rueckfrage",
    ]);
  });

  it("rueckfrage kann zurück zu in_pruefung", () => {
    expect(allowedTransitions("rueckfrage")).toEqual(["in_pruefung"]);
  });

  it("bewilligt ist Endstatus", () => {
    expect(allowedTransitions("bewilligt")).toEqual([]);
  });

  it("abgelehnt ist Endstatus", () => {
    expect(allowedTransitions("abgelehnt")).toEqual([]);
  });

  it("canTransition akzeptiert erlaubten Übergang", () => {
    expect(canTransition("eingegangen", "in_pruefung")).toBe(true);
  });

  it("canTransition lehnt verbotenen Übergang ab", () => {
    expect(canTransition("bewilligt", "in_pruefung")).toBe(false);
  });

  it("STATUS_LABELS hat deutsche Labels für alle 5 Status", () => {
    expect(STATUS_LABELS.eingegangen).toBe("Eingegangen");
    expect(STATUS_LABELS.in_pruefung).toBe("In Prüfung");
    expect(STATUS_LABELS.rueckfrage).toBe("Rückfrage");
    expect(STATUS_LABELS.bewilligt).toBe("Bewilligt");
    expect(STATUS_LABELS.abgelehnt).toBe("Abgelehnt");
  });
});
