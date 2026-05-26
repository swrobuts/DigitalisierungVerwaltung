/**
 * Field-Schema = Single Source of Truth für die Anzeige eines Antrags-Feldes.
 *
 * Wird vom AntragViewer interpretiert (in UE2/UE3 Sachbearbeitung) und kann
 * vom UE1-Wizard für Labels/Validierungs-Bezeichnungen wiederverwendet werden.
 * Wenn ein Feld in der DB existiert, muss es hier auftauchen — sonst sieht
 * die Sachbearbeitung weniger als der Bürger eingegeben hat.
 */

export type FieldType =
  | "text" // string
  | "longtext" // string, mehrzeilig
  | "number" // integer / number
  | "euro" // number, formatiert als €
  | "percent" // number 0..1, als XX%
  | "date" // ISO YYYY-MM-DD
  | "bool" // ja / nein
  | "enum" // string aus Enum-Liste (Labels)
  | "list" // jsonb-Array von Sub-Objekten
  | "computed"; // abgeleiteter Wert (z.B. Gesamtkosten)

/**
 * Generisches Schema für ein einzelnes Anzeige-Feld.
 *
 * Generic `T` ist der Row-Typ (z.B. FbIProjekt). Bewusst ohne
 * `extends Record<…>`-Constraint — DB-Row-Typen aus @dv/data-layer haben
 * keine Index-Signature, dann würde TS sie ablehnen.
 */
export interface FieldSchema<T = unknown> {
  /** DB-Spaltenname ODER (bei `computed`) frei wählbares Key */
  key: string;
  /** Label in DE (Single Source of Truth — siehe i18n.ts für TR-Varianten) */
  label: string;
  /** Typ steuert die Render-Logik */
  type: FieldType;
  /** Optional: kondiert die Anzeige (z.B. Variante-A-Felder nur bei A) */
  conditional?: (data: T) => boolean;
  /** Bei `enum`: Mapping Code → Klartext-Label */
  enumLabels?: Record<string, string>;
  /** Bei `list`: Schema für jeden Listen-Eintrag (jsonb-Array-Items) */
  itemSchema?: ReadonlyArray<FieldSchema<Record<string, unknown>>>;
  // ↑ List-Items sind jsonb-Objekte ohne festen TS-Typ, daher Record
  /** Bei `computed`: Funktion, die den Wert berechnet (z.B. a+b) */
  compute?: (data: T) => unknown;
  /** Optional: Hinweis, dass dies ein Pflichtfeld ist (für visuelles Highlight) */
  pflicht?: boolean;
}

/** Logische Gruppierung von Feldern (entspricht einer Sektion/Region) */
export interface SectionSchema<T = unknown> {
  /** Eindeutige ID (auch für Pruefstatus-Toggle in UE2/UE3) */
  id: string;
  /** Sektions-Titel (DE) */
  titel: string;
  /** Fields, die zu dieser Sektion gehören */
  fields: ReadonlyArray<FieldSchema<T>>;
  /** Optional: ganze Sektion conditional (z.B. FB-III Varianten) */
  conditional?: (data: T) => boolean;
}
