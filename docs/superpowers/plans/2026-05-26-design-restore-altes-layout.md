# Design-Restore — altes Layout für UE2 + UE3 Antrag-Detail

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Den visuellen Aufbau der Antrag-Detail-Page aus dem Pre-Hard-Cut-Stand `7754322` (23.05.2026) wiederherstellen — für UE3 (KI-Variante) **und** UE2 (manuelle Variante). Robert vermisst speziell:

1. **Bearbeitungsstand-Stepper als eigene Sticky-Bar** oben mit „Eingegangen — In Prüfung — Entscheidung" (statt aktuell „Eingegangen / In Prüfung / Entschieden" inline)
2. **Förder-Hero** unter Stadt-Würzburg-Header mit:
   - „FÖRDERANTRAG · ALTENTAGESSTÄTTEN APL 2" small caps
   - „Betriebs- und Personalkostenzuschuss" als Hauptüberschrift (FB-spezifisch)
   - „Haushaltsjahr 2026" 
   - „AKTENZEICHEN" rechts oben + Status-Badge
   - **EINRICHTUNG-Block mit rotem Linkrand** (border-l-[3px] border-wue-rot)
   - **Beantragte Förderung (Jahr)** Hero-Strip mit prominentem Betrag + FB-Bezug + AHP-Cap
3. **§ 1, § 2, § 3 … DocSections** mit Chevron-Aufklapp, fettem „§ X" Präfix, Titel + optional Subtitel
4. **Submission-Footer** wie Eingangsstempel unten

**Architecture:** Der `@dv/antrag-renderer` ist bereits Single Source of Truth für UE2+UE3 (Migration vom 26.05.2026). Wir bauen IHN um — sodass beide Frontends automatisch profitieren. Layout-Components zusätzlich in `@dv/antrag-renderer`:
- `<Bearbeitungsstand status />` (sticky horizontal stepper)
- `<AntragHeader antrag />` (Stadt-Würzburg-Banner + Förder-Hero + Einrichtung + Förder-Summary-Strip)
- `<DocSection num title subtitle pruefStatus collapsible>` (das Akkordeon mit § X-Präfix, Chevron, Border)
- `<FieldGrid>` + `<DocField label>` (Layout-Primitives)
- `<SubmissionFooter antrag />` (Eingangsstempel-Look unten)

`AntragViewer` orchestriert diese — bekommt einen FB-spezifischen Children-Mapper, der das jetzige Schema-basierte Rendering durch §-Sektionen ersetzt.

**Tech Stack:** React 19, Tailwind v4 (mit `wue-rot` als gemapptem Hex), Lucide-Icons, vorhandenes ShadCN ui.

**Referenz:** Das alte komplette `AntragDetail.tsx` liegt unter `docs/superpowers/refs/altes-layout/AntragDetail-7754322.tsx` (2021 Zeilen). Wichtige Zeilen:
- 170–356: Stadt-Würzburg + Hero + Einrichtung + Summary-Strip + §-Sektionen
- 358–390: Submission-Footer
- 593+: `DocSection`-Komponente (collapsible, Chevron)
- 1700+: `Bearbeitungsstand`-Komponente
- 1054+: `FoerderblockKomplett` mit „Beantragte Förderung (Jahr)"-Hero

**Constraints (HART):**
1. **Schema bleibt Multi-FB.** Felder lesen aus `antrag.einrichtung`, `antrag.dachverband` (NICHT `name`/`traeger`), aus `fb_details.*` (NICHT direkt aus antrag). Der alte Code nutzt apl2-Felder — der ist nur visuelle Vorlage, kein Copy-Paste der Logik.
2. **Halluzinations-Schutz (Robert-Regel):** Keine erfundenen Inhalte. Was im Schema nicht da ist, wird nicht angezeigt. Die FB-spezifischen „§ 4 Förderbereich"-Inhalte kommen aus `packages/antrag-renderer/src/schemas/fb-*.schema.ts` (existieren bereits), das bleibt.
3. **UE2 ↔ UE3 synchron:** Beide nutzen `@dv/antrag-renderer`. Layout-Changes wirken in beiden.
4. **Bestehende Funktionalität (UE3 KI-Cards, UE2 SektionPruefung, Workflow-Buttons) bleibt erhalten** — das ist NICHT Teil des Restore, nur das Layout (Stepper + Hero + DocSection-Look) wird zurückgebracht.

---

## Datenmodell-Mapping (alt → neu)

| Alt (apl2) | Neu (apl-Schema) |
|---|---|
| `antrag.name` | `antrag.einrichtung` |
| `antrag.traeger` | `antrag.dachverband` (fallback `antrag.einrichtung`) |
| `antrag.antragsdatum` | `antrag.submitted_at` (formatiert) |
| `antrag.bankverbindung` | `antrag.bankname` |
| `antrag.foerderbereich === 'altentagesstaetten'` | `antrag.foerderbereich === 'III'` |
| `antrag.geforderte_foerdersumme_euro` | FB-spezifisch aus `fb_details`: FB I = `personalkosten_euro + sachkosten_euro`; FB III/C = Treffen-Staffel; FB IV = `beantragte_summe_euro` falls vorhanden |
| `belegpositionen` (alt: § 5) | entfällt bzw. ersetzt durch `fb_details` |
| `oeffnungszeiten` (alt: § 6) | Tabelle existiert nicht mehr → § 6 entfällt |
| `antrag.raeume_*` | existiert nicht mehr → § 2 entfällt |

**FB-spezifische § -Sektionen (statt einheitlicher § 1-7):**
- **§ 1 Antragsteller / Träger** — gemeinsam (`einrichtung`, `dachverband`, `ansprechpartner`, `telefon`, `email`, Anschrift)
- **§ 2 Bankverbindung** — gemeinsam (`bankname`, `iban`, `bic`)
- **§ 3 Förderbereich-Detail** — FB-spezifisch:
  - FB I: Projekt-Eckdaten + Kostenplan + Drittmittel (aus fb_i.schema)
  - FB II: Ehrenamt-Block + Helfer-Tabelle (aus fb_ii.schema)
  - FB III: Variante + variantenspezifische Felder (aus fb_iii.schema)
  - FB IV: PDF-Upload + KI-Klassifikation (aus fb_iv.schema)
- **§ 4 Anlagen** — gemeinsam

---

## Task 1: `<Bearbeitungsstand>` — Sticky-Stepper-Bar

**Files:**
- Create: `packages/antrag-renderer/src/components/Bearbeitungsstand.tsx`
- Update: `packages/antrag-renderer/src/index.ts` (export)
- Create: `packages/antrag-renderer/tests/Bearbeitungsstand.test.tsx`

**Referenz im alten Code:** `docs/superpowers/refs/altes-layout/AntragDetail-7754322.tsx` ab Zeile 1700+. Schritt-Definition (in der alten Datei sucht der Subagent nach `stepperSteps` oder ähnlichem — falls Inline, einfach 1:1 reproduzieren).

- [ ] **Step 1: Test schreiben (drei Schritte rendern, aktueller markiert)**

```tsx
// packages/antrag-renderer/tests/Bearbeitungsstand.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Bearbeitungsstand } from "../src";

describe("Bearbeitungsstand", () => {
  it("rendert drei Schritte", () => {
    render(<Bearbeitungsstand status="in_pruefung" />);
    expect(screen.getByText("Eingegangen")).toBeInTheDocument();
    expect(screen.getByText("In Prüfung")).toBeInTheDocument();
    expect(screen.getByText("Entscheidung")).toBeInTheDocument();
  });

  it("hebt Schritt 2 hervor wenn Status='in_pruefung'", () => {
    render(<Bearbeitungsstand status="in_pruefung" />);
    const aktiv = screen.getByTestId("bearbeitungsstand-aktiv");
    expect(aktiv).toHaveTextContent("In Prüfung");
  });

  it("zeigt Entscheidungs-Label wenn bewilligt/abgelehnt/rueckfrage", () => {
    render(<Bearbeitungsstand status="bewilligt" />);
    expect(screen.getByText(/Bewilligt/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Component implementieren**

```tsx
// packages/antrag-renderer/src/components/Bearbeitungsstand.tsx
import type { StatusEnum } from "@dv/data-layer";

const SCHRITTE = [
  { id: 1, label: "Eingegangen", states: ["eingegangen"] },
  { id: 2, label: "In Prüfung", states: ["in_pruefung", "zweitpruefung_offen", "rueckfrage"] },
  { id: 3, label: "Entscheidung", states: ["bewilligt", "abgelehnt"] },
] as const;

const STATUS_LABEL: Record<StatusEnum, string> = {
  eingegangen: "Eingegangen",
  in_pruefung: "In Prüfung",
  zweitpruefung_offen: "Zweitprüfung offen",
  rueckfrage: "Rückfrage",
  bewilligt: "Bewilligt",
  abgelehnt: "Abgelehnt",
};

export function Bearbeitungsstand({ status }: { status: StatusEnum }) {
  const aktivIdx = SCHRITTE.findIndex((s) => s.states.includes(status as never));
  return (
    <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="px-10 lg:px-14 py-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 mb-2">
          Bearbeitungsstand
        </div>
        <ol className="flex items-stretch gap-0">
          {SCHRITTE.map((schritt, i) => {
            const isAktiv = i === aktivIdx;
            const isErreicht = i < aktivIdx;
            const isEntscheidung = schritt.id === 3 && aktivIdx === 2;
            return (
              <li key={schritt.id} className="flex-1 flex items-center" data-testid={isAktiv ? "bearbeitungsstand-aktiv" : undefined}>
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold tabular-nums ${
                    isAktiv ? "bg-slate-900 text-white" :
                    isErreicht ? "bg-slate-700 text-white" : "bg-white border-2 border-slate-300 text-slate-400"
                  }`}>
                    {schritt.id}
                  </div>
                  <div className="flex flex-col">
                    <span className={`text-sm font-semibold uppercase tracking-wider ${
                      isAktiv || isErreicht ? "text-slate-900" : "text-slate-400"
                    }`}>
                      {schritt.label}
                    </span>
                    {isEntscheidung && (
                      <span className={`text-xs ${
                        status === "bewilligt" ? "text-emerald-700" :
                        status === "abgelehnt" ? "text-rose-700" : "text-slate-500"
                      }`}>
                        {STATUS_LABEL[status]}
                      </span>
                    )}
                  </div>
                </div>
                {i < SCHRITTE.length - 1 && (
                  <div className={`flex-1 h-[2px] mx-4 ${i < aktivIdx ? "bg-slate-700" : "bg-slate-200"}`} />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Test passen, Export, Commit**

```bash
pnpm --filter @dv/antrag-renderer test  # 3 Tests grün
git add packages/antrag-renderer/src/components/Bearbeitungsstand.tsx packages/antrag-renderer/src/index.ts packages/antrag-renderer/tests/Bearbeitungsstand.test.tsx
git commit -m "feat(antrag-renderer): Bearbeitungsstand-Stepper als Sticky-Bar (Pre-Hard-Cut-Look restauriert)"
```

---

## Task 2: `<AntragHeader>` — Stadt-Würzburg-Banner + Förder-Hero + Einrichtung + Förder-Summary

**Files:**
- Create: `packages/antrag-renderer/src/components/AntragHeader.tsx`
- Update: `packages/antrag-renderer/src/index.ts`
- Create: `packages/antrag-renderer/tests/AntragHeader.test.tsx`

**Referenz:** Zeile 170–227 in `docs/superpowers/refs/altes-layout/AntragDetail-7754322.tsx`.

- [ ] **Step 1: Test schreiben**

```tsx
// packages/antrag-renderer/tests/AntragHeader.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AntragHeader } from "../src";

const ANTRAG = {
  id: "x", antragsnummer: "APL-2026-FBI-DEMO-3C226F",
  haushaltsjahr: 2026, foerderbereich: "I",
  status: "in_pruefung", submitted_at: "2026-05-25T15:37:00Z",
  einrichtung: "DEMO-Caritas Quartier Heuchelhof",
  dachverband: "Caritasverband Würzburg",
  strasse: "Berner Straße", hausnummer: "14",
  plz: "97084", ort: "Würzburg",
};

describe("AntragHeader", () => {
  it("rendert Stadt-Würzburg-Band + Aktenzeichen", () => {
    render(<AntragHeader antrag={ANTRAG as any} fb_details={{}} />);
    expect(screen.getByText(/STADT WÜRZBURG/i)).toBeInTheDocument();
    expect(screen.getByText(ANTRAG.antragsnummer)).toBeInTheDocument();
  });
  it("rendert Förderbereich-Untertitel + Haushaltsjahr", () => {
    render(<AntragHeader antrag={ANTRAG as any} fb_details={{}} />);
    expect(screen.getByText(/Aufbau niedrigschwelliger Angebote/i)).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
  });
  it("rendert Einrichtungs-Block mit rotem Linkrand", () => {
    const { container } = render(<AntragHeader antrag={ANTRAG as any} fb_details={{}} />);
    expect(screen.getByText("DEMO-Caritas Quartier Heuchelhof")).toBeInTheDocument();
    expect(container.querySelector("[class*='border-l']")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Component implementieren**

Wichtige Stilelemente aus dem Original (Zeile 170–227):
- Outer-Container: roter Würzburg-Stripe (Stadt Würzburg / Sozialreferat · Beratungsstelle für Senioren)
- Untertitel-Zeile: `Förderantrag · Antragswesen Pflegen und Leben`
- Hauptüberschrift FB-spezifisch:
  - FB I: „Aufbau niedrigschwelliger Angebote"
  - FB II: „Förderung bürgerschaftlichen Engagements"
  - FB III: „Förderung bewährter Strukturen"
  - FB IV: „Struktur- und Schwerpunktförderung"
- „Haushaltsjahr {haushaltsjahr} · Würzburg, {datum} (Antragsdatum lt. Bürger)"
- Aktenzeichen-Block rechts mit `<StatusBadge>`
- Einrichtungs-Block mit `border-l-[3px] border-rose-700` (oder `border-wue-rot` falls Token existiert)
- `<AntragSummaryStrip>` darunter — siehe nächster Sub-Block

Förder-Summary-Strip (Zeile 226 ruft `AntragSummaryStrip` auf — Zeile 1054+ implementiert):
- „BEANTRAGTE FÖRDERUNG (JAHR)" + großer Betrag + FB-Subtext mit AHP-Cap
- Wenn FB I: Summe = `personalkosten_euro + sachkosten_euro`
- Wenn FB II: „Pauschalförderung (Helferstunden)"
- Wenn FB III: Cap nach Variante (A: 800€, B: 1200€, C: 600/750€ je Schwelle, D: 2400€)
- Wenn FB IV: `beantragte_summe_euro` oder „Höhe gem. Antrag"

- [ ] **Step 3: Tests passen + Commit**

```bash
pnpm --filter @dv/antrag-renderer test
git add packages/antrag-renderer/src/components/AntragHeader.tsx packages/antrag-renderer/src/index.ts packages/antrag-renderer/tests/AntragHeader.test.tsx
git commit -m "feat(antrag-renderer): AntragHeader mit Stadt-Würzburg-Banner + Förder-Hero (Pre-Hard-Cut-Look)"
```

---

## Task 3: `<DocSection>` + `<FieldGrid>` + `<DocField>` — § -Blöcke mit Chevron-Aufklapp

**Files:**
- Create: `packages/antrag-renderer/src/components/DocSection.tsx`
- Create: `packages/antrag-renderer/src/components/FieldGrid.tsx`
- Create: `packages/antrag-renderer/src/components/DocField.tsx`
- Update: `packages/antrag-renderer/src/index.ts`
- Create: `packages/antrag-renderer/tests/DocSection.test.tsx`

**Referenz:** Zeile 593+ in `docs/superpowers/refs/altes-layout/AntragDetail-7754322.tsx` (DocSection-Definition). Wichtig: **Chevron VOR der §-Überschrift** (Commit `baa6094` hatte das exakt so gefixt).

- [ ] **Step 1: Test schreiben**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { DocSection, FieldGrid, DocField } from "../src";

describe("DocSection", () => {
  it("rendert §-Präfix vor Titel", () => {
    render(<DocSection num="§ 1" title="Antragsteller / Träger"><div>foo</div></DocSection>);
    expect(screen.getByText("§ 1")).toBeInTheDocument();
    expect(screen.getByText("Antragsteller / Träger")).toBeInTheDocument();
  });
  it("ist standardmäßig aufgeklappt — Children sichtbar", () => {
    render(<DocSection num="§ 1" title="x"><div>inhalt</div></DocSection>);
    expect(screen.getByText("inhalt")).toBeVisible();
  });
  it("klappt beim Klick auf Header zu/auf", () => {
    render(<DocSection num="§ 1" title="x"><div>inhalt</div></DocSection>);
    fireEvent.click(screen.getByRole("button", { name: /§ 1/ }));
    expect(screen.queryByText("inhalt")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implementieren**

Visuelles Detail:
- Header-Zeile mit `<button>`: Chevron (rotated wenn auf), „§ X" mono semibold, Titel groß, optional Subtitle small italic
- Body padded, Trennlinie oberhalb body
- `onPruefStatusChange?` Optional-Prop für SektionPruefung-Integration in UE2 (das löst auch das andere Anliegen — Sektion-Kommentare in UE2 — visuell mit ein)

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(antrag-renderer): DocSection/FieldGrid/DocField — § -Blocks mit Chevron-Aufklapp"
```

---

## Task 4: `AntragViewer` auf §-Sektionen umbauen — FB-spezifisch

**Files:**
- Modify: `packages/antrag-renderer/src/components/AntragViewer.tsx`
- Modify: `packages/antrag-renderer/src/components/SectionViewer.tsx` (oder durch DocSection ersetzen)
- Update vorhandene Tests in `packages/antrag-renderer/tests/render.test.ts`

**Strategie:** `AntragViewer` rendert in dieser Reihenfolge:
1. § 1 Antragsteller / Träger — aus `antrag.einrichtung, dachverband, ansprechpartner, strasse, hausnummer, plz, ort, telefon, email, homepage`
2. § 2 Bankverbindung — `bankname, iban, bic`
3. § 3 Förderbereich-Detail — dispatcht über `fb` prop:
   - FB I: `fb_details.projekt_titel, laufzeit, stadtteil, personalkosten_euro, sachkosten_euro, drittmittel, andere_mittel`
   - FB II: Ehrenamt-Block + 1:n Helfer-Tabelle
   - FB III: Variante + variantenspezifische Felder (Var A: a_anmerkung, Var B/C: Treffen, Var D: Hauptamt)
   - FB IV: Vorhaben-Titel + Kurzbeschreibung + Dokument-Pfad
4. § 4 Anlagen — Liste

Die existierenden Schema-Files in `packages/antrag-renderer/src/schemas/fb-*.schema.ts` bleiben als Source-of-Truth für Feldlisten — der Renderer übersetzt jetzt jede Schema-Section in eine `<DocSection>` statt der bisherigen `<SectionViewer>`-Box.

- [ ] **Step 1-N**: Schema-renderer-Loop anpassen, sodass jede `SectionSchema` zu `<DocSection num={'§ ' + index} title={titel} subtitle={subtitel}>...</DocSection>` wird. Subagent designt die genaue Verdrahtung.

- [ ] **Commit:** `refactor(antrag-renderer): AntragViewer auf DocSection-Pattern — § -Blocks mit Aufklapp`

---

## Task 5: UE3 + UE2 AntragDetail.tsx — neue Komponenten verkabeln

**Files:**
- Modify: `ue3/sachbearbeitung-ki/src/pages/AntragDetail.tsx`
- Modify: `ue2/sachbearbeiter/src/pages/AntragDetail.tsx`

Beide Pages werden vereinheitlicht:
1. Oben: `<Bearbeitungsstand status={antrag.status} />`
2. Article (lg:col-span-2):
   - Hülle: weißer Container mit `shadow-sm rounded`, wie im alten Look (Zeile 117 alt)
   - `<AntragHeader antrag fb_details />`
   - `<AntragViewer fb={...} data={...} />` (rendert die § -Sektionen)
   - `<SubmissionFooter antrag />` (optional Task 6)
3. Aside bleibt wie aktuell (UE3 KI-Cards, UE2 nur Workflow + Verlauf)

Sticky-Verhalten: Aside `lg:sticky lg:top-[6.5rem]` (5rem für Stepper + 1.5rem Gap).

- [ ] **Step 1**: UE3 AntragDetail.tsx umbauen, Bearbeitungsstand + AntragHeader integrieren
- [ ] **Step 2**: UE2 spiegeln
- [ ] **Step 3**: Page-Render-Tests anpassen (`tests/AntragDetail.test.tsx` in beiden UEs)
- [ ] **Step 4**: Commit

---

## Task 6 (optional): `<SubmissionFooter>` — Eingangsstempel unten

Zeile 358–390 im alten Code. Zeigt:
- „Antragsdatum lt. Bürger {antrag.submitted_at}"
- „Eingegangen {antrag.submitted_at}" (gleich, weil submitted_at = Eingang)
- „Sprache DE · Haushaltsjahr 2026"

Pro/Contra: Schöner Closing-Look. Pro UE konfigurierbar. Nicht kritisch — wenn Zeit knapp wird, skip.

---

## Selbstreview

1. **Visuell stimmig zur Vorlage?** Side-by-side mit Screenshot aus Robert prüfen.
2. **Keine apl2-Felder mehr im Code?** `grep -rn 'antrag\.name\|antrag\.traeger\|antrag\.bankverbindung\|antrag\.antragsdatum\|raeume_\|miete_\|betriebskosten_\|geforderte_foerdersumme' packages/antrag-renderer/src ue2/ ue3/`
3. **UE2 + UE3 visuell konsistent?** Beide pages rendern Stepper + Hero + DocSections.
4. **Aside in UE3 zeigt PruefungsCard, ExterneValidierungCard, BescheideListe, ZweitpruefungsCard, Workflow, VorjahresVergleich.** UE2 zeigt nur Workflow + Verlauf (KI-Cards raus laut Task #105).
5. **Build + Test**: `pnpm test` für packages/antrag-renderer, UE2, UE3 — alle grün.

## Deploy

Robert macht: `git push origin main; ./scripts/dv-fast-deploy.sh ue3; ./scripts/dv-fast-deploy.sh ue2`.
