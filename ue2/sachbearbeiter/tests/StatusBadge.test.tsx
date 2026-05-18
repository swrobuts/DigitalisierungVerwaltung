import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "../src/components/StatusBadge";

describe("StatusBadge", () => {
  it("zeigt deutschsprachiges Label für eingegangen", () => {
    render(<StatusBadge status="eingegangen" />);
    expect(screen.getByText("Eingegangen")).toBeInTheDocument();
  });

  it("zeigt 'In Prüfung' für in_pruefung", () => {
    render(<StatusBadge status="in_pruefung" />);
    expect(screen.getByText("In Prüfung")).toBeInTheDocument();
  });
});
