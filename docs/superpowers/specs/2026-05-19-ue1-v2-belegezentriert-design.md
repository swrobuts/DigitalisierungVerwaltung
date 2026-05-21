# UE1-v2 — Belegezentriertes Stepper-Formular (APL2)

**Stand:** 2026-05-19 (vormittags)
**Autor:** swrobuts (mit Claude Opus 4.7)
**Vorgänger-Specs:** `2026-05-18-ue1-persistenz-supabase.md`, `2026-05-19-endvision-intent-driven-buergerjourney-design.md`
**Status:** Entwurf zur Freigabe

## 1. Vision

Sprung von „PDF-in-HTML-konvertiert" zu „spürbar besser als PDF": Stepper-Layout mit Live-Validation, atomarer Belegpositionen statt grober Summen-Zahlen, strukturiertem Wochenplan statt PDF-Beilage, Pre-Submit-Übersicht. Primärziel: ein Bürger (Senior, Vereinsvorstand, kein Power-User) sagt nach dem Submit *„das war einfacher als ich dachte"*, nicht *„das war ein digitales PDF"*.

UE1-v2 ist refactor des bestehenden `ue1/webformular/`, kein Neubau. DB-Schema bleibt großteils kompatibel — additive Erweiterungen plus Umstellung der zwei Summen-Spalten auf `GENERATED ALWAYS AS … STORED`.

UE1-v2 ist gleichzeitig **die Referenz-Implementation** für die spätere schema-getriebene Form-Generierung in UE3+UE5: die Felder, Pflicht-Regeln und Belegpositionen, die hier hardcoded für APL2 leben, wandern in UE3 in `apl2.ahp_schemas` und werden in UE5 dynamisch geladen.

## 2. UI/UX — Stepper-Layout

### 2.1 Stepper-Komponente (Header der App)

```
┌─────────────────────────────────────────────────────────────────┐
│ ●─────●─────●─────○─────○─────○                                 │
│ 1     2     3     4     5     6                                 │
│Träger Kontakt Wochen-Kosten Flyer Über-                         │
│  &     &     plan   &      hoch- sicht                          │
│Einricht Bank        Belege laden                                │
│  ✓     ✓     ●     ○      ○     ○                              │
│                                                                 │
│ Step 3 von 6 — ungefähr 5 Min bis fertig                        │
└─────────────────────────────────────────────────────────────────┘
```

- Anklickbare Step-Bubbles (Sprung in jede Section, auch zurück)
- Jeder Step hat einen visuellen Status: `○` leer, `●` aktiv, `✓` abgeschlossen+valide
- „Weiter"-Button am unteren Step-Rand: disabled bis alle Pflichtfelder im Step gefüllt + valide
- „Zurück"-Button frei navigierbar (außer auf Step 1)
- Mobile: Stepper kollabiert auf horizontale Scroll-Liste, Step-Titel bleibt sichtbar

### 2.2 Pro-Step-Aufbau

**Step 1 — Träger & Einrichtung**

| Feld | Pflicht? | Validation |
|---|---|---|
| Haushaltsjahr | ✅ | Default = aktuelles Jahr · Integer 2020–2030 |
| Name der Einrichtung | ✅ | min 2 Zeichen |
| Träger | ✅ | min 2 Zeichen |
| Straße | ✅ | — |
| Hausnummer | ✅ | — |
| PLZ | ✅ | 5 Ziffern · Warnung wenn nicht 970xx (Würzburg-Region) |
| Ort | ✅ | — |

**Step 2 — Kontakt & Bank**

| Feld | Pflicht? | Validation |
|---|---|---|
| Ansprechpartner/in | ✅ | — |
| Telefon/Handy | ✅ | min 6 Zeichen, Format frei |
| E-Mail | ✅ | RFC-5322 Format-Check, grüner Haken bei valide |
| Bankverbindung (Bankname) | ✅ | — |
| IBAN | ✅ | Live IBAN-Format-Check (Länder-Prefix + Länge) + Checksumme |
| BIC | bedingt | erscheint nur wenn IBAN nicht `DE…` |

**Step 3 — Wochenplan (Anlage 1 aus dem PDF)**

```
┌──────────────────────────────────────────────────────┐
│ Wochentag    Öffnungszeit         Angebot            │
│ Montag       [10:00–16:00]        [Begegnung, Kaffee]│
│ Dienstag     [10:00–16:00]        [Spiele-Nachmittag]│
│ Mittwoch     [—                 ] [—               ] │
│ Donnerstag   [10:00–16:00]        [Gymnastik]        │
│ Freitag      [10:00–14:00]        [Mittagstisch]     │
│ Samstag      [—                 ] [—               ] │
│ Sonntag      [—                 ] [—               ] │
└──────────────────────────────────────────────────────┘
```

- 7 feste Zeilen für die Wochentage
- Pflicht: **mind. 1 Wochentag mit Öffnungszeit + Angebot** (sonst ist es keine Tagesstätte)
- Leere Zeilen = geschlossen, kein Fehler
- Öffnungszeit ist Freitext (Format wie „10:00–16:00" oder „14:00–18:30"), keine Picker-Tyrannei

**Step 4 — Kosten & Belege**

Reihenfolge: Räume-Frage → bedingte Miete → Betriebskosten-Repeater → Personalkosten-Repeater → Summe.

```
┌─────────────────────────────────────────────────────────────────┐
│ Räume vorhanden?           ⦿ ja   ◯ nein                       │
│ Räume unentgeltlich?       ◯ ja   ⦿ nein                       │
│                                                                 │
│ ↓ erscheint nur wenn Räume nicht unentgeltlich:                 │
│ Mietkosten                                                      │
│ [+ Mietposition]                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Mietvertrag Hauptstandort  | 1.200,00 €/Monat |          │  │
│  │   [⬆ mietvertrag.pdf ✓]                            [×]   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            Summe Miete:        14.400,00 €/Jahr │
│                                                                 │
│ Betriebskosten Vorjahr                                          │
│ [+ Position hinzufügen]                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Strom Q1            | 220,00 € | [⬆ strom-q1.pdf ✓] [×]  │  │
│  │ Strom Q2            | 230,00 € | [⬆ strom-q2.pdf ✓] [×]  │  │
│  │ Reinigung Jahres    | 1.200,00 €| [⬆ reinig.pdf ✓]  [×]  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            Summe Betriebskosten:  1.650,00 €    │
│                                                                 │
│ Personalkosten Vorjahr                                          │
│ [+ Position hinzufügen]                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Honorar Übungsleiter | 3.500,00 € | [⬆ honorar.pdf ✓] [×] │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            Summe Personalkosten:  3.500,00 €    │
│                                                                 │
│ ═══════════════════════════════════════════════════════════════ │
│   Gesamt geltend gemachte Kosten:               19.550,00 €     │
└─────────────────────────────────────────────────────────────────┘
```

- Inline-Upload-Button pro Position (Roberts korrigierter Vorschlag)
- Betrag: deutsche Eingabe („1.234,56" oder „1234,56" — beide akzeptiert), Anzeige immer formatiert
- Live-Summe je Belegtyp + Grand-Total ganz unten
- Pflicht: wenn Räume nicht unentgeltlich → ≥1 Mietposition mit Mietvertrag-Upload Pflicht
- Pflicht: Betriebskosten-Belegtyp und Personalkosten-Belegtyp dürfen leer sein (= 0 €), aber wenn der Träger einen Zuschuss will, sind reale Zahlen sinnvoll. **Kein Hard-Block, aber Hinweis** „Sind Sie sicher, dass keine Kosten anfallen? Antrag macht ohne Kostennachweis kaum Sinn."

**Step 5 — Programm-Flyer**

| Feld | Pflicht? |
|---|---|
| Programm der Tagesstätte (PDF/Bild-Upload) | ✅ |

Single-File-Upload, max 10 MB, PDF/JPG/PNG. Drag-and-Drop-Zone groß und einladend.

**Step 6 — Übersicht & Senden**

```
┌─────────────────────────────────────────────────────────────────┐
│ Ihre Eingaben — bitte prüfen Sie vor dem Absenden               │
│                                                                 │
│ Einrichtung & Träger                            [Bearbeiten →]  │
│   Begegnungszentrum St. Anna · Caritas · Haushaltsjahr 2026     │
│   Heinestraße 17 · 97070 Würzburg                               │
│                                                                 │
│ Kontakt & Bank                                  [Bearbeiten →]  │
│   Maria Schmidt · 0931 …                                        │
│   maria.schmidt@caritas-wue.de                                  │
│   Sparkasse Würzburg · DE89 3704 0044 0532 0130 00              │
│                                                                 │
│ Öffnungszeiten                                  [Bearbeiten →]  │
│   Mo 10-16 · Di 10-16 · Do 10-16 · Fr 10-14                     │
│                                                                 │
│ Kosten                                          [Bearbeiten →]  │
│   Miete:           14.400,00 € (1 Position, 1 Beleg)            │
│   Betriebskosten:   1.650,00 € (3 Positionen, 3 Belege)         │
│   Personalkosten:   3.500,00 € (1 Position, 1 Beleg)            │
│   ───────────────────────────────                              │
│   Gesamt:          19.550,00 €                                  │
│                                                                 │
│ Anlagen                                         [Bearbeiten →]  │
│   programm-2026.pdf (87 KB)                                     │
│                                                                 │
│ Datum: Würzburg, 19.05.2026                                     │
│                                                                 │
│ ☐ Ich bestätige, dass die Angaben wahrheitsgemäß sind.          │
│                                                                 │
│           [Druckansicht]              [Antrag absenden →]       │
└─────────────────────────────────────────────────────────────────┘
```

- Alle Daten lesbar zusammengefasst
- „Bearbeiten →" springt zum jeweiligen Step zurück
- Pflicht-Checkbox „wahrheitsgemäß" (entspricht der Unterschrift im PDF)
- Submit ist disabled bis Checkbox ✅
- Druckansicht erzeugt PDF-artige Single-Page-Übersicht (für die Akte des Trägers)

## 3. Datenmodell (Migrationen 015+)

### Migration 015 — Belegposition & Wochenplan

```sql
create table apl2.belegposition (
  id              uuid primary key default gen_random_uuid(),
  antrag_id       uuid not null references apl2.antraege(id) on delete cascade,
  belegtyp        text not null check (belegtyp in ('betriebskosten','personalkosten','miete')),
  bezeichnung     text not null,
  betrag_euro     numeric(12,2) not null check (betrag_euro >= 0),
  anlage_id       uuid references apl2.anlagen(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index idx_belegposition_antrag on apl2.belegposition(antrag_id);
create index idx_belegposition_belegtyp on apl2.belegposition(antrag_id, belegtyp);

create table apl2.oeffnungszeit (
  antrag_id       uuid not null references apl2.antraege(id) on delete cascade,
  wochentag       text not null check (wochentag in ('mo','di','mi','do','fr','sa','so')),
  oeffnungszeit   text,
  angebot         text,
  primary key (antrag_id, wochentag)
);

-- RLS-Policies analog zu anlagen/antraege
alter table apl2.belegposition enable row level security;
create policy "sachbearbeiter_select_belegposition" on apl2.belegposition
  for select to authenticated using (apl2.current_user_role() is not null);

alter table apl2.oeffnungszeit enable row level security;
create policy "sachbearbeiter_select_oeffnungszeit" on apl2.oeffnungszeit
  for select to authenticated using (apl2.current_user_role() is not null);

-- Grants für service_role (submit-antrag Edge Function)
grant insert, select on apl2.belegposition, apl2.oeffnungszeit to service_role;
grant select on apl2.belegposition, apl2.oeffnungszeit to authenticated;
```

### Migration 016 — Generated-Columns für Summen

Die bestehenden Spalten `apl2.antraege.betriebskosten_vorjahr_euro` und `personalkosten_vorjahr_euro` werden zu computed columns auf Basis der Belegpositionen:

```sql
-- Schritt 1: bestehende Werte ablegen
alter table apl2.antraege
  add column betriebskosten_vorjahr_euro_legacy numeric(12,2);
update apl2.antraege
  set betriebskosten_vorjahr_euro_legacy = betriebskosten_vorjahr_euro;
-- analog personalkosten

alter table apl2.antraege drop column betriebskosten_vorjahr_euro;
alter table apl2.antraege drop column personalkosten_vorjahr_euro;
alter table apl2.antraege drop column monatliche_miete_euro;

-- Schritt 2: Generated columns ankoppeln
-- (Postgres erlaubt subqueries in generated columns nicht direkt,
--  daher als VIEW + Trigger-basierte Aggregation oder als Function)

create or replace view apl2.antrag_mit_summen as
select
  a.*,
  coalesce((select sum(betrag_euro) from apl2.belegposition
            where antrag_id = a.id and belegtyp = 'betriebskosten'), 0) as betriebskosten_vorjahr_euro,
  coalesce((select sum(betrag_euro) from apl2.belegposition
            where antrag_id = a.id and belegtyp = 'personalkosten'), 0) as personalkosten_vorjahr_euro,
  coalesce((select sum(betrag_euro) from apl2.belegposition
            where antrag_id = a.id and belegtyp = 'miete'), 0) as miete_jahr_euro
from apl2.antraege a;

grant select on apl2.antrag_mit_summen to authenticated, anon, service_role;
```

UE2 (Sachbearbeiter-App) wird angepasst, die View zu lesen statt der Tabelle. UE1 v2 schreibt nur in `belegposition`, Summen entstehen automatisch.

Alt-Bestandsdaten: Migration kopiert die Legacy-Summen jeweils in eine einzelne `belegposition`-Zeile mit `bezeichnung = 'Legacy-Summe aus PDF-Import'` und `anlage_id = NULL`, damit View und neue Logik konsistent sind.

### Migration 017 — Anlagen-Hash-Dedupe

```sql
alter table apl2.anlagen add column file_hash text;
create index idx_anlagen_hash on apl2.anlagen(file_hash);

-- Edge Function (submit-antrag-v2) berechnet sha256 vor dem Upload,
-- prüft ob hash existiert, returnt vorhandene anlage_id falls ja.
```

## 4. Frontend-Architektur

```
ue1/webformular/
├─ src/
│  ├─ main.ts                  # Entry, Mount auf #app
│  ├─ state.ts                 # zentrales Form-State-Objekt (Reactive Signals)
│  ├─ stepper.ts               # Stepper-Component (Header, Navigation, Step-Status)
│  ├─ steps/
│  │  ├─ step1-traeger.ts
│  │  ├─ step2-kontakt-bank.ts
│  │  ├─ step3-wochenplan.ts
│  │  ├─ step4-kosten-belege.ts
│  │  ├─ step5-flyer.ts
│  │  └─ step6-uebersicht.ts
│  ├─ components/
│  │  ├─ belegposition-row.ts  # Repeater-Zeile mit Inline-Upload
│  │  ├─ wochenplan-table.ts
│  │  ├─ field-input.ts        # Wrapper mit Label, Validation-State, Sterne
│  │  ├─ progress-bar.ts
│  │  └─ summary-section.ts    # für Step 6
│  ├─ validation.ts            # IBAN, E-Mail, PLZ, Wochentag-Format
│  ├─ format.ts                # Euro, Adresse (bestehend)
│  ├─ submit.ts                # Edge-Function-Call (erweitert um neue Felder)
│  ├─ i18n.ts                  # bestehend, neue Keys für Stepper
│  ├─ translations.ts          # erweitert um Stepper-Labels, „Position hinzufügen" etc.
│  └─ styles.css               # Tailwind v4 (neuer als heute UE1 v1 = Vanilla CSS)
├─ tests/
│  ├─ validation.test.ts
│  ├─ state.test.ts            # Step-Status-Berechnung
│  ├─ format.test.ts           # bestehend
│  └─ i18n.test.ts             # bestehend
└─ ...
```

**Tech-Stack-Update gegenüber UE1 v1:** Wir wechseln von Vanilla TS auf Tailwind v4 für Konsistenz mit UE2 und um die UI in vernünftiger Zeit zu polieren. **Kein** Vue/React/Svelte — bleibt deterministisch mit Vanilla TS + Reactive Signals (simple `Proxy`-basierte Implementation), weil Vite + GitHub-Pages-Build dann unverändert läuft.

**State-Management:**

```typescript
// state.ts
import { signal } from "./signals";

export const formState = signal<FormState>({
  step: 1,
  traeger: { name: "", traeger: "", strasse: "", hausnummer: "", plz: "", ort: "", haushaltsjahr: new Date().getFullYear() },
  kontakt: { ansprechpartner: "", telefon: "", email: "", bankverbindung: "", iban: "", bic: null },
  wochenplan: [/* 7 entries: { tag, zeit, angebot } */],
  raeume: { vorhanden: null, unentgeltlich: null },
  belegpositionen: [], // {id, belegtyp, bezeichnung, betrag_euro, anlage_file?}
  flyer: null,         // File
  bestaetigt: false,
  language: detectBrowserLanguage(),
});

export function isStepComplete(step: number, state: FormState): boolean { /* ... */ }
```

Step-Status wird live aus `formState` berechnet. Stepper rendert die Bubble-Status reaktiv.

## 5. Bedingte Logik (klare Regeln)

| Bedingung | Zeigt | Versteckt |
|---|---|---|
| IBAN beginnt nicht mit `DE` | BIC-Feld | — |
| `raeume.unentgeltlich === 'ja'` | — | Miete-Section in Step 4 |
| `raeume.unentgeltlich === 'nein'` | Miete-Section + Pflicht-Mietposition + Mietvertrag-Upload | — |
| 0 Belegpositionen für Betriebskosten | Hinweis „kein Kostennachweis = kein Zuschuss" | Keinen Hard-Block |
| Wochenplan hat 0 belegte Tage | „Bitte mindestens 1 Öffnungstag" Hard-Block | — |
| Step 6 Checkbox unchecked | Submit disabled | — |

## 6. Submit-Flow

Die Edge Function `submit-antrag` muss erweitert werden um:
- `belegpositionen[]` als JSON-Array entgegen nehmen
- pro Position ggf. eigene Datei im FormData (Roberts „1 Datei pro Position"-Default, Backend macht Hash-Dedupe)
- `oeffnungszeiten[]` als JSON-Array
- Bestehende `betriebskosten_vorjahr_euro`-Feldzugriffe werden durch `apl2.antrag_mit_summen`-View ersetzt

## 7. Testing

- **Unit (Vitest):**
  - `validation.test.ts`: IBAN (DE valide, AT valide, ungültiges Format), E-Mail (RFC), PLZ
  - `state.test.ts`: `isStepComplete()` für jeden Step, bedingte Pflicht-Checks
  - `format.test.ts`: bestehend, evtl. Parser-Tests („1.234,56" → 1234.56)
- **Component (DOM-Testing via jsdom):**
  - Stepper navigiert nur zu valide Steps, springt korrekt
  - Belegposition-Row: Upload triggert Hash-Berechnung, Anzeige Update
- **E2E (manueller Smoke):**
  - Robert füllt komplettes Formular aus mit Test-PDFs, prüft Inbox in UE2

## 8. Migrations- und Deployment-Strategie

1. **Backup** vor Migration 016 (destructive: drop columns) — `pg_dumpall`
2. Migration 015 (additive) — safe
3. Migration 016 (destructive auf antraege) — **breaking change für UE2!** UE2-`useAntraege`-Hook + Detail-Page müssen erst auf `apl2.antrag_mit_summen`-View umgestellt werden, sonst gibt's TypeScript-Fehler
4. Migration 017 (additive) — safe
5. UE2-App neu deployen (View-basiertes Lesen, Belegpositionen+Wochenplan in Detail-View anzeigen)
6. UE1-v2-Frontend bauen + GitHub-Pages-Deploy
7. End-to-End-Smoke mit Robert

## 9. Akzeptanzkriterien

- [ ] Stepper navigiert vorwärts/rückwärts, Status-Bubbles updaten live
- [ ] „Weiter"-Button erst aktiv, wenn alle Pflicht im Step gefüllt + valide
- [ ] IBAN, E-Mail, PLZ haben Live-Validation mit grünem Haken
- [ ] Belegpositionen-Repeater mit Plus/Trash funktioniert; Live-Summen rechnen korrekt
- [ ] Wochenplan: mind. 1 Tag belegt = Pflicht
- [ ] Bedingte Felder erscheinen/verschwinden (BIC, Miete) sauber
- [ ] Pre-Submit-Übersicht (Step 6) zeigt alle Daten korrekt, Edit-Sprung funktioniert
- [ ] DSGVO-Checkbox blockt Submit bis ✅
- [ ] Submit speichert Antrag + Belegpositionen + Wochenplan + Anlagen korrekt in DB; Hash-Dedupe greift
- [ ] UE2-Sachbearbeiter-App zeigt neuen Antrag mit allen Belegpositionen und Wochenplan
- [ ] Alle 4 Sprachen (DE/IT/TR/ES) komplett, Vollständigkeits-Test grün
- [ ] Mobile: Stepper kollabiert, Repeater bedienbar mit Touch

## 10. Nicht im Scope

- KI-Belege-Extraktion (das ist UE4)
- Form-Generierung aus Schema (das ist UE5)
- Anwendung auf andere AHP-Pläne (UE1-v2 bleibt APL2-hardcoded)
- Eingangsbestätigungs-Mail-Anpassung (kommt automatisch über UE2-bestehende n8n-Pipeline)
- Bürger-seitiges Status-Tracking nach Submit

## 11. Offene Fragen

1. **Hash-Dedupe**: berechnen wir SHA-256 client-side (Browser SubtleCrypto) vor dem Upload, um Bandbreite zu sparen, oder server-side in der Edge Function? — Empfehlung: client-side, weil Browser-API stabil und Storage-Kosten realistisch.
2. **Druckansicht**: Server-side (PDF-Generierung via Puppeteer-Lambda?) oder Client-side (`window.print()` mit Custom-CSS für Print-Media)? — Empfehlung: Client-side `window.print()`, weil minimaler Aufwand und für die Lehre völlig ausreichend.
3. **Generated-Columns vs. View**: View ist robuster (kein Postgres-Constraint, dass generated columns aus eigenen Tabellen lesen müssen). Wir gehen mit View, aber dann muss UE2 angepasst werden, was zur Migration-Sequence (s. §8) führt.
