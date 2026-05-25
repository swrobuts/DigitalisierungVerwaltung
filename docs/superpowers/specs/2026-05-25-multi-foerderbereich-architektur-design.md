# Multi-Förderbereich-Architektur — Design-Spec

**Datum:** 2026-05-25
**Autor:** Robert Butscher, im Dialog mit Claude (brainstorming-Skill)
**Status:** Draft, wartet auf Robert-Review
**Ersetzt:** alle bisherigen UE0/UE1/UE3-Specs, die nur „APL 2 / Förderbereich III" abgedeckt haben

---

## 1. Vision

Die Lehr-Demo „Digitalisierung in der Verwaltung" bildet jetzt **alle vier Förderbereiche** des Würzburger Altenhilfeplans (AHP) ab, nicht mehr nur den Förderbereich III. Damit wird das Reifegradmodell auf einem realistischen, vollständigen Verwaltungsfall demonstriert: Träger können tatsächlich jeden Förderantrag stellen, der bei der Stadt Würzburg möglich ist.

Anlass: Bei einer akribischen Quellenprüfung der Würzburger Antragswebseiten wurde sichtbar, dass das bisher verwendete `antrag-apl2.pdf` eine veraltete Version war. Die heute (2025) gültigen Formulare unter <https://www.wuerzburg.de/themen/gesundheit-soziales/senioren/antragswesen/> sind in vier Förderbereiche aufgeteilt mit teils sehr unterschiedlichen Pflichtfeldern. Eine ausschließliche Konzentration auf „APL 2" wäre eine starke Verkürzung der Verwaltungswirklichkeit.

## 2. Reifegrad-Differenzierung (entscheidend für die Didaktik)

Pro Reifegradstufe wird **derselbe** Antragsprozess immer **stärker KI-unterstützt** umgesetzt. Die Multi-Förderbereich-Erweiterung erlaubt, diese Differenzierung an einem inhaltlich realistischen Fall zu zeigen.

| UE | Stufe | Bürger-Seite | Amts-Seite |
|---|---|---|---|
| **UE0** | OCR-Upload-Portal | Bürger wählt FB, lädt das passende PDF + Anlagen hoch. Claude Vision OCR im Hintergrund extrahiert Felder. Bürger landet automatisch in UE1 mit prefilled Form. | — |
| **UE1** | Webformular | Mehrsprachiges Webform mit Kategorien-Wahl (4 FBs), drei Grob-Phasen, strukturierter Eingabe inkl. Helfertabelle für FB II. **Perfektes, aus den PDFs abgeleitetes Formular ohne KI-Hilfe.** | — |
| **UE2** | Sachbearbeiter-Cockpit | — | Realtime-Inbox, Workflow, Audit-Trail. **Ohne KI.** Bleibt im Wesentlichen unverändert (nur Multi-FB-Anpassung der Spalten/Filter). |
| **UE3** | KI-Sachbearbeitung | — | Smart-Upload (KI klassifiziert PDFs nach FB+Variante+Anlagentyp), Helferliste-OCR (PDF → Tabellenzeilen), Excel-Schablonen-Import, anschließend KI-Prüfung wie bisher. |
| **UE4** | Agentisches Bürger-GUI | Natürlichsprachiger Chat, KI baut Formular dynamisch, externe API-Anbindung für Datenfelder (Vereinsregister, IBAN-Lookup, Adress-Validation), Live-Validierung beim Tippen, Audio-Input via Whisper, Multilingualität automatisch. | — |

## 3. Die vier Förderbereiche aus der AHP-Richtlinie

Alle Felder stammen aus den heruntergeladenen PDFs (`materialien/wuerzburg-2026/`):

### 3.1 Förderbereich I — Aufbau niedrigschwelliger Angebote

**Quelle:** `antrag-ahp-1-aufbau-niedrigschwellige-angebote.pdf` (2 Seiten)

Förder-Idee: Anschubfinanzierung neuer Angebote oder neuer bürgerschaftlicher Engagement-Strukturen.

**Felder (zusätzlich zum gemeinsamen Antragsteller-Block):**
- Projekt-Titel
- Voraussichtliche Laufzeit
- Umsetzung im Stadtteil (Quartier-Bezug)
- Veranschlagte Personalkosten (€)
- Veranschlagte Sachkosten (€)
- Beantragte Drittmittel (Liste, z.B. SeLA, GutePflegeFör)
- Andere Mittel (Spenden, Stiftungen)

**Anlage (Pflicht):** kurze Projektskizze (PDF)

### 3.2 Förderbereich II — Förderung bürgerschaftlichen Engagements

**Quelle:** `antrag-ahp-2-buergerschaftliches-engagement.pdf` (1 Seite) + `anlage-ahp-2-helferliste.pdf`

Förder-Idee: Pauschale Förderung von Helferkreisen, Besuchsdiensten, Nachbarschaftshilfen.

**Felder:**
- Titel des Ehrenamts-Vorhabens
- Anzahl Helfer Vorjahr
- Anzahl Gesamt-Helferstunden Vorjahr
- Checkbox: „Helfer im direkten Kontakt mit Senior:innen"

**Strukturierte Helferliste (Tabelle, 1:n in DB):**
- Name, Vorname
- Einsatzbereich
- Eintritt (Datum)
- Austritt (Datum, optional bei aktiven)
- Geleistete Stunden monatlich
- Geleistete Stunden jährlich

### 3.3 Förderbereich III — Bewährte Strukturen (mit 4 Varianten)

**Quelle:** `antrag-ahp-3-bewaehrte-strukturen.pdf` (3 Seiten)

Förder-Idee: laufende Förderung etablierter Strukturen. Antragsteller wählt **genau eine** Variante.

**Variante A — Mehrgenerationenhaus**
- Anmerkung (Freitext)
- Anlage Pflicht: Förderbestätigung Bundesprogramm + Programm-Teil „Senior:innen / Generationendialog"

**Variante B — Begegnungszentrum / Bildungsträger** (das bisherige „APL 2")
- Anzahl Veranstaltungen Vorjahr (Fokus Senior:innen)
- Anzahl Gesamt-Teilnehmer Vorjahr (Fokus Senior:innen)
- Anzahl Gesamt-Teilnehmer Vorjahr (Fokus Generationen)
- Prozentualer Anteil Stadtbewohner an gesamten TN Vorjahr
- Teilnahme an Quartierstreffen (boolean)
- Quartiere (Liste, optional)
- Name der teilnehmenden Person

**Variante C — Seniorenkreis / Seniorentreffen**
- Treffen-Schwelle (>10 / >20 / >40) — bindet direkt die Förderhöhe nach AHP 2.3.4 Staffel
- Teilnehmer:innen durchschnittlich pro Treffen
- Quartierstreffen-Teilnahme (Anzahl + Quartier + Name)

**Variante D — Quartiersmanagement**
- Hauptamtliche Person (Name + Wochenstunden + Monatsstunden)
- Bis zu 4 ehrenamtliche Personen (Name + Jahresstunden)
- Anlage: Stundenzettel für jede aufwandsentschädigte Person

### 3.4 Förderbereich IV — Struktur- und Schwerpunktförderung

**Quelle:** kein PDF (formlos)

Förder-Idee: individuelle Vorhaben außerhalb der Standardschemata.

**Strukturierte Leitfragen (statt formloser Freitext):**
- Titel des Vorhabens
- Worum geht es? (Kurzbeschreibung, Pflicht, max 1.000 Zeichen)
- Geplante Maßnahmen (Freitext, Pflicht)
- Beantragte Fördersumme (€)
- Voraussichtliche Laufzeit
- Anlagen (optional, beliebig viele)

Begründung: vollständig formlos ist für die KI-Prüfung in UE3 nicht handhabbar. Die Leitfragen schaffen einen Anker, ohne den Bürger einzuschnüren. Bezeichnung „strukturierter formloser Antrag" wird im UI klargemacht.

### 3.5 Gemeinsamer Antragsteller-Block (alle FBs)

Aus allen 4 PDFs identisch:
- Dachverband
- Einrichtung
- Ansprechpartner:in
- Straße, PLZ, Ort
- Telefon, E-Mail, Homepage
- Bankname, IBAN, BIC
- Haushaltsjahr (auto-defaulted)

---

## 4. Datenmodell

Schema-Rename: `apl2.*` → `apl.*` (alter Name impliziert nur AHP III, der neue ist neutral).

### 4.1 Zentrale Antrags-Tabelle

```sql
create table apl.antraege (
  id                   uuid primary key default gen_random_uuid(),
  antragsnummer        text unique not null,           -- generated via trigger
  haushaltsjahr        int not null,
  foerderbereich       apl.foerderbereich_enum not null,  -- 'I' | 'II' | 'III' | 'IV'

  -- Gemeinsamer Antragsteller-Block (alle FBs)
  dachverband          text,
  einrichtung          text not null,
  ansprechpartner      text not null,
  strasse              text not null,
  hausnummer           text,
  plz                  text not null,
  ort                  text not null,
  telefon              text not null,
  email                text not null,
  homepage             text,
  bankname             text not null,
  iban                 text not null,
  bic                  text not null,

  -- Workflow
  status               apl.status_enum not null default 'eingegangen',
  submitted_at         timestamptz not null default now(),
  submitted_language   text not null default 'de',
  user_agent           text,
  ip_address           inet
);
```

### 4.2 Vier FB-Detail-Tabellen (1:1 zu apl.antraege)

```sql
create table apl.fb_i_projekt (
  antrag_id              uuid primary key references apl.antraege(id) on delete cascade,
  projekt_titel          text not null,
  laufzeit               text,
  stadtteil              text,
  personalkosten_euro    numeric(10,2),
  sachkosten_euro        numeric(10,2),
  drittmittel_jsonb      jsonb,    -- [{quelle: "SeLA", betrag: 2000}, ...]
  andere_mittel_jsonb    jsonb     -- [{quelle: "Spende X", betrag: 500}, ...]
);

create table apl.fb_ii_ehrenamt (
  antrag_id                  uuid primary key references apl.antraege(id) on delete cascade,
  ehrenamt_titel             text not null,
  anzahl_helfer_vorjahr      int,
  gesamt_helferstunden_vorjahr int,
  direkter_kontakt_senioren  boolean default false
);

create table apl.fb_ii_helfer (
  id              uuid primary key default gen_random_uuid(),
  antrag_id       uuid not null references apl.antraege(id) on delete cascade,
  name            text not null,
  vorname         text not null,
  einsatzbereich  text,
  eintritt        date,
  austritt        date,
  stunden_monat   numeric(6,2),
  stunden_jahr    numeric(6,2),
  position        int not null   -- Reihenfolge in der UI
);

create table apl.fb_iii_variante (
  antrag_id        uuid primary key references apl.antraege(id) on delete cascade,
  variante         apl.fb_iii_variante_enum not null,  -- 'A' | 'B' | 'C' | 'D'

  -- Variante A — Mehrgenerationenhaus
  a_anmerkung      text,

  -- Variante B — Begegnungszentrum/Bildungsträger
  b_anzahl_veranstaltungen      int,
  b_teilnehmer_senioren         int,
  b_teilnehmer_generationen     int,
  b_stadtbewohner_anteil        numeric(4,3),
  b_quartierstreffen_teilnahme  boolean,
  b_quartiere                   text,
  b_quartier_person_name        text,

  -- Variante C — Seniorenkreis
  c_treffen_schwelle            apl.treffen_schwelle_enum,  -- 'GT_10' | 'GT_20' | 'GT_40'
  c_teilnehmer_durchschnitt     int,
  c_quartierstreffen_anzahl     int,
  c_quartier_kooperation        text,
  c_quartier_person_name        text,

  -- Variante D — Quartiersmanagement
  d_hauptamt_name               text,
  d_hauptamt_stunden_woche      numeric(5,2),
  d_hauptamt_stunden_monat      numeric(5,2),
  d_ehrenamt_personen_jsonb     jsonb   -- [{name, vorname, jahresstunden}, ...] (max 4)
);

create table apl.fb_iv_freitext (
  antrag_id              uuid primary key references apl.antraege(id) on delete cascade,
  vorhaben_titel         text not null,
  kurzbeschreibung       text not null,
  geplante_massnahmen    text not null,
  beantragte_summe_euro  numeric(10,2),
  laufzeit               text
);
```

### 4.3 Gemeinsame Anlagen-Tabelle

```sql
create table apl.anlagen (
  id              uuid primary key default gen_random_uuid(),
  antrag_id       uuid not null references apl.antraege(id) on delete cascade,
  anlagentyp      apl.anlagentyp_enum not null,
  dateiname       text not null,
  storage_path    text not null,
  groesse_bytes   int,
  hochgeladen_am  timestamptz not null default now()
);
```

`apl.anlagentyp_enum`: `projektskizze`, `helferliste`, `foerderbestaetigung_bund`, `programm_flyer`, `stundenzettel`, `mietvertrag`, `sonstige`

### 4.4 Workflow-Audit-Trail

```sql
-- Bleibt strukturell wie apl2.antrag_history, nur Schema-Rename auf apl.
create table apl.antrag_history (
  id              uuid primary key default gen_random_uuid(),
  antrag_id       uuid not null references apl.antraege(id) on delete cascade,
  von_status      text,
  nach_status     text not null,
  geaendert_von   text,
  geaendert_am    timestamptz not null default now(),
  kommentar       text
);
```

### 4.5 Manuelle Prüfvermerke (UE2)

Bleibt strukturell wie `apl2.manuelle_pruefung`, Schema-Rename + Pfade-Anpassung.

### 4.6 UE0-Tracking-Tabelle

```sql
-- ersetzt apl2.antrag_einreichung
create table apl.einreichung (
  id                      uuid primary key default gen_random_uuid(),
  antrag_id               uuid references apl.antraege(id) on delete set null,
  foerderbereich          apl.foerderbereich_enum,   -- vom Bürger bei Upload gewählt
  status                  apl.einreichung_status_enum not null default 'wartend',
  storage_path            text not null,
  anlagen_storage_paths   text[],
  dateiname               text,
  groesse_bytes           int,
  extrahiert_jsonb        jsonb,
  verarbeitet_am          timestamptz,
  fehler                  text
);
```

### 4.7 Inbox-View

```sql
create view apl.antrag_uebersicht as
select
  a.*,
  -- Föderbereich-Label für UI
  case a.foerderbereich
    when 'I'   then 'Aufbau'
    when 'II'  then 'Engagement'
    when 'III' then 'Bewährte Strukturen'
    when 'IV'  then 'Schwerpunkt'
  end as fb_label,
  -- Variante (nur bei FB III)
  v.variante                                            as fb_iii_variante,
  -- Beantragte Summe (Quelle variiert je FB)
  coalesce(
    p.personalkosten_euro + p.sachkosten_euro,         -- FB I
    null,                                              -- FB II hat keine Summe (Pauschale)
    null,                                              -- FB III hat keine Summe im Antrag
    f.beantragte_summe_euro                            -- FB IV
  ) as antragssumme_euro,
  -- Durchlaufzeit
  (select min(h.geaendert_am)
     from apl.antrag_history h
    where h.antrag_id = a.id and h.nach_status in ('bewilligt', 'abgelehnt')
  ) as entschieden_am
from apl.antraege a
  left join apl.fb_i_projekt p     on p.antrag_id = a.id
  left join apl.fb_iii_variante v  on v.antrag_id = a.id
  left join apl.fb_iv_freitext f   on f.antrag_id = a.id;
```

## 5. UI-Architektur pro Reifegradstufe

### 5.1 UE0 — OCR-Upload-Portal

**Flow:**
1. Bürger landet auf Upload-Portal
2. **Schritt 1**: FB-Wahl mit 4 Karten (Begriffe „Aufbau / Engagement / Bewährte Strukturen / Schwerpunkt" prominent, FB-Nummern als Sekundär-Code; bei FB III aufklappbar mit A/B/C/D; „unsicher? → 3 Fragen"-Link für Wizard)
3. **Schritt 2**: FB-spezifische Upload-Slots werden eingeblendet
   - FB I: 1 Slot „Antrag AHP I" + 1 Slot „Projektskizze"
   - FB II: 1 Slot „Antrag AHP II" + 1 Slot „Helferliste" (optional)
   - FB III: 1 Slot „Antrag AHP III" + Slot je nach Variante (Förderbestätigung Bund / Programm-Flyer / Stundenzettel)
   - FB IV: kein PDF (nur Hinweis „FB IV erfordert keinen Antrag-PDF — direkt zu UE1")
4. **Schritt 3**: Edge Function lädt in Storage + erzeugt `apl.einreichung`-Eintrag mit `foerderbereich`
5. DB-Trigger feuert n8n-Webhook
6. n8n: PDF-OCR (Hauptantrag) + ggf. Helferliste-OCR + ggf. weitere Anlagen
7. UPDATE `apl.einreichung` mit `extrahiert_jsonb`
8. Bürger sieht Status-Seite, bei `fertig` Auto-Redirect zu UE1 mit `?prefill=<einreichung_id>`

### 5.2 UE1 — Webformular

**Flow: drei Grob-Phasen**

**Phase 1 — Antragsteller:**
- Auswahl Förderbereich (Karten + Wizard wie UE0)
- Gemeinsamer Antragsteller-Block (Dachverband, Einrichtung, Adresse, Kontakt, Bank)

**Phase 2 — FB-spezifische Felder:**
- Bei FB III: zusätzliche Variante-Wahl (Karten A/B/C/D)
- Dann die FB-spezifischen Felder
- Helferliste-Tabelle (FB II) mit „+ Helfer hinzufügen", Live-Summe Gesamtstunden

**Phase 3 — Anlagen + Senden:**
- FB-spezifische Anlagen-Slots (Pflicht/Optional je FB)
- Antragsvorschau
- Bestätigung „Angaben wahrheitsgemäß"
- Absenden-Button (Edge Function `submit-antrag` schreibt apl.antraege + Detail-Tabelle + apl.anlagen)

**Mehrsprachigkeit:** bestehende DE/IT/TR/ES-Übersetzungen werden auf die neuen Felder erweitert. Vorerst maschinell, mit `// TODO Fachübersetzer`-Markern.

### 5.3 UE2 — Sachbearbeiter-Cockpit

**Inbox-Anpassung:**
- Gemeinsame Tabelle für alle 4 FBs
- Neue Spalte „Förderbereich" mit FB-Label + Variante-Suffix (z.B. „Bewährte Strukturen · B")
- Neuer Filter: FB-Pills (Aufbau / Engagement / Bewährte / Schwerpunkt / Alle)
- Antragssumme bleibt — kommt aus View je nach FB

**AntragDetail:**
- Layout pro FB unterschiedlich (FB I zeigt Projekt-Block, FB II zeigt Ehrenamt + Helfertabelle, FB III zeigt FB-Variante + variantenspezifische Felder, FB IV zeigt Leitfragen)
- Gemeinsamer Antragsteller-Block immer oben
- SektionPruefung (manuelle Prüfvermerke) bleibt überall verfügbar

### 5.4 UE3 — KI-Sachbearbeitung

**Plus zur UE2-Funktionalität:**

**Smart-Upload-Bereich** in der Inbox:
- Drop-Zone „Dokumente hochladen + zuordnen"
- Sachbearbeiter zieht eine oder mehrere PDFs/Excel hinein
- Claude Vision klassifiziert pro Datei:
  - PDF: welcher FB, welche Variante, welche Anlage
  - Excel: welche Schablone (Helferliste, Beleg-Aufstellung)
- Vorschlag pro Datei wird angezeigt mit Bestätigen/Korrigieren-Buttons
- Bei Helferliste-PDF: zusätzlich werden die einzelnen Helfer-Zeilen extrahiert und als `apl.fb_ii_helfer`-Vorschläge dargestellt
- Bei Excel-Helferliste: pandas/openpyxl-Parser, höhere Genauigkeit
- Sachbearbeiter bestätigt → Daten landen strukturiert in DB

**KI-Prüfung pro FB:**
- bescheid_subsumtion.py erhält FB-spezifische Prompt-Templates
- AHP-Doctree wird auf alle 4 FBs erweitert (siehe Sektion 6)
- Vorjahresvergleich funktioniert über FB-Grenzen hinweg (Träger-Match), zeigt aber Warnung wenn FB wechselt

### 5.5 UE4 — Agentisches Bürger-GUI

Siehe Task #100 (kommt nach UE0-UE3 Re-Build).

## 6. Ontologie / Doctree-Neukuration

Die `apl.ahp_norm_statements`-Tabelle muss komplett neu aus der jetzt aktuell heruntergeladenen Förderrichtlinie kuratiert werden. Pro FB ein Doctree-Abschnitt mit:
- Förder-Voraussetzungen
- Bemessungsgrößen
- Förderhöchstgrenzen
- Bewilligungs-/Ablehnungsgründe
- Anlagen-Pflichten

Bestehende Doctree-Pflege-Logik (`pruefung/src/pruefung/doctree_navigate.py`) bleibt — nur Inhalt wird ersetzt.

## 7. Migration-Strategie

1. **Migration 060**: neues Schema `apl` mit allen Tabellen + Enums + Views anlegen
2. **Migration 061**: GRANTs für `authenticated`, `anon` (read), `service_role` auf alle apl.*-Tabellen
3. **Migration 062**: alte `apl2.*`-Tabellen DROPpen (CASCADE auf abhängige Views). **Alle Daten gehen verloren — bewusst.** Demo-Daten werden neu erstellt.
4. **Migration 063**: 4–8 realitätsnahe FAKE-Anträge pro FB als Seed. Werte aus plausiblen Würzburger Träger-Profilen (Robert kuratiert die konkreten Werte).
5. **Migration 064**: `apl.ahp_norm_statements` neu kuratieren auf Basis der aktuellen `materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf`

n8n-Workflows werden angepasst, nicht neu gebaut.

## 8. Edge Function `submit-antrag`

Wird komplett neu. Erwartetes JSON-Schema:

```typescript
{
  foerderbereich: "I" | "II" | "III" | "IV",
  // gemeinsamer Block...
  dachverband: string?, einrichtung: string, ansprechpartner: string,
  strasse: string, plz: string, ort: string, telefon: string, email: string,
  bankname: string, iban: string, bic: string,
  haushaltsjahr: number,
  // FB-spezifisch (eine der vier):
  fb_i?: { projekt_titel, laufzeit, stadtteil, personalkosten, sachkosten, drittmittel[], andere_mittel[] },
  fb_ii?: { ehrenamt_titel, anzahl_helfer, gesamt_helferstunden, direkter_kontakt_senioren, helfer: [{name,vorname,einsatzbereich,eintritt,austritt,std_monat,std_jahr}] },
  fb_iii?: { variante: "A"|"B"|"C"|"D", a_anmerkung?, b_*?, c_*?, d_* },
  fb_iv?: { vorhaben_titel, kurzbeschreibung, geplante_massnahmen, beantragte_summe, laufzeit },
  anlagen?: [{ anlagentyp, dateiname, storage_path }],
  einreichung_id?: uuid   // aus UE0
}
```

Validierungs-Logik (serverseitig):
- `foerderbereich` ist gesetzt
- Genau ein `fb_x`-Objekt für den gewählten FB
- Pflichtfelder pro FB (siehe Sektion 3)
- IBAN-Prüfziffer (Mod-97)
- Anlagen-Typ-Constraint pro FB

## 9. Was explizit NICHT in Scope dieser Spec ist

- **UE4 Implementation**: bleibt eigenständige Spec/Plan (Task #100). UE4 baut auf dieser Architektur auf.
- **UE2 Workflow-Engine**: bleibt unverändert (nur Schema-Pfade `apl2` → `apl`).
- **Bescheid-Rendering**: bleibt strukturell wie heute, nur FB-spezifische Templates.
- **n8n-Workflow-Refactor**: nur Anpassungen, keine Architektur-Neuerung.
- **Realtime-Subscriptions UE2/UE3**: optional, nicht in dieser Spec entschieden.

## 10. Tests-Strategie

- **UE1 Vitest**: pro FB ein State-Test-Set (Initial / Pflichtfelder / Cross-Field-Regeln)
- **UE2/UE3 Vitest**: Inbox-Render mit allen FBs, Filter, FB-Spalte
- **pruefung-Tests**: pro FB ein Subsumtions-Test, Smart-Upload-Endpoint mit Mock-Claude-Antworten
- **E2E manuell**: pro FB ein kompletter Antragsdurchlauf UE0 → UE1 → UE2 → UE3-Bescheid

## 11. Aufwand-Schätzung

| Bereich | Tage |
|---|---|
| DB-Migrationen (060–064) | 1 |
| UE1-Refactor Multi-FB Webformular | 2–3 |
| UE0-Refactor (FB-Wahl + Slots, OCR-Prompts pro FB) | 1–2 |
| UE2-Inbox-Anpassung + AntragDetail pro FB | 1 |
| UE3 Smart-Upload + Helferliste-OCR + Excel-Import | 2 |
| UE3 Bescheid-Logik pro FB + Doctree-Re-Kuration | 1–2 |
| Tests + Build + Deploy + Smoke | 1 |
| **Gesamt** | **9–12 Tage** |

UE4 separat.

## 12. Pre-Mortem &amp; Mitigationen (Robert-Priorität: Halluzinations-Vermeidung)

Pre-Mortem-Methode (Gary Klein): „Stell dir vor, in drei Monaten ist das Projekt katastrophal gescheitert — was waren die Gründe?". Pro Cluster: Szenario + technische Vorkehrung + Akzeptanzkriterium für Definition-of-Done.

### 12.1 Halluzinations-Cluster (höchste Priorität)

**Szenario:** KI in UE3 schreibt einen Bescheid, der einen Paragraphen zitiert, den es in der AHP-Richtlinie so nicht gibt. Sachbearbeiter merkt es nicht. Bürger klagt. Stadt verliert. Vorlesung wird zum Negativbeispiel.

**Mitigationen:**

1. **Doctree-Source-Pinning** — Jedes Statement in `apl.ahp_norm_statements` bekommt Pflicht-Spalten:
   - `quelle_pdf_pfad` (z.B. `materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf`)
   - `quelle_seite` (int)
   - `woertliches_zitat` (text, das exakte Zitat aus der PDF, beim Bescheid mitgedruckt)
   - DB-Constraint: alle drei Felder NOT NULL, kein Doctree-Statement ohne Quellen-Verankerung

2. **Quellen-Validator als Hard-Fail** — `pruefung/src/pruefung/quellen_validator.py` läuft vor jedem PDF-Render. Wenn ein referenzierter Paragraph nicht in `apl.ahp_norm_statements.ref` existiert, wird der Bescheid-Export abgebrochen. Kein Flag zum Abschalten. Logging in `apl.bescheid_render_log`.

3. **Halluzinations-Test-Pool** — `pruefung/tests/test_halluzinations_pool.py` enthält ≥ 10 synthetische Anträge mit:
   - Erfundenen Trägernamen (z.B. „Senioren-Cyber-Club e.V.")
   - Ungültigen IBANs (Mod-97-fail)
   - Quartiernamen, die in Würzburg nicht existieren („Sandhof-West")
   - Förderbeträgen weit über AHP-Höchstgrenze
   - Treffen-Zahlen, die unmöglich sind (1000/Jahr)
   - **Akzeptanzkriterium:** KI muss mindestens 9 von 10 als „fraglich" oder „unklar" einstufen, nicht als „bewilligungsreif".

4. **Doctree-Drift-Diff** — `scripts/doctree-drift-check.py` (neu): wenn `materialien/wuerzburg-2026/ahp-foerderrichtlinie-*.pdf` sich ändert, läuft ein Diff-Check der wörtlichen Zitate aus `apl.ahp_norm_statements.woertliches_zitat` gegen den neuen PDF-Text. Abweichungen werden gemeldet, manuelle Kuratierung erforderlich vor dem nächsten Deploy.

### 12.2 Daten-Quellen-Mismatch

**Szenario:** Die FAKE-Anträge haben „Bauchgefühl"-Werte. KI lernt diese als plausibel. In der Live-Demo zeigt sie unsinnige Schwellen („96 % Stadtbewohner-Anteil ist normal"). Studierende merken den Trick.

**Mitigationen:**

1. **FAKE-Daten aus dokumentierten Quellen** — Migration 063 schreibt pro Antrag im SQL-Kommentar die Datenquelle:
   - Träger-Namen: aus Würzburger Vereinsregister (öffentlich)
   - Adressen: aus OpenStreetMap
   - IBANs: aus dem Bundesbank-Test-IBAN-Pool (DE-Format, ungültig zum Überweisen, gültig im Mod-97-Check)
   - Beispiel-Kommentar: `-- Quelle: Vereinsregister-Auszug Würzburg 2025-04-12, Eintragsnummer VR 1234`

2. **Plausibilitäts-Referenzwerte** in `apl.plausibilitaets_norm`:
   - Pro FB: Wertebereich mit Min/Max (z.B. `stadtbewohner_anteil [0.20, 0.95]` für Begegnungszentren)
   - Quelle: Sozialatlas Würzburg, Statistisches Landesamt Bayern
   - KI markiert Ausreißer + zitiert die Referenz-Quelle

3. **Demo-Daten-Banner-Verfeinerung** — pro Antrag im Detail eine Datenquellen-Zeile:
   - „Datenquelle: synthetisch (Demo)"
   - „Datenquelle: Vereinsregister-Auszug 2025-04-12"
   - „Datenquelle: echter Bürger-Eingang via UE0/UE1"

### 12.3 Schema-Drift (DB ≠ Code ≠ PDF)

**Szenario:** AHP-Richtlinie wird im Sommer 2026 nochmal überarbeitet. PDF-Felder ändern sich. UE1 fragt aber alte Felder ab. UE3 prüft gegen alten Doctree. Genau, was uns gestern mit den Halbgott-Feldern passiert ist.

**Mitigationen:**

1. **PDF-Field-Extractor-Skript** — `scripts/extract-fields-from-pdf.py`:
   - Parst jedes Antrags-PDF (`antrag-ahp-{1,2,3}*.pdf`) aus `materialien/wuerzburg-2026/`
   - Generiert pro FB eine JSON-Field-Inventory-Datei (`docs/specs/fields/fb-{1,2,3,4}-inventory.json`)
   - Erfasst pro Feld: Pfad in PDF, Datentyp-Hinweis, Pflicht/Optional
   - **CI-Test** `tests/test_schema_consistency.py` vergleicht JSON-Inventory mit DB-Schema und TypeScript-Interfaces. Bei Drift: Build bricht.

2. **Single-Source-of-Truth-Tabelle** in `docs/superpowers/specs/fb-fields-master.md` — manuell kuratierte Feldreferenz pro FB. PR-Pflicht: bei Code-Änderung diese Tabelle mit-pflegen.

3. **Versionierte Materialien** — `materialien/wuerzburg-2026/`-Ordner ist mit Datum getaggt. Neuer Stand → neuer Ordner. Bestehender Code referenziert konkret den Pfad.

### 12.4 KI-Adoption zu niedrig

**Szenario:** Sachbearbeiter sehen KI-Vorschläge, klicken aber immer „Overrule". Adoption sinkt unter 30 %. Investition lohnt sich nicht.

**Mitigationen:**

1. **Adoption-Schwellenwerte als CI-Gate** — `pruefung/tests/test_adoption.py` simuliert 20 Demo-Anträge mit „Ground-Truth"-Entscheidungen (kuratiert von Robert). KI muss bei mindestens 70 % zur menschlichen Entscheidung passen, sonst CI-fail. Schwellenwert ist konfigurierbar pro Iteration.

2. **Erklärbare KI-Vorschläge** — bescheid_subsumtion.py darf keine „Bewilligen"-Empfehlung ohne Quellen-Zitat ausspucken. Schema-Constraint im JSON-Output:
   ```
   { empfehlung: "bewilligen", begruendung: "...", quellen: [{ref:"§ 2.3.2", zitat:"...", seite:7}], ... }
   ```
   Wenn `quellen[]` leer → vom Quellen-Validator abgelehnt.

3. **Differenziertes Adoption-Tracking** — schon vorhanden (`apl.ki_override` aus UE3). Erweitern um Klassifikation: „komplett ablehnt" vs. „nur eine Empfehlung overruled". Alarm erst bei „komplett-ablehnt > 30 %".

### 12.5 Architektur-Komplexität explodiert

**Szenario:** 4 FBs × 4 Reifegrad-Stufen × Multilingualität × 4 FB-III-Varianten = Code-Inflation. Jede AHP-Änderung führt zu Refactors an 20 Stellen.

**Mitigationen:**

1. **FB-Logik als Daten-Konfiguration** — pro FB ein YAML/TS-Konfig in `ue1/webformular/src/foerderbereiche/{i,ii,iii,iv}.ts`:
   ```typescript
   export const FB_I_KONFIG = {
     id: "I", label: "Aufbau", farbe: "...",
     pflichtfelder: ["projekt_titel", "personalkosten_euro", ...],
     optional: ["drittmittel", ...],
     anlagen: { projektskizze: { pflicht: true, mime: ["pdf"] } },
     validation: [/* JSON-Schema-Refs */]
   };
   ```
   Form-Renderer wird generisch, FB-Logik ist Daten.

2. **Tests pro FB** — `tests/foerderbereiche/fb-{i,ii,iii,iv}.test.ts` mit identischer Struktur (Initial-State, Pflichtfelder, Cross-Field, Submit-Payload). Bricht ein FB-Refactor andere FBs, schlägt sofort ein Test fehl.

3. **Spec als lebendiges Dokument** — bei jeder Architektur-PR: Spec mit-aktualisieren. Pre-commit-Hook in `.git/hooks/pre-commit` prüft, ob Spec-Änderungen vorhanden sind bei Multi-FB-Code-Änderung.

### 12.6 Live-Demo-Risiko in der Vorlesung

**Szenario:** Vor 60 Studierenden klickt Robert auf „Bewilligen". KI lädt 8 s. Cache zeigt alte Daten. Bescheid-PDF rendert nicht. Studierende denken: „So funktioniert KI in der Verwaltung also nicht."

**Mitigationen:**

1. **Pre-Flight-Checkliste** in `docs/lehrveranstaltung/pre-flight-checklist.md`:
   - Container-Reset (UE2/UE3/pruefung)
   - Cache-Clear (Browser, Supabase-Schema-Reload)
   - Smoke-Test (1 Antrag pro FB durchklicken)
   - Performance-Check (TTFB < 500 ms)
   - Fallback-Screenshots der Erfolgs-Pfade bereit

2. **Performance-Floor** — VPS-Upgrade auf dedizierte vCPU vor Vorlesungstag (siehe Performance-Diagnose, CPU-Steal 90 %). TTFB unter 500 ms als Hard-SLO. Ohne diesen Upgrade: Vorlesung mit live-Demo nicht durchführbar.

3. **Offline-Fallback** — wenn `pruefung-service` oder LLM-API ausfällt: deterministische Mock-Response, sodass Demo weiterläuft. UI markiert klar „Mock — offline-Modus".

4. **Demo-Reset-Skript** — `scripts/demo-reset.sh`:
   - DB auf Demo-Snapshot zurücksetzen (5 Anträge, 0 Bescheide, alle Status „eingegangen")
   - localStorage-Reset im Browser (Banner wieder sichtbar, keine Spalten-Konfig)
   - Cache-Purge an allen Frontends
   - Verwendung: vor jeder Vorlesung einmal laufen lassen

### 12.7 Konsolidierte Definition-of-Done

Damit „extrem hoher Automatisierungsgrad" verlässlich erreichbar bleibt, gilt vor jedem UE-Release:

- [ ] Alle Doctree-Statements haben `quelle_pdf_pfad`, `quelle_seite`, `woertliches_zitat`
- [ ] Quellen-Validator läuft als Hard-Fail im Bescheid-Render
- [ ] Halluzinations-Test-Pool bestanden: ≥ 9/10 als „fraglich/unklar" eingestuft
- [ ] Adoption-CI-Gate bestanden: ≥ 70 % Übereinstimmung mit Ground-Truth-Set
- [ ] PDF-Field-Inventory matched DB-Schema und TypeScript-Interfaces
- [ ] Pre-Flight-Checkliste für Vorlesung durchgearbeitet
- [ ] Demo-Reset-Skript getestet

## 13. Architektur-Trennung — Schichten und wiederverwendbare Komponenten

Robert-Vorgabe: saubere Trennung statt einer einzigen großen App. Das beugt direkt Risiko 12.5 (Komplexitäts-Explosion) vor und macht UE4 später einfacher anzuflanschen.

### 13.1 Fünf horizontale Schichten

```
┌──────────────────────────────────────────────────────────────┐
│  Schicht 5 — App-Bundles (UE0, UE1, UE3, UE4)               │
│  Vite-Apps mit jeweils eigenem Build, eigener Domain        │
└──────────────────────────────────────────────────────────────┘
                            ▲
┌──────────────────────────────────────────────────────────────┐
│  Schicht 4 — Workflow-Layer                                  │
│  Wizard-Phasen (UE1: Antragsteller→FB-Details→Senden),       │
│  FB-Wahl-Logik, Cross-Field-Regeln                          │
└──────────────────────────────────────────────────────────────┘
                            ▲
┌──────────────────────────────────────────────────────────────┐
│  Schicht 3 — UI-Komponenten (Renderer)                      │
│  AntragstellerBlock, HelferTabelle, FBKartenWahl,           │
│  DocSection, AnlageUpload, FBVariantenWahl                  │
└──────────────────────────────────────────────────────────────┘
                            ▲
┌──────────────────────────────────────────────────────────────┐
│  Schicht 2 — FB-Definitionen (Daten-Konfig, kein Code)      │
│  fb-i.config.ts, fb-ii.config.ts, fb-iii.config.ts,         │
│  fb-iv.config.ts — Felder/Pflichten/Validierung/Anlagen     │
└──────────────────────────────────────────────────────────────┘
                            ▲
┌──────────────────────────────────────────────────────────────┐
│  Schicht 1 — Daten-Layer                                     │
│  Supabase-Client-Wrapper, DB-Schema-Typen (generiert),       │
│  RPC-Funktionen, Storage-Upload                             │
└──────────────────────────────────────────────────────────────┘
```

### 13.2 Schicht-für-Schicht-Verantwortung

**Schicht 1 — Daten-Layer** (`packages/data-layer/`):
- Single Supabase-Client-Initialisierung
- Generierte TypeScript-Typen aus DB-Schema (`pnpm gen-types`)
- RPC-Wrapper für `submit-antrag`, `klassifiziere-pdf`, `extrahiere-helferliste`
- Storage-Upload mit MIME-/Size-Validation
- Kein UI, kein FB-Wissen

**Schicht 2 — FB-Definitionen** (`packages/foerderbereiche/`):
Pro FB eine TypeScript-Konfig, kein Code-Branch:
```typescript
// packages/foerderbereiche/fb-i.config.ts
export const FB_I: FoerderbereichKonfig = {
  id: "I",
  label: "Aufbau",
  beschreibung: "Aufbau niedrigschwelliger Angebote",
  pflicht_felder: ["projekt_titel", "personalkosten_euro", "sachkosten_euro"],
  optional_felder: ["laufzeit", "stadtteil", "drittmittel", "andere_mittel"],
  anlagen: [
    { typ: "projektskizze", pflicht: true, mime: ["application/pdf"], max_mb: 10 }
  ],
  validation_rules: [
    { regel: "personalkosten_euro >= 0" },
    { regel: "sachkosten_euro >= 0" }
  ],
  quelle_pdf: "materialien/wuerzburg-2026/antrag-ahp-1-aufbau-niedrigschwellige-angebote.pdf"
};
```
Alle 4 FBs nutzen das gleiche Konfig-Interface. Renderer kennt nur das Interface.

**Schicht 3 — UI-Komponenten** (`packages/ui-komponenten/`):
Generische, FB-agnostische Komponenten:
- `<AntragstellerBlock />` — gemeinsame 12 Felder (Dachverband, Adresse, Bank). Wird in UE0-Status-Preview, UE1-Phase-1, UE2-Detail, UE3-Detail verwendet.
- `<FBKartenWahl />` — die 4 Karten + Hybrid-Wizard-Link, verwendet in UE0 + UE1
- `<FBVariantenWahl />` — die 4 Karten A/B/C/D für FB III
- `<HelferTabelle />` — strukturierte Tabelle mit „+ Helfer hinzufügen", Live-Summe. In UE1 leer, in UE3 mit OCR-vorgefüllt.
- `<DocSection />` — §-strukturierte Sektion (heute schon in UE3 → in das Paket)
- `<AnlageUpload />` — Drop-Zone + Validation pro Anlagentyp
- `<DurchlaufzeitBadge />`, `<StatusBadge />`, `<DemoDatenBanner />` — bestehend

**Schicht 4 — Workflow-Layer** (in den App-Bundles, leicht):
- `usePhasenWizard()` für die UE1-3-Phasen-Logik
- `useFBValidation(konfig)` für Cross-Field-Regeln basierend auf der FB-Konfig
- App-spezifisch, weil je nach Reifegradstufe unterschiedlich (UE0 minimal, UE4 agentisch)

**Schicht 5 — App-Bundles**:
- `ue0/upload-portal/` — Vite-Bundle, importiert aus packages/ui-komponenten + foerderbereiche
- `ue1/webformular/` — Vite-Bundle, dito + i18n
- `ue3/sachbearbeitung-ki/` — Vite-Bundle, dito + Smart-Upload-Hook
- `ue4/agent/` — Vite-Bundle, dito + Chat-UI + WebSocket
- Jede App hat ihre eigene Domain, eigene `.env`, eigene Auth

### 13.3 Backend-Trennung (analog)

```
┌──────────────────────────────────────────────────────────────┐
│  pruefung/ — FastAPI-Service                                 │
│  Endpoints: /api/pruefung/erstpruefung, /api/klassifiziere-pdf,│
│  /api/extrahiere-helferliste, /api/render-bescheid          │
└──────────────────────────────────────────────────────────────┘
                            ▲
┌──────────────────────────────────────────────────────────────┐
│  pruefung/src/pruefung/foerderbereiche/ — FB-Plugins        │
│  fb_i.py, fb_ii.py, fb_iii.py, fb_iv.py                     │
│  Pro FB eine Prüf-Plugin-Klasse (gleiche Schnittstelle)     │
└──────────────────────────────────────────────────────────────┘
                            ▲
┌──────────────────────────────────────────────────────────────┐
│  pruefung/src/pruefung/core/ — Shared                       │
│  llm_client (Anthropic+LMStudio), doctree_navigate,         │
│  quellen_validator, dissens, vergleich_vorjahr              │
└──────────────────────────────────────────────────────────────┘
```

FB-Plugin-Interface:
```python
class FoerderbereichPlugin(Protocol):
    fb_id: str  # "I" | "II" | "III" | "IV"
    def get_pflicht_felder(self) -> list[str]: ...
    def baue_subsumtions_prompt(self, antrag, doctree) -> str: ...
    def post_process_kibescheid(self, raw) -> StrukturiertesErgebnis: ...
    def render_bescheid_template(self, antrag, ki_result) -> Path: ...
```

Neue Förderlinie → neues `fb_v.py`-Plugin, kein Touch am Core.

### 13.4 Monorepo-Layout

```
DigitalisierungVerwaltung/
├── packages/
│   ├── data-layer/          (Schicht 1)
│   ├── foerderbereiche/     (Schicht 2)
│   └── ui-komponenten/      (Schicht 3)
├── ue0/upload-portal/       (Schicht 5, App-Bundle)
├── ue1/webformular/         (Schicht 5)
├── ue2/sachbearbeiter/      (Schicht 5, bleibt unverändert)
├── ue3/sachbearbeitung-ki/  (Schicht 5)
├── ue4/agent/               (Schicht 5, später)
├── pruefung/                (Backend-Service)
│   └── src/pruefung/
│       ├── core/
│       └── foerderbereiche/
└── supabase/migrations/
```

`packages/` als pnpm-Workspace oder npm-workspaces. Jede App importiert per `@dv/data-layer`, `@dv/foerderbereiche`, `@dv/ui-komponenten`.

### 13.5 Was diese Trennung verhindert

- **Keine If-Else-Mauer pro FB** im UI-Code — FB-Definitionen sind Daten
- **Keine Code-Duplikation** Antragsteller-Block zwischen UE0/UE1/UE2/UE3
- **Keine Mehrfach-Migration** beim FB-Schema-Update — eine Stelle
- **Keine Wartungs-Hölle** beim UE4-Bau — agentischer Layer setzt auf die selben FB-Konfigs auf
- **Klare Testbarkeit** pro Schicht (UI-Komponenten ohne DB, FB-Konfigs ohne Renderer)

## 14. Offene Punkte für Robert-Review

1. Aufwand 9–12 Tage realistisch oder zu groß für den Vorlesungszeitraum?
2. Soll FB IV wirklich Web-Form bekommen, oder reicht erst mal Hinweis „bitte formlos per Mail einreichen"?
3. Vor Implementation: Robert kuratiert realitätsnahe FAKE-Demo-Daten pro FB (insgesamt 4–8 Anträge mit konsistenten Werten — Stadtteile, Bankverbindungen, Träger-Namen)
4. Soll der Smart-Upload in UE3 mehrere PDFs gleichzeitig oder eines nach dem anderen verarbeiten?
5. Excel-Schablonen: stellt das Amt sie wirklich bereit oder nur als Konzept-Demonstration?
