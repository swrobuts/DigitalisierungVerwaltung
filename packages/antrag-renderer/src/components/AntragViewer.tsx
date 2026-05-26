/**
 * Generischer Antrags-Viewer — wählt das richtige Schema anhand des
 * Förderbereichs und rendert alle Sektionen.
 *
 * Single Source of Truth für Bürger und Sachbearbeitung:
 *   - UE1 nutzt UE-spezifische Editoren, aber für Labels/Validierungs-Texte
 *     SOLL es perspektivisch dieselben Schemas wie hier importieren.
 *   - UE2/UE3 nutzen <AntragViewer/> für die read-only-Anzeige — kein
 *     Feld-Mapping mehr im UE2/UE3-Code, kein Render-Drift möglich.
 *
 * Wenn ein Feld in der DB neu hinzukommt, muss es im entsprechenden
 * Schema (packages/antrag-renderer/src/schemas/*) ergänzt werden.
 * Danach erscheint es automatisch in beiden Sachbearbeitungs-Frontends.
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

interface Props {
  fb: FoerderbereichId;
  fbI?: FbIProjekt | null;
  fbIi?: FbIiEhrenamt | null;
  fbIiHelfer?: FbIiHelfer[];
  fbIii?: FbIiiVarianteRow | null;
  fbIv?: FbIvFreitext | null;
}

export function AntragViewer(props: Props) {
  switch (props.fb) {
    case "I":
      return props.fbI ? (
        <Sections sections={FB_I_SECTIONS} data={props.fbI} />
      ) : (
        <Placeholder fb="I" />
      );

    case "II":
      return props.fbIi ? (
        <>
          <Sections sections={FB_II_SECTIONS} data={props.fbIi} />
          <HelferTable helfer={props.fbIiHelfer ?? []} />
        </>
      ) : (
        <Placeholder fb="II" />
      );

    case "III":
      return props.fbIii ? (
        <Sections sections={FB_III_SECTIONS} data={props.fbIii} />
      ) : (
        <Placeholder fb="III" />
      );

    case "IV":
      return props.fbIv ? (
        <Sections sections={FB_IV_SECTIONS} data={props.fbIv} />
      ) : (
        <Placeholder fb="IV" />
      );
  }
}

/** Helper: rendert eine Liste Sections einheitlich. */
function Sections<T>({
  sections,
  data,
}: {
  sections: ReadonlyArray<import("../types").SectionSchema<T>>;
  data: T;
}) {
  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <div key={s.id}>
          <h4 className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            {s.titel}
          </h4>
          <SectionViewer section={s} data={data} />
        </div>
      ))}
    </div>
  );
}

function Placeholder({ fb }: { fb: string }) {
  return (
    <p className="text-xs text-slate-500">
      FB {fb}: Detail-Datensatz nicht (mehr) vorhanden.
    </p>
  );
}
