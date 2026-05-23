# UE3 — Zweitprüfung, Bescheide-Sortierung, KI-Diff, Risiko-Score · Design

> Brainstorming-Ergebnis vom 23.05.2026. Roberts Anforderungen aus der UE3-Sitzung
> (Vier-Augen-Prinzip, abhakbare Checkliste, gruppierbare Bescheide-Liste) plus
> die in der Diskussion identifizierten KI-zentrierten Zusatz-Features.

## Ziel

Die UE3-Sachbearbeitungs-GUI um vier Komplexe ergänzen:

1. **Bescheide-Liste**: Gruppierung + Sortierung der Bescheide pro Antrag.
2. **Zweitprüfung (Vier-Augen)**: Erst- und Zweitprüfer, jeweils Mensch oder KI,
   mit positionsweisen Abhakungen und Disagreement-Highlight.
3. **Vergleich Vorjahres-Antrag**: KI-gestützter Diff für Anträge desselben
   Trägers über Haushaltsjahre hinweg.
4. **Anomalie-/Risiko-Score**: KI priorisiert auffällige Anträge in der Inbox.

## Architektur

### Bestehender Stand (relevant)
- `apl2.antraege` — der Antrag mit Status (`eingegangen|in_pruefung|rueckfrage|bewilligt|abgelehnt`)
- `apl2.pruefprotokoll` — eine Zeile pro KI-Lauf, `ergebnis_jsonb` enthält
  Befunde + Empfehlung
- `apl2.bescheide` — Verwaltungsbescheid mit PDF-Render
- `apl2.antrag_history` — Status-Wechsel-Log via Trigger

Neue Komplexe hängen sich daran an, ohne bestehende Tabellen zu brechen.

### Neue Datenbank-Tabelle: `apl2.pruefungen`

Ein Eintrag = eine Prüfung eines Antrags durch eine Instanz (Mensch oder KI).
Pro Antrag gibt es 1 Erstprüfung und (bei Bedarf) 1 Zweitprüfung.

```sql
create type apl2.pruefer_rolle as enum ('erstpruefung', 'zweitpruefung');
create type apl2.pruefer_typ   as enum ('mensch', 'ki');
create type apl2.pruefer_modus as enum ('standard', 'adversariell');
create type apl2.entscheidungsvorschlag as enum ('bewilligen', 'ablehnen', 'rueckfragen');

create table apl2.pruefungen (
  id uuid primary key default gen_random_uuid(),
  antrag_id uuid not null references apl2.antraege(id) on delete cascade,
  rolle apl2.pruefer_rolle not null,
  pruefer_typ apl2.pruefer_typ not null,
  pruefer_id text not null,                            -- email (Mensch) | Modell-ID (KI)
  pruefer_modus apl2.pruefer_modus,                    -- nur bei pruefer_typ='ki'
  pruefprotokoll_id uuid references apl2.pruefprotokoll(id),
  abhakungen_jsonb jsonb not null default '{}'::jsonb, -- siehe Schema unten
  gesamt_kommentar text,
  entscheidungs_vorschlag apl2.entscheidungsvorschlag,
  abgeschlossen_am timestamptz,                        -- null = noch offen
  angelegt_am timestamptz not null default now(),
  unique (antrag_id, rolle)                            -- max 1 Erst- + 1 Zweitprüfung
);
```

**Schema `abhakungen_jsonb`** (gilt für beide Rollen identisch):
```json
{
  "befunde": {
    "<befund_index_or_hash>": {
      "status": "bestaetigt|widerspruch|unklar",
      "kommentar": "optional Free-text"
    }
  },
  "abschnitte": {
    "traeger":       { "status": "geprueft|offen", "kommentar": "…" },
    "raeumlichkeiten": { "status": "…", "kommentar": "…" },
    "foerderbereich":  { "status": "…", "kommentar": "…" },
    "finanzen":        { "status": "…", "kommentar": "…" }
  }
}
```

### Workflow-Status-Erweiterung

`apl2.antraege.status` ist `text` und wird via `apl2.workflow_transition`-
Tabelle + Trigger `validate_status_transition` validiert. Neue Werte werden
einfach durch INSERTs in `workflow_transition` freigeschaltet — kein
Schema-Change am Enum-Typ.

Neue Status-Werte:
- `zweitpruefung_offen` — Zweitprüfung ist gefordert und noch nicht abgeschlossen.
  Bescheid-Erstellung blockiert.
- `zweitpruefung_dissens` — Erst- und Zweitprüfer haben unterschiedliche
  Vorschläge. Sachbearbeiter muss manuell entscheiden.

Status `erstpruefung_fertig` führen wir **nicht** ein — die Erstprüfung-
Abgeschlossen-Information lebt in `apl2.pruefungen.abgeschlossen_am`.
Stattdessen: nach Erstprüfungs-Abschluss bleibt der Status `in_pruefung`,
sofern keine Zweitprüfung getriggert wurde, ansonsten springt er auf
`zweitpruefung_offen`.

Neue Übergänge (Migration 038):
```sql
insert into apl2.workflow_transition (von_status, nach_status) values
  ('in_pruefung',         'zweitpruefung_offen'),
  ('zweitpruefung_offen', 'zweitpruefung_dissens'),
  ('zweitpruefung_offen', 'bewilligt'),
  ('zweitpruefung_offen', 'abgelehnt'),
  ('zweitpruefung_offen', 'rueckfrage'),
  ('zweitpruefung_dissens','bewilligt'),
  ('zweitpruefung_dissens','abgelehnt'),
  ('zweitpruefung_dissens','rueckfrage'),
  ('zweitpruefung_dissens','in_pruefung');  -- zurück zur Erstprüfung erzwingen
```

Bescheid-Erstellung wird im Backend per Check geblockt, wenn der Antrags-
Status `zweitpruefung_*` ist.

### Trigger-Logik: wann ist Zweitprüfung Pflicht?

```python
def zweitpruefung_erforderlich(antrag, entscheidungs_vorschlag, bewilligte_summe) -> bool:
    if entscheidungs_vorschlag == "ablehnen":
        return True
    if entscheidungs_vorschlag == "bewilligen" and (bewilligte_summe or 0) > 5000:
        return True
    return False
```

Wird beim Abschließen der Erstprüfung evaluiert. Zusätzlich UI-Knopf
"Zweitprüfung anfordern" für die Fälle, die nicht automatisch erfasst sind.

---

## Feature 1: Bescheide-Liste — Gruppierung + Sortierung

**Wo:** `AntragDetail.tsx`, der "Bescheide"-Block rechts unten.

**Funktionalität:**
- Toggle "Gruppieren nach": *(keine)* · Entscheidung · Bearbeitende:r · Monat
- Toggle "Sortieren nach": Datum · Bewilligte Summe · Entscheidung
- Default: Gruppierung "Entscheidung", Sortierung "Datum DESC"

**Backend:** Keine Änderung. Reine Frontend-Logik in `useBescheide.ts` /
`AntragDetail.tsx`. State im Component, keine URL-Persistenz nötig (Liste
hat selten >20 Einträge).

**UI-Pattern:**
```
[ Gruppieren ▼: Entscheidung ]  [ Sortieren ▼: Datum ↓ ]

▼ Bewilligt (3)                                              Summe: 24.500 €
   ☐ Bewilligt    23.05.2026, 00:13   8.500 €    [PDF] [DOCX]  [🗑]
   …
▼ Abgelehnt (4)
   …
```

---

## Feature 2: Zweitprüfung — Backend

### REST-Endpoints (pruefung-service)

**`POST /api/pruefung`** — legt eine Prüfung an oder schließt sie ab.
```json
{
  "antrag_id": "uuid",
  "rolle": "erstpruefung|zweitpruefung",
  "pruefer_typ": "mensch|ki",
  "pruefer_id": "email|claude-sonnet-4-5",
  "pruefer_modus": "standard|adversariell|null",
  "abhakungen_jsonb": { … },
  "gesamt_kommentar": "…",
  "entscheidungs_vorschlag": "bewilligen|ablehnen|rueckfragen",
  "abschliessen": true
}
```
Bei `abschliessen=true` wird `abgeschlossen_am` gesetzt und der Antrags-
Status entsprechend fortgeschaltet (Trigger-Logik s.o.).

**`POST /api/pruefung/ki-zweitpruefung`** — Triggert KI-Zweitprüfung
adversariell auf Basis einer vorhandenen Erstprüfung.
```json
{ "antrag_id": "uuid" }
```
Service:
1. Lädt Erstprüfungs-Befunde aus `pruefprotokoll`.
2. Ruft Claude mit adversariellem Prompt auf (siehe Feature 4).
3. Schreibt neues `pruefprotokoll`-Row mit `modus='adversariell'`.
4. Legt `pruefungen`-Row mit `rolle='zweitpruefung'`, `pruefer_typ='ki'`,
   `pruefer_modus='adversariell'` an.
5. Berechnet Disagreement (siehe Feature 3) und persistiert es in
   `abhakungen_jsonb.dissens`.

**`GET /api/pruefung?antrag_id={id}`** — listet beide Prüfungen eines
Antrags (für UI).

### Migration `037_pruefungen.sql`
- Enum-Typen + Tabelle anlegen (s.o.)
- RLS: nur authentifizierte User dürfen lesen/schreiben (Demo-Setup wie
  bei den anderen apl2-Tabellen)
- Index auf `(antrag_id, rolle)` (durch UNIQUE-Constraint implizit)

### Migration `038_status_erweiterung.sql`
- Status-Spalte um `erstpruefung_fertig`, `zweitpruefung_offen`,
  `zweitpruefung_dissens` erweitern
- Workflow-Transitions in `apl2.workflow_transitions` ergänzen

---

## Feature 3: Zweitprüfung — UI

### Neue Komponente `ZweitpruefungsCard.tsx`

Erscheint in `AntragDetail.tsx`, sobald `status ∈ {erstpruefung_fertig,
zweitpruefung_offen, zweitpruefung_dissens}`.

**Sektionen:**
1. **Header**: "Zweitprüfung" + Status-Badge + Pflichtgrund (z.B.
   "Pflicht weil Ablehnung")
2. **Prüfer-Auswahl** (wenn noch nicht angefangen):
   - Radio: Mensch / KI
   - Wenn KI: Modus standard|adversariell + Button "KI-Zweitprüfung starten"
   - Wenn Mensch: aktueller User wird automatisch eingetragen
3. **Befunde-Checkliste** (Befunde der Erstprüfung):
   - Pro Befund eine Zeile mit:
     - Befund-Beschreibung + AHP-Referenz
     - 3 Buttons: ✓ bestätigt · ✗ widerspreche · ? unklar
     - Optionales Kommentarfeld
   - **Disagreement-Highlight** (nur bei KI-Zweitprüfung): wenn Erst- und
     Zweit-KI unterschiedliche Bewertungen liefern → Befund-Zeile bekommt
     gelben Border-Left + Tooltip "Erst-KI: Verstoß / Zweit-KI: Hinweis"
4. **Abschnitts-Checkliste** (für Themen, die KI nicht angesprochen hat):
   - Träger / Räumlichkeiten / Förderbereich / Finanzen — jeweils ✓ + Kommentar
5. **Gesamt-Kommentar** (Free-text)
6. **Entscheidungs-Vorschlag** (Radio: bewilligen / ablehnen / rueckfragen)
7. **Button "Zweitprüfung abschließen"** — disabled, solange Pflichtfelder fehlen

### Disagreement-Berechnung (KI vs KI)
```python
def berechne_dissens(erst_befunde, zweit_befunde) -> list[dict]:
    """Matched Befunde via (paragraph_ref, beschreibung-Ähnlichkeit) und
    vergleicht schwere. Liefert Liste der Stellen mit ≠ Bewertung."""
```

### Reverse-Workflow
Wenn Zweitprüfer widerspricht und Erstprüfer ein anderes Ergebnis hatte:
- Sachbearbeiter sieht "Zweitprüfung im Dissens" + Button "Anders
  entscheiden als Erstprüfung" (sonst Default = Erstprüfer-Vorschlag).

---

## Feature 4: KI als Zweitprüfer (Adversariell)

### Neuer Modul: `pruefung/layer_b_adversariell.py`

System-Prompt:
```
Du bist Zweitprüfer:in im Sozialreferat der Stadt Würzburg.
Ein Kollege (Erst-KI) hat bereits eine erste Prüfung des Förderantrags
durchgeführt. Deine Aufgabe ist es, diese Prüfung KRITISCH zu hinterfragen:

1. Wo könnte die Erstprüfung etwas ÜBERSEHEN haben?
2. Wo wurde etwas möglicherweise FALSCH bewertet?
3. Welche Gründe gegen Bewilligung wurden NICHT betrachtet?
4. Welche Gründe gegen Ablehnung wurden NICHT betrachtet?

Du bist nicht der Anwalt des Antragstellers und auch nicht der
Anwalt der Behörde — du bist die kritische zweite Instanz.

Antworte mit derselben Befund-Struktur wie die Erstprüfung
(beschreibung, schwere, paragraph_ref, konfidenz).
Wenn du der Erstprüfung in einem Punkt zustimmst, sagst du das
explizit ("Befund X bestätigt"). Wenn du widersprichst, sagst du
mit welcher Begründung ("Befund Y zu streng, weil …").
```

### Implementation
1. Lade Erstprüfungs-Befunde + Antrag + Doctree.
2. Baue Prompt mit allen Befunden als JSON.
3. Claude-Call mit `submit_zweitpruefung`-Tool, das eine strukturierte
   Antwort einfordert: `bestaetigte_befunde[]`, `widersprochene_befunde[]`,
   `neue_befunde[]`, `gesamt_vorschlag`.
4. Persistiere als neues `pruefprotokoll` mit
   `ergebnis_jsonb.modus="adversariell"`.

---

## Feature 5: Vergleich Vorjahres-Antrag

### Neuer Endpoint: `GET /api/antrag/{id}/vergleich-vorjahr`

Backend:
1. Findet Vorjahres-Antrag desselben Trägers (z.B. via
   `traeger`-String-Match + `haushaltsjahr - 1`).
2. Diffs:
   - Numerisch: geforderte_foerdersumme_euro, anzahl_teilnehmer,
     stadtbewohner_anteil, geleistete_stunden_jahr → mit %-Veränderung
   - Strukturell: foerderbereich-Wechsel, neue/verlorene Räume, andere IBAN
3. Klassifizierung jeder Änderung: `unauffaellig|auffaellig|kritisch`
   (heuristisch: > 30% YoY = auffällig, > 100% = kritisch, IBAN-Wechsel = kritisch)

### UI: neuer Collapsible-Block in `AntragDetail.tsx` oberhalb der §-Sektionen

```
▼ Vergleich Vorjahres-Antrag (APL2-2025-007)        2 kritisch · 3 auffällig

   Geforderte Förderung     7.500 € → 12.000 € (+60 %)         🟡 auffällig
   Förderbereich            Begegnungszentrum → Bildungsträger 🟡 auffällig
   IBAN                     DE12… → DE34…                       🔴 kritisch
   …
```

Kein KI-Aufruf in v1 — heuristisch reicht. KI-Diff-Erklärung ist später-
Iteration (würde "Warum ist die Änderung plausibel/auffällig?" generieren).

---

## Feature 6: Anomalie-/Risiko-Score

### Neuer Endpoint: `GET /api/antrag/{id}/risiko-score`

Heuristische Score-Berechnung (0–100):
- +30 wenn YoY-Summen-Anstieg > 50%
- +20 wenn neuer Träger (keine Vorjahres-Anträge)
- +15 wenn IBAN-Inhaber ≠ Trägername
- +10 wenn Stadtbewohner-Anteil < 50%
- +25 wenn Förderbereich-Wechsel
- −10 wenn Vorjahres-Antrag bewilligt wurde

Klassifizierung:
- 0–25: 🟢 unauffällig
- 26–50: 🟡 prüfenswert
- 51+: 🔴 erhöhtes Risiko

### UI: neue Spalte in `Inbox.tsx`

```
| Aktenz. | Träger | Förderbereich | Summe | Status | Risiko |
| APL2-…  | …      | …             | …     | …      | 🟢 12  |
| APL2-…  | …      | …             | …     | …      | 🔴 68  |
```

Sortierbar nach Risiko-Score (DESC = auffälligste zuerst). Default-
Sortierung bleibt "Eingangsdatum DESC", aber Sachbearbeiter kann per Klick
auf die Risiko-Spalte umstellen.

### Persistenz
Score wird **nicht** in der Antragsspalte persistiert (würde bei
Vorjahres-Daten-Updates stale werden), sondern auf Demand berechnet und
clientseitig gecacht (TanStack Query oder einfacher `useMemo`).

Optional: Edge-Function `risiko_score_view` als Postgres-View über
`antraege` + Vorjahres-JOIN — performanter für die Inbox-Liste.

---

## Out of Scope

Bewusst nicht in diesem Inkrement:
- **Notifications/Email** an Zweitprüfer (wäre Voraussetzung für echten
  Workflow, aber für Demo reicht UI-Refresh)
- **Vorgangs-ZIP-Export** (Akten-Bundle)
- **Reviewer-Workload-Dashboard** (statt dessen kommt es als UE5-Modul)
- **Doctree-Diff** bei AHP-Update (separate Spec, eng mit knowledge_extract verzahnt)
- **Antragsteller-Self-Service-Portal** (UE4-Thema)
- **Bulk-Aktionen** (Mehrfach-Auswahl + Sammel-Bewilligung)
- **KI-Diff-Erklärung** in Vergleich-Vorjahr (heuristisch reicht in v1)

## Test plan

Pro Feature TDD mit pytest (Backend) / vitest (Frontend, soweit Tests existieren).

**Backend** (`tests/test_pruefungen.py`):
- Trigger-Logik: Schwellwert + Ablehnung
- KI-Zweitprüfung: Mock Claude-Response, verifiziere dass adversarielles
  pruefprotokoll persistiert wird
- Dissens-Berechnung: 3 Cases (alle gleich, einer ≠, alle ≠)
- Vorjahres-Diff: 3 Cases (kein Vorjahr, +60% Summe, IBAN-Wechsel)
- Risiko-Score: jede Heuristik einzeln + Kombi

**Frontend manuell** (kein vitest-Setup für diese App):
- Erstprüfung abschließen → korrekter Folge-Status?
- Zweitprüfung-Trigger > 5.000€ greift?
- KI-Zweitprüfung erzeugt Disagreement-Highlight?
- Bescheide-Gruppierung filtert/sortiert korrekt?
- Inbox-Risiko-Sortierung funktioniert?

**Schema-Migration**: vor Anwendung lokal mit `supabase db reset`-Trockenlauf.

## Reihenfolge der Umsetzung

Plan wird gleich anschließend geschrieben; Reihenfolge nach Abhängigkeiten:

1. Migration 037 (`apl2.pruefungen`) + Migration 038 (Status-Enum)
2. Backend: `POST /api/pruefung`, `GET /api/pruefung`
3. Backend: `POST /api/pruefung/ki-zweitpruefung` + adversarieller Prompt
4. Frontend: ZweitpruefungsCard.tsx
5. Frontend: Bescheide-Liste Gruppierung+Sortierung *(parallel möglich)*
6. Backend + Frontend: Vergleich-Vorjahr
7. Backend + Frontend: Risiko-Score
