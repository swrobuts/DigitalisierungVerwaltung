/**
 * Generischer Antrags-Viewer — wählt das richtige Schema anhand des
 * Förderbereichs und rendert alle Sektionen als `<DocSection>`-Akkordeons
 * mit §-Präfix.
 *
 * Single Source of Truth für UE2 + UE3:
 *   - UE1 nutzt UE-spezifische Editoren, aber für Labels/Validierungs-Texte
 *     SOLL es perspektivisch dieselben Schemas wie hier importieren.
 *   - UE2/UE3 nutzen <AntragViewer/> für die read-only-Anzeige — kein
 *     Feld-Mapping mehr im UE2/UE3-Code, kein Render-Drift möglich.
 *
 * Layout-Restore 2026-05-26: Jede Schema-Section wird zu einer
 * `<DocSection num="§ N">` mit Chevron-Aufklapp, statt der bisherigen
 * flachen <h4>+SectionViewer-Box. §-Nummerierung läuft kontinuierlich
 * je Förderbereich (FB-II zählt auch die Helfer-Tabelle als §-Sektion).
 *
 * Wenn ein Feld in der DB neu hinzukommt, muss es im entsprechenden
 * Schema (packages/antrag-renderer/src/schemas/*) ergänzt werden.
 * Der field-coverage.test.ts in CI fängt das ab.
 */
import type {
  FbIProjekt,
  FbIiEhrenamt,
  FbIiHelfer,
  FbIiiVarianteRow,
  FbIvFreitext,
  FoerderbereichId,
} from "@dv/data-layer";
import { FB_I_SECTIONS } from "../schemas/fb-i.schema";
import { FB_II_SECTIONS } from "../schemas/fb-ii.schema";
import { FB_III_SECTIONS } from "../schemas/fb-iii.schema";
import { FB_IV_SECTIONS } from "../schemas/fb-iv.schema";
import { SectionViewer } from "./SectionViewer";
import { HelferTable } from "./HelferTable";
import { DocSection } from "./DocSection";
import type { SectionSchema } from "../types";

interface Props {
  fb: FoerderbereichId;
  fbI?: FbIProjekt | null;
  fbIi?: FbIiEhrenamt | null;
  fbIiHelfer?: FbIiHelfer[];
  fbIii?: FbIiiVarianteRow | null;
  fbIv?: FbIvFreitext | null;
  /**
   * Optional: erlaubt eine §-Start-Nummer (z.B. wenn AntragHeader oben
   * bereits § 1 Antragsteller + § 2 Bankverbindung in der Page selbst
   * rendert und der Viewer ab § 3 weiterzählen soll).
   * Default: 1.
   */
  paragraphStart?: number;
}

export function AntragViewer(props: Props) {
  const start = props.paragraphStart ?? 1;
  switch (props.fb) {
    case "I":
      return props.fbI ? (
        <Sections sections={FB_I_SECTIONS} data={props.fbI} paragraphStart={start} />
      ) : (
        <Placeholder fb="I" />
      );

    case "II": {
      if (!props.fbIi) return <Placeholder fb="II" />;
      const nextNum = start + FB_II_SECTIONS.length;
      // Fragment statt <div>-Wrapper, damit die DocSections weiterhin
      // direkte Kinder des äußeren Containers bleiben (siehe Sections()
      // unten — :first-of-type-Selektor in DocSection muss global wirken).
      return (
        <>
          <Sections sections={FB_II_SECTIONS} data={props.fbIi} paragraphStart={start} />
          <DocSection num={`§ ${nextNum}`} title="Helfer-Liste">
            <HelferTable helfer={props.fbIiHelfer ?? []} />
          </DocSection>
        </>
      );
    }

    case "III":
      return props.fbIii ? (
        <Sections sections={FB_III_SECTIONS} data={props.fbIii} paragraphStart={start} />
      ) : (
        <Placeholder fb="III" />
      );

    case "IV":
      return props.fbIv ? (
        <Sections sections={FB_IV_SECTIONS} data={props.fbIv} paragraphStart={start} />
      ) : (
        <Placeholder fb="IV" />
      );
  }
}

/** Rendert eine Liste Schema-Sections als nummerierte §-Blocks. */
function Sections<T>({
  sections,
  data,
  paragraphStart,
}: {
  sections: ReadonlyArray<SectionSchema<T>>;
  data: T;
  paragraphStart: number;
}) {
  // Conditional Sections (z.B. FB-III Variante-spezifisch) werden gefiltert
  // BEVOR die §-Nummer vergeben wird — sonst entstehen Lücken wie § 1, § 3.
  const visible = sections.filter((s) => !s.conditional || s.conditional(data));
  // Fragment statt <div>: DocSections müssen direkte Kinder des äußeren
  // Containers (AntragDetail) sein, damit der :first-of-type-Selektor
  // in DocSection.tsx global gilt — sonst hätte § 3 (erste hier) keine
  // Trennlinie zur darüberliegenden § 2 in der Page.
  return (
    <>
      {visible.map((s, i) => (
        <DocSection key={s.id} num={`§ ${paragraphStart + i}`} title={s.titel}>
          <SectionViewer section={s} data={data} />
        </DocSection>
      ))}
    </>
  );
}

function Placeholder({ fb }: { fb: string }) {
  return (
    <p className="text-xs text-slate-500 italic">
      FB {fb}: Detail-Datensatz nicht (mehr) vorhanden.
    </p>
  );
}
