/**
 * Kompakter Förderbereich-Chip — Icon + label_kurz, farbcodiert pro FB.
 * Verwendet die Konfiguration aus @dv/foerderbereiche, damit Icon und
 * Label-Texte konsistent zu UE0/UE1 sind.
 */
import { ALL_FOERDERBEREICHE, type FoerderbereichId } from "@dv/foerderbereiche";
import { FbIcon } from "./FbIcon";

const COLOR: Record<FoerderbereichId, string> = {
  I: "bg-emerald-50 text-emerald-900 border-emerald-300",
  II: "bg-amber-50 text-amber-900 border-amber-300",
  III: "bg-blue-50 text-blue-900 border-blue-300",
  IV: "bg-violet-50 text-violet-900 border-violet-300",
};

export function FbBadge({ fb }: { fb: FoerderbereichId }) {
  const cfg = ALL_FOERDERBEREICHE[fb];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-medium whitespace-nowrap ${COLOR[fb]}`}
      title={cfg.label_lang}
    >
      <FbIcon name={cfg.icon} className="h-3 w-3" />
      <span>FB {fb}</span>
      <span className="text-[10px] opacity-75">· {cfg.label_kurz}</span>
    </span>
  );
}
