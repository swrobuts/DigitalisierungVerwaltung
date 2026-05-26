/**
 * @dv/antrag-renderer — Single Source of Truth für Anzeige & Field-Schemas.
 *
 * Verwendung in UE2/UE3:
 *   import { AntragViewer } from "@dv/antrag-renderer";
 *   <AntragViewer fb={antrag.foerderbereich}
 *                 fbI={fb_i} fbIi={fb_ii} fbIiHelfer={...}
 *                 fbIii={fb_iii} fbIv={fb_iv} />
 *
 * Wenn UE1 ein neues Feld hinzufügt, MUSS das Schema hier mit-erweitert
 * werden, sonst sieht die Sachbearbeitung weniger als der Bürger eingab.
 */

// Schemas (für Tests + UE1-Wiederverwendung)
export { FB_I_SECTIONS } from "./schemas/fb-i.schema";
export {
  FB_II_SECTIONS,
  FB_II_HELFER_COLUMNS,
} from "./schemas/fb-ii.schema";
export { FB_III_SECTIONS } from "./schemas/fb-iii.schema";
export { FB_IV_SECTIONS } from "./schemas/fb-iv.schema";

// Renderer-Komponenten
export { AntragViewer } from "./components/AntragViewer";
export { SectionViewer } from "./components/SectionViewer";
export { HelferTable } from "./components/HelferTable";
export { FieldRow } from "./components/FieldRow";

// Layout-Komponenten (Pre-Hard-Cut-Restore, 2026-05-26)
export { Bearbeitungsstand } from "./components/Bearbeitungsstand";
export { AntragHeader } from "./components/AntragHeader";
export { DocSection } from "./components/DocSection";
export { FieldGrid } from "./components/FieldGrid";
export { DocField } from "./components/DocField";

// Pure Helper (für Tests + UE4-Agent)
export { renderFieldValue } from "./render";
export {
  formatBool,
  formatDate,
  formatEuro,
  formatNumber,
  formatPercent,
  formatText,
} from "./format";

// Types
export type { FieldSchema, FieldType, SectionSchema } from "./types";
