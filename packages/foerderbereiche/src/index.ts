export * from "./types";
export { evaluateRule } from "./validator";
export { FB_I } from "./fb-i.config";
export { FB_II } from "./fb-ii.config";
export { FB_III, FB_III_VARIANTEN } from "./fb-iii.config";
export type { FbIiiVarianteId, FbIiiVarianteKonfig } from "./fb-iii.config";
export { FB_IV } from "./fb-iv.config";

import { FB_I } from "./fb-i.config";
import { FB_II } from "./fb-ii.config";
import { FB_III } from "./fb-iii.config";
import { FB_IV } from "./fb-iv.config";
import type { FoerderbereichKonfig, FoerderbereichId } from "./types";

/**
 * Frozen Registry aller 4 Förderbereiche.
 * Konsumenten dürfen nicht mutieren — Object.freeze schützt zur Laufzeit,
 * `Readonly<Record<...>>` zur Compile-Zeit.
 */
export const ALL_FOERDERBEREICHE: Readonly<Record<FoerderbereichId, FoerderbereichKonfig>> =
  Object.freeze({
    I: FB_I, II: FB_II, III: FB_III, IV: FB_IV,
  });

export function konfigFor(id: FoerderbereichId): FoerderbereichKonfig {
  return ALL_FOERDERBEREICHE[id];
}
