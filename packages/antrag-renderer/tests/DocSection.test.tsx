import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DocSection, FieldGrid, DocField } from "../src";

describe("DocSection", () => {
  it("rendert §-Präfix vor Titel und Children", () => {
    render(
      <DocSection num="§ 1" title="Antragsteller / Träger">
        <div>inhalt</div>
      </DocSection>,
    );
    expect(screen.getByText("§ 1")).toBeInTheDocument();
    expect(screen.getByText("Antragsteller / Träger")).toBeInTheDocument();
    expect(screen.getByText("inhalt")).toBeInTheDocument();
  });

  it("rendert Subtitle mit Em-Dash", () => {
    render(
      <DocSection num="§ 4" title="Förderbereich" subtitle="Beantragte Summe und Höchstgrenze">
        <div>x</div>
      </DocSection>,
    );
    expect(screen.getByText(/Beantragte Summe und Höchstgrenze/)).toBeInTheDocument();
  });

  it("klappt beim Klick auf den Header zu", () => {
    render(
      <DocSection num="§ 1" title="x">
        <div>inhalt</div>
      </DocSection>,
    );
    expect(screen.queryByText("inhalt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { expanded: true }));
    expect(screen.queryByText("inhalt")).not.toBeInTheDocument();
  });

  it("respektiert defaultOpen=false", () => {
    render(
      <DocSection num="§ 1" title="x" defaultOpen={false}>
        <div>inhalt</div>
      </DocSection>,
    );
    expect(screen.queryByText("inhalt")).not.toBeInTheDocument();
  });

  it("zeigt actions-Slot rechts vom Titel", () => {
    render(
      <DocSection num="§ 1" title="x" actions={<span>Prüfung</span>}>
        <div>inhalt</div>
      </DocSection>,
    );
    expect(screen.getByText("Prüfung")).toBeInTheDocument();
  });
});

describe("FieldGrid + DocField", () => {
  it("rendert DocField-Label und Children im Grid", () => {
    render(
      <FieldGrid>
        <DocField label="Ansprechpartner">Max Mustermann</DocField>
        <DocField label="E-Mail">m@x.de</DocField>
      </FieldGrid>,
    );
    expect(screen.getByText("Ansprechpartner")).toBeInTheDocument();
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
    expect(screen.getByText("E-Mail")).toBeInTheDocument();
  });
});
