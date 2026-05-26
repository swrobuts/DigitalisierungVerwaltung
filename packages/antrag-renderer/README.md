# `@dv/antrag-renderer`

**Single Source of Truth** für die Anzeige von Anträgen in der Sachbearbeitung
(UE2 + UE3) — und perspektivisch auch für die Label-/Validierungs-Texte im
Bürger-Editor (UE1).

## Warum dieses Paket?

Vor diesem Refactor hatten UE2 und UE3 je eine eigene `FbBlocks.tsx`-Komponente,
die manuell jedes FB-Detail-Feld renderte. Folge: jedes Mal, wenn der Bürger
(UE1) ein neues Feld eintragen konnte oder die DB ein neues Feld bekam, mussten
**drei Stellen** angepasst werden — und mindestens eine wurde regelmäßig
vergessen. Beispiel-Bug, der das Refactoring ausgelöst hat:
`c_quartier_person_name` wurde in UE1 + DB ergänzt, aber in UE2/UE3
nicht — Sachbearbeiter sahen weniger als der Bürger eingegeben hatte.

Mit diesem Paket:

- **Eine Datei pro Förderbereich** definiert das Schema → Anzeige
  (`schemas/fb-i.schema.ts` …)
- **Eine Komponente** rendert es → `<AntragViewer fb=… data=… />`
- **Ein CI-Gate** (`tests/field-coverage.test.ts`) bricht den Build,
  wenn eine DB-Spalte nicht im Schema landet

## Verwendung in UE2 / UE3

```tsx
import { AntragViewer } from "@dv/antrag-renderer";

<AntragViewer
  fb={antrag.foerderbereich}
  fbI={bundle.fb_i}
  fbIi={bundle.fb_ii}
  fbIiHelfer={bundle.fb_ii_helfer}
  fbIii={bundle.fb_iii}
  fbIv={bundle.fb_iv}
/>
```

Das ersetzt vier separate `<FbIBlock />`/`<FbIiBlock />`/…-Komponenten.

## Wie ergänze ich ein neues Feld?

Beispiel: ein neues Feld `c_zusatz_info` in `apl.fb_iii_variante`.

1. **Migration**: SQL-Spalte hinzufügen (`supabase/migrations/0XX_…sql`)
2. **Type**: in `packages/data-layer/src/db-types.ts` zum
   `FbIiiVarianteRow`-Interface hinzufügen
3. **Schema**: in `packages/antrag-renderer/src/schemas/fb-iii.schema.ts`
   in der `variante-c`-Section einen neuen `FieldSchema`-Eintrag setzen:
   ```ts
   { key: "c_zusatz_info", label: "Zusatz-Info", type: "text" }
   ```
4. **Coverage-Gate aktualisieren**: in
   `packages/antrag-renderer/tests/field-coverage.test.ts` die DB-Spalte
   zur `FB_III_DB_COLUMNS`-Liste hinzufügen — das gilt als „ich habe das
   Schema bewusst aktualisiert"
5. **UE1**: Editor-Component (`Phase2FBIII.tsx`) erweitern, damit der
   Bürger das Feld eintragen kann
6. **UE1 submit**: Falls Mapping nicht 1:1, in `ue1/.../lib/submit.ts`
   ergänzen

Schritte 1–4 sind alle in diesem Repo prüfbar. Sobald jemand die DB-Spalte
hinzufügt aber Schritt 3 vergisst, schlägt der `field-coverage`-Test in CI an.

## Feldtypen (`FieldType`)

| Type | Verwendung | Format |
|---|---|---|
| `text` | kurzer String | `"—"` wenn null/leer |
| `longtext` | mehrzeiliger String | mit `whitespace-pre-wrap` |
| `number` | Integer/Float | Deutsche Lokale (1.234) |
| `euro` | Geldbetrag | `1.500,00 €` |
| `percent` | 0..1 Dezimal | `65 %` |
| `date` | ISO YYYY-MM-DD | `15.03.2026` |
| `bool` | Boolean | `ja` / `nein` |
| `enum` | String aus Codes | nutzt `enumLabels` für Klartext |
| `list` | jsonb-Array | aufgeklappte UL mit `itemSchema` |
| `computed` | berechneter Wert | via `compute(data)` |

Beispiel `enum` mit Klartext-Labels:
```ts
{
  key: "c_treffen_schwelle",
  label: "Treffen-Schwelle",
  type: "enum",
  enumLabels: { GT_10: "Über 10 Treffen / Vorjahr",
                GT_20: "Über 20 Treffen / Vorjahr",
                GT_40: "Über 40 Treffen / Vorjahr" }
}
```

## Section-Conditionals

Variantenabhängige Sektionen (z.B. FB-III) nutzen `conditional`:
```ts
{
  id: "variante-c",
  titel: "Variante C — Seniorenkreis",
  conditional: (d) => d.variante === "C",
  fields: [...]
}
```

## Tests

```bash
pnpm --filter @dv/antrag-renderer test
```

- `render.test.ts` — Unit-Tests für `renderFieldValue()` (alle FieldTypes)
- `field-coverage.test.ts` — Vollständigkeits-Gate gegen DB-Schema

## Was dieses Paket NICHT macht

- Es ist **read-only**. Der Bürger-Editor (UE1) hat eigene React-Components
  mit Form-State, Validierung und Stepper.
- Es kennt keine Auth, kein PostgREST-Querying — die Caller (UE2/UE3) laden
  die Daten selbst und reichen sie an `<AntragViewer />`.
- Es macht keine i18n — Labels sind Deutsch. Für TR/EN-Mehrsprachigkeit
  könnten künftig die Schemas pro Sprache existieren.
