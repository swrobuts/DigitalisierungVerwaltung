# 03 — Code-Walkthrough & Mitmach-Aufgabe

## Code-Tour (für die Stunde)

Wir gehen vier Dateien zusammen durch:

1. **`src/types.ts`** — Das Domain-Model: 1:1-Spiegelung der PDF-Felder + Sprache-Type. Grundlage für alle weiteren Stufen.

2. **`src/validation.ts`** — Vier pure Funktionen (IBAN, E-Mail, Datum, Euro). Pure = kein DOM, kein I/O → in `tests/validation.test.ts` mit **Vitest** getestet. Erste Berührung mit „Code, der entscheidet, sollte testbar sein."

3. **`src/i18n.ts` + `src/translations.ts`** — Das Mehrsprachigkeits-Modul. Drei Funktionen: `setSprache`, `t`, `applyTranslations`. Übersetzungen in einer einzigen JSON-Tabelle. `data-i18n`-Attribute im HTML zeigen, wo gesprochen wird.

4. **`src/main.ts`** — Das DOM-Wiring. Hier passieren vier Dinge:
   - i18n initialisieren (gespeicherte Sprache laden + anwenden)
   - Form lesen (`leseAntragAusFormular`)
   - Validieren (Feld + Cross-Field)
   - Submit / Druck

## Mitmach-Aufgabe (11:45–12:10)

Wählen Sie eine von drei Mini-Aufgaben:

### Aufgabe A — Validierungs-Regel ergänzen
In `src/cross-field.ts` eine neue Regel:
> *„Wenn die Personalkosten höher als die Betriebskosten sind, soll ein Hinweis erscheinen — das ist ungewöhnlich und sollte begründet werden."*

Tipp: Da `ValidationErrors` nur Fehler kennt, schreiben Sie es vorerst als „Hinweis: …"-Fehler.

**Bonus**: Wenn die neue Cross-Field-Regel feuern soll, ist sie *nur* eine Client-Validierung.
Server-seitig (Edge Function) gibt es derzeit keine Wiederholung der Cross-Field-Logik. Diskutieren
Sie: Reicht Client-Validation, oder müsste die Function das auch prüfen?

### Aufgabe B — Sprachpaket ergänzen
Ergänzen Sie in `src/translations.ts` eine fünfte Sprache (z.B. französisch, polnisch, ukrainisch). Tests in `tests/i18n.test.ts` müssen weiter grün sein (Vollständigkeit der Keys prüfen). Vergessen Sie nicht: `ALLE_SPRACHEN` in `types.ts` ergänzen, neue `<option>` im `index.html`.

### Aufgabe C — Neues Feld + Übersetzung
Im HTML zusätzlich „Mobil-Telefon" einfügen. In `types.ts` ergänzen, in `validation.ts` `isValidPhone` mit zwei Tests, in `main.ts` einlesen. **Bonus**: das neue Label in allen 4 Sprachen übersetzen.

### Aufgabe D — Antrag in der DB anschauen

Loggen Sie sich am Supabase-Studio ein (URL bekommen Sie vom Dozenten). Navigieren Sie zur Tabelle
`apl2.antraege` und schauen Sie sich Ihren eben gesendeten Antrag an:
- Welche Antragsnummer hat er bekommen?
- Welche IP-Adresse wurde server-side erfasst?
- Welcher User-Agent (Browser)?
- In welcher `submitted_language`?

Dann öffnen Sie den Storage-Bucket `antragsbelege` und finden Sie Ihre hochgeladenen Belege unter
dem Pfad `<antrag-uuid>/<typ>__<filename>`. Laden Sie eine herunter und prüfen Sie, dass es Ihre
Original-Datei ist.

## Nach der Aufgabe

1. `npm test` — alle Tests müssen grün sein
2. `npm run dev` — Browser-Smoke-Test
3. Wer mag: `git commit -m "wip(ue1): meine Mitmach-Aufgabe"` und am Whiteboard zeigen
