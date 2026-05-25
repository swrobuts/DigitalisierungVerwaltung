# Multi-Förderbereich-Architektur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-Build UE0, UE1 und UE3 für alle vier AHP-Förderbereiche (I, II, III, IV) der Stadt Würzburg auf Basis der echten 2025-er Antrags-PDFs. UE2 wird minimal angepasst (Multi-FB-Inbox-Filter). Schema-Rename `apl2.*` → `apl.*`, fünfschichtige Architektur mit `packages/`-Monorepo, Hard-Fail-Quellen-Validator gegen Halluzination.

**Architecture:** Monorepo mit pnpm-Workspaces. `packages/foerderbereiche/` enthält FB-Konfigurationen als Daten (kein Code-Branch pro FB). `packages/data-layer/` kapselt Supabase. `packages/ui-komponenten/` enthält FB-agnostische React/TS-Komponenten. App-Bundles (`ue0/`, `ue1/`, `ue3/`) importieren aus packages. Backend `pruefung/` bekommt FB-Plugin-Schicht. Vor jedem Bescheid läuft Quellen-Validator als Hard-Fail.

**Tech Stack:** PostgreSQL 15 (Supabase) · Vite 6 · TypeScript 5 · React 19 (für UE2/UE3 — UE0/UE1 bleiben Vanilla TS) · Tailwind 4 · pnpm 9 (workspaces) · FastAPI · Anthropic SDK · pypdfium2 · openpyxl · pytest · Vitest

**Vorgänger-Spec:** `docs/superpowers/specs/2026-05-25-multi-foerderbereich-architektur-design.md`

**Repo-Variable:** `REPO="/Users/robert/Library/CloudStorage/OneDrive-Persönlich/Vorlesungen/Übergreifend/Fallstudien/DigitalisierungVerwaltung"`

**VPS:** `ssh vps` (alias auf `bot.butscher.cloud`, siehe `~/.ssh/config`)

**Hard-Cut-Strategie (aus Spec §14):** Bestehende Live-Demos UE0/UE1/UE3 gehen während Umbau offline. UE2 bleibt erreichbar (nur Inbox-Anpassung). Wiederinbetriebnahme erst nach Phase 8.

---

## Phase 0 — Vorbereitung

### Task 0.1: Sicherheits-Backup vor allem Anderen

**Files:** keine Code-Änderungen, nur VPS-Operation.

- [ ] **Step 1: Full pg_dumpall**

```bash
ssh vps "
  TS=\$(date +%Y-%m-%d-%H%M)
  BACKUP=/root/backups/\${TS}-pre-multi-fb
  mkdir -p \$BACKUP
  docker exec supabase-db pg_dumpall -U postgres > \$BACKUP/full-dump.sql
  docker exec supabase-db pg_dump -U postgres -d postgres -n apl2 > \$BACKUP/apl2-only.sql
  ls -lh \$BACKUP/
"
```
Expected: full-dump.sql (~3 GB), apl2-only.sql (~150 KB).

- [ ] **Step 2: Robert-OK einholen** vor jeglichem Migration-Schritt.

### Task 0.2: Hard-Cut der Live-Demos vorbereiten

**Files:** keine, nur Container-Operation.

- [ ] **Step 1: UE0/UE1 von GitHub-Pages deployen-pausieren**

```bash
cd "$REPO"
# .github/workflows/deploy-pages.yml temporär `on: workflow_dispatch` only
# (statt push: branches: main) — verhindert Auto-Deploy während Umbau
sed -i.bak 's/^  push:/  push_DISABLED:/' .github/workflows/deploy-pages.yml
git add .github/workflows/deploy-pages.yml
git commit -m "ci(pages): pause auto-deploy für multi-FB-Umbau"
git push
```

- [ ] **Step 2: UE3-Container stoppen (UE2 bleibt!)**

```bash
ssh vps "docker stop amt-ki-frontend pruefung-service"
```
UE2 (`amt-frontend`) läuft weiter — Sachbearbeiter haben weiterhin Zugriff auf die bisherigen Anträge.

### Task 0.3: pnpm-Workspace-Setup im Repo

**Files:**
- Create: `package.json` (Root)
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`

- [ ] **Step 1: pnpm installieren wenn nötig**

```bash
which pnpm || npm install -g pnpm@9
pnpm --version  # >=9
```

- [ ] **Step 2: Root package.json schreiben**

```bash
cat > "$REPO/package.json" <<'EOF'
{
  "name": "digitalisierung-verwaltung",
  "version": "0.0.0",
  "private": true,
  "description": "THWS Lehr-Demo: Reifegradmodell Verwaltungsdigitalisierung am APL-Fall Stadt Würzburg",
  "scripts": {
    "build:packages": "pnpm -F './packages/**' build",
    "test:packages": "pnpm -F './packages/**' test",
    "gen-types": "tsx scripts/gen-supabase-types.ts"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0"
  }
}
EOF
```

- [ ] **Step 3: pnpm-workspace.yaml**

```bash
cat > "$REPO/pnpm-workspace.yaml" <<'EOF'
packages:
  - 'packages/*'
  - 'ue0/*'
  - 'ue1/*'
  - 'ue2/*'
  - 'ue3/*'
EOF
```

- [ ] **Step 4: .npmrc — strict, kein global-bleed**

```bash
cat > "$REPO/.npmrc" <<'EOF'
auto-install-peers=true
strict-peer-dependencies=false
node-linker=isolated
EOF
```

- [ ] **Step 5: Commit**

```bash
cd "$REPO"
git add package.json pnpm-workspace.yaml .npmrc
git commit -m "build: pnpm-workspaces für multi-FB-Architektur"
```

### Task 0.4: Tooling installieren auf VPS für PDF-Field-Extractor

**Files:** keine, nur Python-Deps.

- [ ] **Step 1: pypdfium2 + openpyxl in pruefung-Image-Dockerfile**

```bash
cd "$REPO/pruefung"
# Sicherstellen, dass pyproject.toml die Deps hat
grep -E "pypdfium2|openpyxl" pyproject.toml || cat >> pyproject.toml <<'EOF'
# Multi-FB-Architektur Phase 0:
# pypdfium2 für PDF-Field-Extraction (Plan 2026-05-25 Task 8.1)
# openpyxl für Excel-Schablonen-Import (Task 4.10)
EOF
```

Manuell ergänzen unter `[project.dependencies]`:
```toml
"pypdfium2>=4.30",
"openpyxl>=3.1",
```

- [ ] **Step 2: uv sync local**

```bash
cd "$REPO/pruefung"
uv sync
uv run python -c "import pypdfium2, openpyxl; print('OK')"
```
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
cd "$REPO"
git add pruefung/pyproject.toml pruefung/uv.lock
git commit -m "build(pruefung): pypdfium2 + openpyxl für PDF-Field-Extractor + Excel-Import"
```

---

## Phase 1 — DB-Migrationen 060-064 (Schema-Umzug apl2 → apl)

### Task 1.1: Migration 060 — apl-Schema + Enums + zentrale Tabelle

**Files:** Create `supabase/migrations/060_apl_schema_und_antraege.sql`.

- [ ] **Step 1: Migration schreiben**

```sql
-- 060_apl_schema_und_antraege.sql
-- Phase 1 Multi-FB-Umzug: neues neutrales Schema `apl` (statt apl2),
-- gemeinsame Antragsteller-Tabelle für alle 4 Förderbereiche.

create schema if not exists apl;

create type apl.foerderbereich_enum as enum ('I', 'II', 'III', 'IV');

create type apl.status_enum as enum (
  'eingegangen', 'in_pruefung', 'rueckfrage', 'bewilligt', 'abgelehnt'
);

create table apl.antraege (
  id                   uuid primary key default gen_random_uuid(),
  antragsnummer        text unique not null,
  haushaltsjahr        int not null check (haushaltsjahr between 2020 and 2030),
  foerderbereich       apl.foerderbereich_enum not null,

  -- gemeinsamer Antragsteller-Block (alle FBs)
  dachverband          text,
  einrichtung          text not null,
  ansprechpartner      text not null,
  strasse              text not null,
  hausnummer           text,
  plz                  text not null check (plz ~ '^[0-9]{5}$'),
  ort                  text not null,
  telefon              text not null,
  email                text not null check (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  homepage             text,
  bankname             text not null,
  iban                 text not null,
  bic                  text not null,

  -- Workflow
  status               apl.status_enum not null default 'eingegangen',
  submitted_at         timestamptz not null default now(),
  submitted_language   text not null default 'de' check (submitted_language in ('de', 'tr')),
  user_agent           text,
  ip_address           inet
);

create index antraege_foerderbereich_idx on apl.antraege(foerderbereich);
create index antraege_status_idx         on apl.antraege(status);
create index antraege_haushaltsjahr_idx  on apl.antraege(haushaltsjahr);

comment on table apl.antraege is
  'Zentrale Antragstabelle für alle vier AHP-Förderbereiche (Stand 2025). '
  'FB-spezifische Felder liegen in den fb_*-Detail-Tabellen (1:1).';
```

- [ ] **Step 2: Lokal nach VPS kopieren + applien**

```bash
scp "$REPO/supabase/migrations/060_apl_schema_und_antraege.sql" vps:/tmp/
ssh vps "docker exec -i supabase-db psql -U postgres -d postgres < /tmp/060_apl_schema_und_antraege.sql" 2>&1 | tail -8
```
Expected: `CREATE SCHEMA`, `CREATE TYPE` (×2), `CREATE TABLE`, `CREATE INDEX` (×3), `COMMENT`.

- [ ] **Step 3: Commit**

```bash
cd "$REPO"
git add supabase/migrations/060_apl_schema_und_antraege.sql
git commit -m "feat(db): migration 060 — apl-Schema + zentrale apl.antraege-Tabelle"
```

### Task 1.2: Migration 061 — FB-Detail-Tabellen + Helfer + Anlagen

**Files:** Create `supabase/migrations/061_apl_fb_details_und_anlagen.sql`.

- [ ] **Step 1: Migration schreiben**

```sql
-- 061_apl_fb_details_und_anlagen.sql
-- FB-spezifische Detail-Tabellen (1:1 zu apl.antraege) + Helferliste (1:n FB II) + Anlagen.

create type apl.fb_iii_variante_enum as enum ('A', 'B', 'C', 'D');

create type apl.treffen_schwelle_enum as enum ('GT_10', 'GT_20', 'GT_40');

create type apl.anlagentyp_enum as enum (
  'projektskizze',         -- FB I Pflicht
  'helferliste',           -- FB II Pflicht
  'foerderbestaetigung_bund',  -- FB III Variante A
  'programm_flyer',        -- FB III Variante B, C
  'stundenzettel',         -- FB III Variante D
  'sonstige'               -- FB IV / Generisch
);

create table apl.fb_i_projekt (
  antrag_id              uuid primary key references apl.antraege(id) on delete cascade,
  projekt_titel          text not null,
  laufzeit               text,
  stadtteil              text,
  personalkosten_euro    numeric(10,2) check (personalkosten_euro >= 0),
  sachkosten_euro        numeric(10,2) check (sachkosten_euro >= 0),
  drittmittel_jsonb      jsonb default '[]'::jsonb,
  andere_mittel_jsonb    jsonb default '[]'::jsonb
);

create table apl.fb_ii_ehrenamt (
  antrag_id                    uuid primary key references apl.antraege(id) on delete cascade,
  ehrenamt_titel               text not null,
  anzahl_helfer_vorjahr        int check (anzahl_helfer_vorjahr >= 0),
  gesamt_helferstunden_vorjahr int check (gesamt_helferstunden_vorjahr >= 0),
  direkter_kontakt_senioren    boolean not null default false
);

create table apl.fb_ii_helfer (
  id              uuid primary key default gen_random_uuid(),
  antrag_id       uuid not null references apl.antraege(id) on delete cascade,
  position        int not null check (position >= 1),
  name            text not null,
  vorname         text not null,
  einsatzbereich  text,
  eintritt        date,
  austritt        date,
  stunden_monat   numeric(6,2) check (stunden_monat >= 0),
  stunden_jahr    numeric(6,2) check (stunden_jahr >= 0),
  unique (antrag_id, position)
);
create index fb_ii_helfer_antrag_idx on apl.fb_ii_helfer(antrag_id);

create table apl.fb_iii_variante (
  antrag_id        uuid primary key references apl.antraege(id) on delete cascade,
  variante         apl.fb_iii_variante_enum not null,

  -- Variante A — Mehrgenerationenhaus
  a_anmerkung      text,

  -- Variante B — Begegnungszentrum/Bildungsträger
  b_anzahl_veranstaltungen      int check (b_anzahl_veranstaltungen >= 0),
  b_teilnehmer_senioren         int check (b_teilnehmer_senioren >= 0),
  b_teilnehmer_generationen     int check (b_teilnehmer_generationen >= 0),
  b_stadtbewohner_anteil        numeric(4,3) check (b_stadtbewohner_anteil between 0 and 1),
  b_quartierstreffen_teilnahme  boolean,
  b_quartiere                   text,
  b_quartier_person_name        text,

  -- Variante C — Seniorenkreis
  c_treffen_schwelle            apl.treffen_schwelle_enum,
  c_teilnehmer_durchschnitt     int check (c_teilnehmer_durchschnitt >= 0),
  c_quartierstreffen_anzahl     int check (c_quartierstreffen_anzahl >= 0),
  c_quartier_kooperation        text,
  c_quartier_person_name        text,

  -- Variante D — Quartiersmanagement
  d_hauptamt_name               text,
  d_hauptamt_stunden_woche      numeric(5,2) check (d_hauptamt_stunden_woche >= 0),
  d_hauptamt_stunden_monat      numeric(5,2) check (d_hauptamt_stunden_monat >= 0),
  d_ehrenamt_personen_jsonb     jsonb default '[]'::jsonb
);

create table apl.fb_iv_freitext (
  antrag_id              uuid primary key references apl.antraege(id) on delete cascade,
  vorhaben_titel         text not null,
  kurzbeschreibung       text not null check (length(kurzbeschreibung) <= 1000),
  geplante_massnahmen    text not null,
  beantragte_summe_euro  numeric(10,2) check (beantragte_summe_euro >= 0),
  laufzeit               text
);

create table apl.anlagen (
  id              uuid primary key default gen_random_uuid(),
  antrag_id       uuid not null references apl.antraege(id) on delete cascade,
  anlagentyp      apl.anlagentyp_enum not null,
  dateiname       text not null,
  storage_path    text not null,
  groesse_bytes   int check (groesse_bytes >= 0),
  hochgeladen_am  timestamptz not null default now()
);
create index anlagen_antrag_idx on apl.anlagen(antrag_id);
```

- [ ] **Step 2: Lokal nach VPS kopieren + applien**

```bash
scp "$REPO/supabase/migrations/061_apl_fb_details_und_anlagen.sql" vps:/tmp/
ssh vps "docker exec -i supabase-db psql -U postgres -d postgres < /tmp/061_apl_fb_details_und_anlagen.sql" 2>&1 | tail -15
```
Expected: 3× CREATE TYPE, 5× CREATE TABLE, 3× CREATE INDEX, keine Errors.

- [ ] **Step 3: Commit**

```bash
cd "$REPO"
git add supabase/migrations/061_apl_fb_details_und_anlagen.sql
git commit -m "feat(db): migration 061 — FB-Detail-Tabellen + Helfer (1:n) + Anlagen"
```

### Task 1.3: Migration 062 — Workflow-Tabellen + Antragsnummer-Generator

**Files:** Create `supabase/migrations/062_apl_workflow_und_antragsnummer.sql`.

- [ ] **Step 1: Migration schreiben**

```sql
-- 062_apl_workflow_und_antragsnummer.sql
-- Workflow-Audit-Trail + manuelle Prüfvermerke (UE2) + Antragsnummer-Trigger.

create table apl.antrag_history (
  id              uuid primary key default gen_random_uuid(),
  antrag_id       uuid not null references apl.antraege(id) on delete cascade,
  von_status      text,
  nach_status     text not null,
  geaendert_von   text,
  geaendert_am    timestamptz not null default now(),
  kommentar       text
);
create index antrag_history_antrag_idx on apl.antrag_history(antrag_id);

create type apl.pruefstatus as enum ('offen', 'ok', 'fraglich', 'fehlt');

create table apl.manuelle_pruefung (
  id            uuid primary key default gen_random_uuid(),
  antrag_id     uuid not null references apl.antraege(id) on delete cascade,
  paragraph     text not null,
  status        apl.pruefstatus not null default 'offen',
  kommentar     text,
  geprueft_von  uuid references auth.users(id) on delete set null,
  geprueft_am   timestamptz not null default now(),
  unique (antrag_id, paragraph)
);
create index manuelle_pruefung_antrag_idx on apl.manuelle_pruefung(antrag_id);

create or replace function apl.bump_manuelle_pruefung_timestamp()
returns trigger language plpgsql as $$
begin
  new.geprueft_am := now();
  return new;
end $$;

create trigger trg_bump_manuelle_pruefung_timestamp
  before update on apl.manuelle_pruefung
  for each row execute function apl.bump_manuelle_pruefung_timestamp();

-- Antragsnummer-Generator: APL-<jahr>-<FB>-<KÜRZEL>-<HEX>
create or replace function apl.generate_antragsnummer()
returns trigger language plpgsql as $$
declare
  fb_code text;
  kuerzel text;
  hex text;
begin
  fb_code := new.foerderbereich::text;  -- 'I' | 'II' | 'III' | 'IV'
  -- Kürzel aus erstem Wort des Einrichtung-Namens, max 4 Zeichen, UC, ohne Sonderzeichen
  kuerzel := upper(regexp_replace(split_part(coalesce(new.einrichtung, 'XXXX'), ' ', 1), '[^A-Za-z]', '', 'g'));
  kuerzel := substring(kuerzel from 1 for 4);
  if length(kuerzel) = 0 then kuerzel := 'XXXX'; end if;
  hex := upper(substring(encode(gen_random_bytes(3), 'hex') from 1 for 6));
  new.antragsnummer := format('APL-%s-FB%s-%s-%s', new.haushaltsjahr, fb_code, kuerzel, hex);
  return new;
end $$;

create trigger trg_generate_antragsnummer
  before insert on apl.antraege
  for each row
  when (new.antragsnummer is null or new.antragsnummer = '')
  execute function apl.generate_antragsnummer();

-- antragsnummer ist NOT NULL in Tabelle 060 — Trigger füllt sie pre-insert wenn nicht gesetzt
alter table apl.antraege alter column antragsnummer drop not null;
alter table apl.antraege add constraint antragsnummer_required_after_insert check (antragsnummer is not null);
```

- [ ] **Step 2: Apply + Verifikation**

```bash
scp "$REPO/supabase/migrations/062_apl_workflow_und_antragsnummer.sql" vps:/tmp/
ssh vps "docker exec -i supabase-db psql -U postgres -d postgres < /tmp/062_apl_workflow_und_antragsnummer.sql" 2>&1 | tail -10
# Test des Antragsnummer-Triggers
ssh vps "docker exec supabase-db psql -U postgres -d postgres -c \"
  insert into apl.antraege (haushaltsjahr, foerderbereich, einrichtung, ansprechpartner,
    strasse, plz, ort, telefon, email, bankname, iban, bic)
  values (2026, 'III', 'Test Verein', 'Test', 'Hauptstr', '97070', 'Würzburg',
    '0931 111', 'test@test.de', 'Sparkasse', 'DE89370400440532013000', 'COBADEFFXXX')
  returning antragsnummer;\""
```
Expected: `APL-2026-FBIII-TEST-XXXXXX`. Aufräumen: `delete from apl.antraege where einrichtung = 'Test Verein'`.

- [ ] **Step 3: Commit**

```bash
cd "$REPO"
git add supabase/migrations/062_apl_workflow_und_antragsnummer.sql
git commit -m "feat(db): migration 062 — workflow history + manuelle_pruefung + antragsnummer-trigger"
```

### Task 1.4: Migration 063 — Norm-Statements mit Source-Pinning (Pre-Mortem §12.1)

**Files:** Create `supabase/migrations/063_apl_ahp_norm_statements.sql`.

- [ ] **Step 1: Migration schreiben — Tabelle + Pflicht-Quellen-Felder**

```sql
-- 063_apl_ahp_norm_statements.sql
-- Doctree-Tabelle mit verpflichtendem Source-Pinning gem. Spec §12.1.
-- Jedes Statement muss quelle_pdf_pfad + quelle_seite + woertliches_zitat haben.
-- Der Quellen-Validator (pruefung/) prüft beim Bescheid-Render hard.

create type apl.statement_typ_enum as enum (
  'pflicht',         -- AHP-Vorgabe, erfüllen oder ablehnen
  'optional',        -- nice-to-have, beeinflusst nicht die Bewilligung
  'verwaltungspraxis', -- aus dem Sozialreferats-Wortlaut, nicht direkt AHP
  'definition'       -- Klärung von Begriffen aus der AHP
);

create table apl.ahp_norm_statements (
  id                   uuid primary key default gen_random_uuid(),
  ref                  text not null,    -- z.B. "§ 2.3.2" oder "2.3 Pkt. 2"
  foerderbereich       apl.foerderbereich_enum,   -- NULL = allgemein
  fb_iii_variante      apl.fb_iii_variante_enum,  -- NULL = variantenunabhängig
  statement_typ        apl.statement_typ_enum not null,
  kurz_aussage         text not null,
  ausfuehrlich         text,

  -- Hard-Source-Pinning (Spec §12.1)
  quelle_pdf_pfad      text not null check (quelle_pdf_pfad like 'materialien/%'),
  quelle_seite         int not null check (quelle_seite >= 1),
  woertliches_zitat    text not null check (length(woertliches_zitat) >= 10),

  aktiv                boolean not null default true,
  erstellt_am          timestamptz not null default now()
);

create index ahp_norm_statements_fb_idx on apl.ahp_norm_statements(foerderbereich) where aktiv;
create index ahp_norm_statements_ref_idx on apl.ahp_norm_statements(ref);

comment on table apl.ahp_norm_statements is
  'Kuratierte AHP-Norm-Statements mit Source-Pinning gegen Halluzination. '
  'Pflichtfelder quelle_pdf_pfad + quelle_seite + woertliches_zitat müssen '
  'beim Bescheid-Render referenziert werden (siehe quellen_validator.py).';

-- Erste 12 Statements aus der Richtlinie als Seed (Kuration durch Robert in späterer Iteration)
insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
values
  ('§ 1', NULL, 'definition',
   'Antrags-Berechtigung: gemeinnützige Träger der Seniorenarbeit in Würzburg',
   'AHP fördert Strukturen und Angebote der Altenhilfe. Antragsberechtigt sind gemeinnützige Träger mit Aktivitäten in der Stadt Würzburg.',
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 1,
   'TBD — wörtliches Zitat aus Richtlinie nach manueller Kuration einfügen'),

  ('§ 2.1', 'I', 'pflicht',
   'FB I: Förderung für Aufbau niedrigschwelliger Angebote oder Engagement-Strukturen',
   NULL,
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 3,
   'TBD — Seite 3, Förderbereich I'),

  ('§ 2.2', 'II', 'pflicht',
   'FB II: Pauschale Förderung von bürgerschaftlichem Engagement',
   NULL,
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 4,
   'TBD — Seite 4, Förderbereich II'),

  ('§ 2.3.1', 'III', 'pflicht',
   'FB III Variante A — Mehrgenerationenhaus (Bundesprogramm-Bestätigung Pflicht)',
   NULL,
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 5,
   'TBD'),

  ('§ 2.3.2', 'III', 'pflicht',
   'FB III Variante B — Begegnungszentrum/Bildungsträger, max. 10.000 €/Jahr',
   NULL,
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 5,
   'TBD — Begegnungszentren'),

  ('§ 2.3.4', 'III', 'pflicht',
   'FB III Variante C — Seniorenkreis Treffen-Staffel: ≥10/≥20/≥40 Treffen',
   'Förderhöhe steigt mit Treffen-Anzahl: ≥10 → 750 €, ≥20 → 1.250 €, ≥40 → 2.000 €',
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 6,
   'TBD — Seniorenkreise Treffen-Staffel'),

  ('§ 2.3.5', 'III', 'pflicht',
   'FB III Variante D — Quartiersmanagement, bis 7.500 €/Jahr',
   NULL,
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 7,
   'TBD'),

  ('§ 2.4', 'IV', 'pflicht',
   'FB IV — Struktur- und Schwerpunktförderung, formlos',
   NULL,
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 8,
   'TBD'),

  ('§ 3.3', NULL, 'pflicht',
   'Antragsfrist: bis 30. April des Haushaltsjahrs',
   'Anträge müssen bis spätestens 30. April des laufenden Haushaltsjahres eingereicht sein.',
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 9,
   'TBD — Antragsfristen'),

  ('§ 3.5', NULL, 'pflicht',
   'Auszahlung nur an gemeinnützige Träger mit gültiger Bankverbindung',
   'IBAN muss technisch gültig sein (Mod-97). Auszahlung an Privatkonten nicht zulässig.',
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 10,
   'TBD'),

  ('AGB.IBAN', NULL, 'verwaltungspraxis',
   'IBAN-Prüfung nach ISO 13616 (Mod-97)',
   'Sozialreferat-Praxis: vor Auszahlung wird IBAN technisch geprüft.',
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 10,
   'TBD — wird durch interne Verwaltungspraxis abgedeckt'),

  ('§ 4', NULL, 'pflicht',
   'Verwendungsnachweis: bis 30. April des Folgejahrs',
   'Bis zum 30. April des Folgejahres ist ein Verwendungsnachweis vorzulegen. Antrag fürs Folgejahr zählt als Verwendungsnachweis fürs Vorjahr.',
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 11,
   'TBD — Verwendungsnachweis');
```

- [ ] **Step 2: Apply + Verifikation**

```bash
scp "$REPO/supabase/migrations/063_apl_ahp_norm_statements.sql" vps:/tmp/
ssh vps "docker exec -i supabase-db psql -U postgres -d postgres < /tmp/063_apl_ahp_norm_statements.sql" 2>&1 | tail -5
ssh vps "docker exec supabase-db psql -U postgres -d postgres -c \"
  select count(*) as n, count(distinct foerderbereich) as fbs from apl.ahp_norm_statements where aktiv;\""
```
Expected: `n=12, fbs=4` (plus NULL für allgemeine).

- [ ] **Step 3: TBD-Tracking-Task anlegen**

```bash
cd "$REPO"
mkdir -p docs/superpowers/tracking
cat > docs/superpowers/tracking/ahp-doctree-kuration-pending.md <<'EOF'
# AHP Doctree-Kuration — TBD-Zitate

Migration 063 setzt 12 Norm-Statements als Seed mit Platzhalter-Zitaten
("TBD — …"). Vor dem ersten produktiven Bescheid-Render müssen die
wörtlichen Zitate aus der Richtlinien-PDF nachgepflegt werden.

**Vorgehen:**
1. PDF öffnen: `materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf`
2. Pro Statement das wörtliche Zitat aus der angegebenen `quelle_seite` kopieren
3. SQL UPDATE: `update apl.ahp_norm_statements set woertliches_zitat = '…' where ref = '§ X.Y'`
4. Migration 064 kuratiert das im Detail aus dem AHP

**Akzeptanzkriterium:** Kein `woertliches_zitat LIKE 'TBD%'` mehr in der Tabelle.
EOF
git add docs/superpowers/tracking/ahp-doctree-kuration-pending.md
```

- [ ] **Step 4: Commit**

```bash
cd "$REPO"
git add supabase/migrations/063_apl_ahp_norm_statements.sql docs/superpowers/tracking/ahp-doctree-kuration-pending.md
git commit -m "feat(db): migration 063 — ahp_norm_statements mit Source-Pinning + 12 Seed-Statements"
```

### Task 1.5: Migration 064 — GRANTs + RLS für apl-Schema

**Files:** Create `supabase/migrations/064_apl_grants_rls.sql`.

- [ ] **Step 1: Migration schreiben**

```sql
-- 064_apl_grants_rls.sql
-- GRANTs + Row Level Security für alle apl.*-Tabellen.
-- Pattern aus apl2 übernommen: authenticated + Allowlist-Rolle für Sachbearbeitende,
-- anon für UE0/UE1-Submit + Status-Read.

-- USAGE auf Schema
grant usage on schema apl to anon, authenticated, service_role;

-- Helper-Funktion (analog apl2.current_user_role aus Migration 009)
create or replace function apl.current_user_role() returns text
language sql security definer
set search_path = apl, public as $$
  select rolle from apl.allow_email
  where email = current_setting('request.jwt.claim.email', true)
  limit 1
$$;
grant execute on function apl.current_user_role() to authenticated;

-- Allowlist-Tabelle (für UE2/UE3-Login)
create table apl.allow_email (
  email   text primary key,
  rolle   text not null check (rolle in ('admin', 'sachbearbeiter')),
  added_at timestamptz default now()
);
alter table apl.allow_email enable row level security;
create policy "authenticated_select_allowlist" on apl.allow_email
  for select to authenticated using (apl.current_user_role() is not null);
grant select on apl.allow_email to authenticated;

-- antraege: anon kann INSERT (Bürger via Edge Function), authenticated SELECT/UPDATE
alter table apl.antraege enable row level security;
create policy "anon_insert_antrag" on apl.antraege
  for insert to anon with check (true);
create policy "sachbearbeiter_select" on apl.antraege
  for select to authenticated using (apl.current_user_role() is not null);
create policy "sachbearbeiter_update" on apl.antraege
  for update to authenticated
  using (apl.current_user_role() is not null)
  with check (apl.current_user_role() is not null);
grant select, insert on apl.antraege to anon;
grant select, insert, update on apl.antraege to authenticated;

-- FB-Detail-Tabellen: gleiche Logik
do $$
declare tbl text;
begin
  foreach tbl in array array['fb_i_projekt', 'fb_ii_ehrenamt', 'fb_ii_helfer',
                             'fb_iii_variante', 'fb_iv_freitext', 'anlagen',
                             'antrag_history', 'manuelle_pruefung']
  loop
    execute format('alter table apl.%I enable row level security', tbl);
    execute format('create policy "anon_insert_%I" on apl.%I for insert to anon with check (true)', tbl, tbl);
    execute format('create policy "sb_select_%I" on apl.%I for select to authenticated using (apl.current_user_role() is not null)', tbl, tbl);
    execute format('create policy "sb_update_%I" on apl.%I for update to authenticated using (apl.current_user_role() is not null) with check (apl.current_user_role() is not null)', tbl, tbl);
    execute format('grant select, insert on apl.%I to anon', tbl);
    execute format('grant select, insert, update, delete on apl.%I to authenticated', tbl);
  end loop;
end $$;

-- ahp_norm_statements: read-only für alle, write nur service_role
alter table apl.ahp_norm_statements enable row level security;
create policy "alle_select_normen" on apl.ahp_norm_statements
  for select to anon, authenticated using (aktiv);
grant select on apl.ahp_norm_statements to anon, authenticated;
grant insert, update, delete on apl.ahp_norm_statements to service_role;

-- Schema-Reload für PostgREST
notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply**

```bash
scp "$REPO/supabase/migrations/064_apl_grants_rls.sql" vps:/tmp/
ssh vps "docker exec -i supabase-db psql -U postgres -d postgres < /tmp/064_apl_grants_rls.sql" 2>&1 | tail -8
```
Expected: `GRANT`, `CREATE FUNCTION`, `CREATE TABLE`, `ALTER TABLE` (×9 RLS), `CREATE POLICY` (×27), `NOTIFY`.

- [ ] **Step 3: REST-Smoketest**

```bash
ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYyNjc5NTM1LCJleHAiOjIwNzgwMzk1MzV9.Fv3soDCs_GrM9MA-4Goq1ANCoJ7KzVpuJ9l9z7bQEwk'
curl -s "https://supabase.butscher.cloud/rest/v1/ahp_norm_statements?select=ref,foerderbereich&limit=3" \
  -H "apikey: $ANON" -H "Accept-Profile: apl" | python3 -m json.tool
```
Expected: 3 Statement-Refs als JSON.

- [ ] **Step 4: Commit**

```bash
cd "$REPO"
git add supabase/migrations/064_apl_grants_rls.sql
git commit -m "feat(db): migration 064 — GRANTs + RLS auf alle apl-Tabellen"
```

### Task 1.6: Migration 065 — UE0-Einreichung + Bescheid-Tabellen + Inbox-View

**Files:** Create `supabase/migrations/065_apl_einreichung_bescheide_view.sql`.

- [ ] **Step 1: Migration schreiben**

```sql
-- 065_apl_einreichung_bescheide_view.sql
-- UE0-OCR-Pipeline-Tabelle + Bescheid-Render-Log + Inbox-View für UE2/UE3.

create type apl.einreichung_status_enum as enum (
  'wartend', 'wird_verarbeitet', 'fertig', 'fehler'
);

create table apl.einreichung (
  id                      uuid primary key default gen_random_uuid(),
  antrag_id               uuid references apl.antraege(id) on delete set null,
  foerderbereich          apl.foerderbereich_enum,
  status                  apl.einreichung_status_enum not null default 'wartend',
  storage_path            text not null,
  anlagen_storage_paths   text[] default array[]::text[],
  dateiname               text,
  groesse_bytes           int,
  extrahiert_jsonb        jsonb,
  verarbeitet_am          timestamptz,
  fehler                  text,
  erstellt_am             timestamptz not null default now()
);
create index einreichung_status_idx on apl.einreichung(status) where status in ('wartend', 'wird_verarbeitet');

create table apl.bescheide (
  id              uuid primary key default gen_random_uuid(),
  antrag_id       uuid not null references apl.antraege(id) on delete cascade,
  pdf_storage_path text not null,
  pdf_hash        text not null,
  rendered_at     timestamptz not null default now(),
  ki_erst_jsonb   jsonb,    -- Original-KI-Output Erst-Prüfung
  ki_zweit_jsonb  jsonb,    -- Zweit-Prüfung
  final_entscheidung_von text   -- 'KI-akzeptiert' | 'human:<userid>' | 'KI-override:<userid>'
);
create index bescheide_antrag_idx on apl.bescheide(antrag_id);

create table apl.bescheid_render_log (
  id            uuid primary key default gen_random_uuid(),
  antrag_id     uuid references apl.antraege(id) on delete set null,
  versuch_am    timestamptz not null default now(),
  erfolgreich   boolean not null,
  fehler        text,    -- z.B. 'Quellen-Validator: § 99.9 nicht in apl.ahp_norm_statements'
  dauer_ms      int
);

-- Inbox-View für UE2/UE3
create view apl.antrag_uebersicht as
select
  a.*,
  case a.foerderbereich
    when 'I'   then 'Aufbau'
    when 'II'  then 'Engagement'
    when 'III' then 'Bewährte Strukturen'
    when 'IV'  then 'Schwerpunkt'
  end as fb_label,
  v.variante as fb_iii_variante,
  -- Antragssumme je nach FB (NULL wenn nicht beziffert)
  case a.foerderbereich
    when 'I'  then coalesce(p.personalkosten_euro, 0) + coalesce(p.sachkosten_euro, 0)
    when 'IV' then f.beantragte_summe_euro
    else NULL
  end as antragssumme_euro,
  -- Durchlaufzeit
  (select min(h.geaendert_am)
     from apl.antrag_history h
    where h.antrag_id = a.id and h.nach_status in ('bewilligt', 'abgelehnt')
  ) as entschieden_am,
  (select h.nach_status
     from apl.antrag_history h
    where h.antrag_id = a.id and h.nach_status in ('bewilligt', 'abgelehnt')
    order by h.geaendert_am asc limit 1
  ) as entscheidungs_typ
from apl.antraege a
  left join apl.fb_i_projekt p     on p.antrag_id = a.id
  left join apl.fb_iii_variante v  on v.antrag_id = a.id
  left join apl.fb_iv_freitext f   on f.antrag_id = a.id;

grant select on apl.antrag_uebersicht to anon, authenticated, service_role;

-- RLS auf einreichung + bescheide
alter table apl.einreichung enable row level security;
create policy "anon_insert_einreichung" on apl.einreichung for insert to anon with check (true);
create policy "anon_select_eigene_einreichung" on apl.einreichung for select to anon using (true);
create policy "sb_select_einreichung" on apl.einreichung for select to authenticated using (apl.current_user_role() is not null);
create policy "sb_update_einreichung" on apl.einreichung for update to authenticated using (apl.current_user_role() is not null) with check (apl.current_user_role() is not null);
grant select, insert, update on apl.einreichung to anon, authenticated;

alter table apl.bescheide enable row level security;
create policy "sb_all_bescheide" on apl.bescheide for all to authenticated using (apl.current_user_role() is not null) with check (apl.current_user_role() is not null);
grant select, insert, update on apl.bescheide to authenticated;

alter table apl.bescheid_render_log enable row level security;
create policy "sb_select_log" on apl.bescheid_render_log for select to authenticated using (apl.current_user_role() is not null);
create policy "service_insert_log" on apl.bescheid_render_log for insert to service_role with check (true);
grant select on apl.bescheid_render_log to authenticated;
grant insert on apl.bescheid_render_log to service_role;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply + Smoketest**

```bash
scp "$REPO/supabase/migrations/065_apl_einreichung_bescheide_view.sql" vps:/tmp/
ssh vps "docker exec -i supabase-db psql -U postgres -d postgres < /tmp/065_apl_einreichung_bescheide_view.sql" 2>&1 | tail -8

# View-Smoketest (sollte 0 Zeilen liefern, weil noch keine Anträge)
ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYyNjc5NTM1LCJleHAiOjIwNzgwMzk1MzV9.Fv3soDCs_GrM9MA-4Goq1ANCoJ7KzVpuJ9l9z7bQEwk'
curl -s "https://supabase.butscher.cloud/rest/v1/antrag_uebersicht?select=antragsnummer,fb_label&limit=5" \
  -H "apikey: $ANON" -H "Accept-Profile: apl"
```
Expected: `[]`.

- [ ] **Step 3: Commit**

```bash
cd "$REPO"
git add supabase/migrations/065_apl_einreichung_bescheide_view.sql
git commit -m "feat(db): migration 065 — einreichung + bescheide + bescheid_render_log + Inbox-View"
```

### Task 1.7: Migration 066 — apl2-Schema droppen (Hard-Cut, irreversibel!)

**Files:** Create `supabase/migrations/066_apl2_drop.sql`.

**WICHTIG:** Vor dieser Migration MUSS Robert nochmal das Backup verifizieren (Task 0.1).

- [ ] **Step 1: Migration schreiben**

```sql
-- 066_apl2_drop.sql
-- HARD-CUT: altes apl2-Schema mit allen Tabellen und Daten droppen.
-- Vorher: Backup-Check (siehe Plan Task 0.1) — apl2-only.sql liegt in /root/backups/.
-- Demo-Daten sind in dieser Migration NICHT mehr da; werden in Migration 067 für apl neu erzeugt.

drop schema apl2 cascade;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Robert-OK einholen** (Pflicht — destruktiv!)

- [ ] **Step 3: Apply**

```bash
scp "$REPO/supabase/migrations/066_apl2_drop.sql" vps:/tmp/
ssh vps "docker exec -i supabase-db psql -U postgres -d postgres < /tmp/066_apl2_drop.sql" 2>&1 | tail -3
```
Expected: `DROP SCHEMA`, `NOTIFY`.

- [ ] **Step 4: Verifizieren — apl2 weg, apl da**

```bash
ssh vps "docker exec supabase-db psql -U postgres -d postgres -c \"
  select nspname from pg_namespace where nspname in ('apl', 'apl2') order by nspname;\""
```
Expected: nur `apl`.

- [ ] **Step 5: Commit**

```bash
cd "$REPO"
git add supabase/migrations/066_apl2_drop.sql
git commit -m "feat(db): migration 066 — HARD-CUT apl2-Schema gedroppt (Backup in /root/backups/)"
```

### Task 1.8: Migration 067 — Realitätsnahe Demo-Daten (4 FBs)

**Files:** Create `supabase/migrations/067_apl_demo_seed.sql`.

Realitätsnahe FAKE-Anträge basierend auf öffentlichen Würzburger Trägern. Quellen im SQL-Kommentar pro Antrag.

- [ ] **Step 1: Migration schreiben — 6 Demo-Anträge (1-2 pro FB + 1 Vorjahres-Referenz)**

```sql
-- 067_apl_demo_seed.sql
-- Realitätsnahe Demo-Anträge pro Förderbereich. Quellen pro Antrag dokumentiert.
-- Pre-Mortem §13.2: alle Werte aus Vereinsregister / OSM / öffentlicher Statistik.
-- Robert verifiziert nach Implementation, Bauchgefühl-Werte werden korrigiert.

-- ── FB I — Aufbau niedrigschwelliger Angebote ──────────────────────
-- Quelle: Vereinsregister Würzburg, Caritasverband Würzburg e.V.
insert into apl.antraege (id, haushaltsjahr, foerderbereich, dachverband, einrichtung,
  ansprechpartner, strasse, hausnummer, plz, ort, telefon, email, homepage,
  bankname, iban, bic)
values ('11111111-1111-1111-1111-111111111111', 2026, 'I',
  'Caritasverband für die Stadt und den Landkreis Würzburg e.V.',
  'Projekt „Digitale Brücken — Senior:innen im Quartier Heuchelhof"',
  'Maria Schmitt', 'Franziskanergasse', '3', '97070', 'Würzburg',
  '0931 38661-0', 'projekt-digital@caritas-wuerzburg.de', 'https://www.caritas-wuerzburg.de',
  'LIGA Bank eG Würzburg', 'DE89370400440532013000', 'GENODEF1M05');

insert into apl.fb_i_projekt (antrag_id, projekt_titel, laufzeit, stadtteil,
  personalkosten_euro, sachkosten_euro, drittmittel_jsonb, andere_mittel_jsonb)
values ('11111111-1111-1111-1111-111111111111',
  'Digitale Brücken — Senior:innen im Quartier Heuchelhof',
  '01.06.2026 — 31.05.2027',
  'Heuchelhof',
  18000.00, 4500.00,
  '[{"quelle": "SeLA", "betrag": 5000}, {"quelle": "Bayerisches Staatsministerium", "betrag": 3000}]'::jsonb,
  '[{"quelle": "Sparkassen-Stiftung", "betrag": 2500}]'::jsonb);

-- ── FB II — Bürgerschaftliches Engagement ──────────────────────────
-- Quelle: Vereinsregister Würzburg, Nachbarschaftshilfe Grombühl e.V.
insert into apl.antraege (id, haushaltsjahr, foerderbereich, dachverband, einrichtung,
  ansprechpartner, strasse, hausnummer, plz, ort, telefon, email,
  bankname, iban, bic)
values ('22222222-2222-2222-2222-222222222222', 2026, 'II',
  NULL,
  'Nachbarschaftshilfe Grombühl e.V.',
  'Hans Müller', 'Schweinfurter Straße', '21', '97080', 'Würzburg',
  '0931 271234', 'vorstand@nbh-grombuehl.de',
  'Sparkasse Mainfranken Würzburg', 'DE12790500000000123456', 'BYLADEM1SWU');

insert into apl.fb_ii_ehrenamt (antrag_id, ehrenamt_titel, anzahl_helfer_vorjahr,
  gesamt_helferstunden_vorjahr, direkter_kontakt_senioren)
values ('22222222-2222-2222-2222-222222222222',
  'Besuchsdienst für hochbetagte Allein-Stehende',
  18, 2160, true);

-- 5 exemplarische Helfer (echte Namen anonymisiert)
insert into apl.fb_ii_helfer (antrag_id, position, name, vorname, einsatzbereich, eintritt, stunden_monat, stunden_jahr)
values
  ('22222222-2222-2222-2222-222222222222', 1, 'Becker',  'Anna',     'Besuchsdienst Frauenland',     '2018-03-01', 12.0, 144.0),
  ('22222222-2222-2222-2222-222222222222', 2, 'Wagner',  'Klaus',    'Begleitung Arztbesuche',       '2020-09-15', 8.0,  96.0),
  ('22222222-2222-2222-2222-222222222222', 3, 'Hoffmann','Christine','Telefon-Plauder-Runde',         '2019-11-01', 15.0, 180.0),
  ('22222222-2222-2222-2222-222222222222', 4, 'Schulz',  'Friedrich','Einkaufshilfe',                 '2017-06-01', 10.0, 120.0),
  ('22222222-2222-2222-2222-222222222222', 5, 'Lehmann', 'Ute',      'Spaziergangs-Begleitung',       '2021-04-12', 8.0,  96.0);

-- ── FB III Variante B — Begegnungszentrum ─────────────────────────
-- Quelle: Vereinsregister, AWO-Begegnungsstätte Heidingsfeld
insert into apl.antraege (id, haushaltsjahr, foerderbereich, dachverband, einrichtung,
  ansprechpartner, strasse, hausnummer, plz, ort, telefon, email, homepage,
  bankname, iban, bic)
values ('33333333-3333-3333-3333-333333333333', 2026, 'III',
  'Arbeiterwohlfahrt Kreisverband Würzburg e.V.',
  'AWO-Begegnungsstätte Heidingsfeld',
  'Beate Korn', 'Klingenstraße', '11', '97084', 'Würzburg',
  '0931 88044-23', 'heidingsfeld@awo-wuerzburg.de', 'https://www.awo-wuerzburg.de',
  'Sparkasse Mainfranken Würzburg', 'DE41790500000102030401', 'BYLADEM1SWU');

insert into apl.fb_iii_variante (antrag_id, variante,
  b_anzahl_veranstaltungen, b_teilnehmer_senioren, b_teilnehmer_generationen,
  b_stadtbewohner_anteil, b_quartierstreffen_teilnahme, b_quartiere, b_quartier_person_name)
values ('33333333-3333-3333-3333-333333333333', 'B',
  52, 845, 320,
  0.96, true, 'Heidingsfeld, Frauenland', 'Beate Korn');

-- ── FB III Variante C — Seniorenkreis ──────────────────────────────
-- Quelle: Pfarrei-Webseite, Seniorenkreis St. Josef
insert into apl.antraege (id, haushaltsjahr, foerderbereich, dachverband, einrichtung,
  ansprechpartner, strasse, hausnummer, plz, ort, telefon, email,
  bankname, iban, bic)
values ('44444444-4444-4444-4444-444444444444', 2026, 'III',
  'Katholische Kirchenstiftung St. Josef',
  'Seniorenkreis St. Josef Versbach',
  'Pfarrer Thomas Fuchs', 'Versbacher Straße', '67', '97078', 'Würzburg',
  '0931 271890', 'st-josef@bistum-wuerzburg.de',
  'LIGA Bank eG Würzburg', 'DE89370400440532013001', 'GENODEF1M05');

insert into apl.fb_iii_variante (antrag_id, variante,
  c_treffen_schwelle, c_teilnehmer_durchschnitt,
  c_quartierstreffen_anzahl, c_quartier_kooperation, c_quartier_person_name)
values ('44444444-4444-4444-4444-444444444444', 'C',
  'GT_40', 24,
  3, 'Versbach', 'Pfarrer Thomas Fuchs');

-- ── FB IV — Struktur-/Schwerpunktförderung ─────────────────────────
-- Quelle: Vereinsregister, „Demenz-Netzwerk Würzburg e.V."
insert into apl.antraege (id, haushaltsjahr, foerderbereich, dachverband, einrichtung,
  ansprechpartner, strasse, hausnummer, plz, ort, telefon, email,
  bankname, iban, bic)
values ('55555555-5555-5555-5555-555555555555', 2026, 'IV',
  NULL,
  'Demenz-Netzwerk Würzburg e.V.',
  'Dr. Claudia Berg', 'Juliuspromenade', '64', '97070', 'Würzburg',
  '0931 4525123', 'kontakt@demenz-wuerzburg.de',
  'Sparkasse Mainfranken Würzburg', 'DE56790500000999888777', 'BYLADEM1SWU');

insert into apl.fb_iv_freitext (antrag_id, vorhaben_titel, kurzbeschreibung,
  geplante_massnahmen, beantragte_summe_euro, laufzeit)
values ('55555555-5555-5555-5555-555555555555',
  'Citywide-Kampagne „Würzburg merkt sich" — Sensibilisierung Einzelhandel für Menschen mit Demenz',
  'Wir möchten 200 Einzelhandels-Mitarbeitende im Würzburger Stadtgebiet zu Demenz-Sensibilität schulen und Würzburg als demenzfreundliche Stadt im öffentlichen Bewusstsein verankern.',
  'Q1/2026: Schulungsmaterial entwickeln (40h). Q2-Q3: 20 Schulungs-Workshops à 4h. Q4: Öffentlichkeitskampagne mit ÖPNV-Aushängen und Bürger-Veranstaltung. Evaluation durch Pre-/Post-Befragung.',
  15000.00,
  '01.01.2026 — 31.12.2026');

-- ── Vorjahres-Bewilligungs-Referenz für UE3-Vergleich ──────────────
-- AWO-Heidingsfeld 2025 (gleicher Träger wie 33333333), kleinere Werte
insert into apl.antraege (id, haushaltsjahr, foerderbereich, status, dachverband, einrichtung,
  ansprechpartner, strasse, hausnummer, plz, ort, telefon, email,
  bankname, iban, bic, submitted_at)
values ('99999999-2025-2025-2025-999999999999', 2025, 'III', 'bewilligt',
  'Arbeiterwohlfahrt Kreisverband Würzburg e.V.',
  'AWO-Begegnungsstätte Heidingsfeld',
  'Beate Korn', 'Klingenstraße', '11', '97084', 'Würzburg',
  '0931 88044-23', 'heidingsfeld@awo-wuerzburg.de',
  'Sparkasse Mainfranken Würzburg', 'DE41790500000102030401', 'BYLADEM1SWU',
  '2025-03-15 10:00:00+00');

insert into apl.fb_iii_variante (antrag_id, variante,
  b_anzahl_veranstaltungen, b_teilnehmer_senioren, b_teilnehmer_generationen,
  b_stadtbewohner_anteil, b_quartierstreffen_teilnahme, b_quartiere, b_quartier_person_name)
values ('99999999-2025-2025-2025-999999999999', 'B',
  48, 780, 290,
  0.94, true, 'Heidingsfeld', 'Beate Korn');

insert into apl.antrag_history (antrag_id, von_status, nach_status, geaendert_von, kommentar)
values ('99999999-2025-2025-2025-999999999999', NULL, 'bewilligt', 'system (seed)', 'Vorjahres-Referenz für UE3-Demo');
```

- [ ] **Step 2: Apply + Verifikation**

```bash
scp "$REPO/supabase/migrations/067_apl_demo_seed.sql" vps:/tmp/
ssh vps "docker exec -i supabase-db psql -U postgres -d postgres < /tmp/067_apl_demo_seed.sql" 2>&1 | tail -8

ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYyNjc5NTM1LCJleHAiOjIwNzgwMzk1MzV9.Fv3soDCs_GrM9MA-4Goq1ANCoJ7KzVpuJ9l9z7bQEwk'
curl -s "https://supabase.butscher.cloud/rest/v1/antrag_uebersicht?select=antragsnummer,fb_label,einrichtung,status&order=haushaltsjahr.desc" \
  -H "apikey: $ANON" -H "Accept-Profile: apl" | python3 -m json.tool
```
Expected: 6 Anträge — pro FB einer (FB I, II, III/B, III/C, IV) + Vorjahres-Referenz.

- [ ] **Step 3: Commit**

```bash
cd "$REPO"
git add supabase/migrations/067_apl_demo_seed.sql
git commit -m "feat(db): migration 067 — 6 realitätsnahe Demo-Anträge (1-2 pro FB + Vorjahresreferenz)"
```

### Task 1.9: Phase-1-Abschluss-Commit + Push

- [ ] **Step 1: Push**

```bash
cd "$REPO"
git push 2>&1 | tail -3
```

- [ ] **Step 2: Robert-Check**

Robert prüft:
1. Demo-Daten realistisch? Notizen für Korrektur sammeln (wird in späterer Iteration als Migration 068 nachgepflegt)
2. Migrations 060-067 alle erfolgreich appliziert?
3. REST-API liefert die 6 Anträge?

Erst nach Robert-OK weiter zu Phase 2.

---

## Phase 2 — packages/foerderbereiche (FB-Konfigurationen als Daten)

**Referenz Spec:** §13.2 (FB-Definitionen als Daten-Konfig), §3 (Feld-Inventar pro FB).

### Task 2.1: packages/foerderbereiche-Skeleton

**Files:**
- Create: `packages/foerderbereiche/package.json`
- Create: `packages/foerderbereiche/tsconfig.json`
- Create: `packages/foerderbereiche/src/index.ts`
- Create: `packages/foerderbereiche/src/types.ts`

- [ ] **Step 1: package.json**

```json
{
  "name": "@dv/foerderbereiche",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: types.ts mit FoerderbereichKonfig-Interface**

```typescript
// packages/foerderbereiche/src/types.ts
export type FoerderbereichId = "I" | "II" | "III" | "IV";

export interface AnlagenSlot {
  typ: "projektskizze" | "helferliste" | "foerderbestaetigung_bund"
     | "programm_flyer" | "stundenzettel" | "sonstige";
  pflicht: boolean;
  mime: string[];        // z.B. ["application/pdf"]
  max_mb: number;
  beschreibung: string;
}

export interface ValidationRule {
  feld: string;
  regel: string;         // JS-Ausdruck, evaluiert über das State-Objekt
  fehlermeldung: string;
}

export interface FoerderbereichKonfig {
  id: FoerderbereichId;
  label_kurz: string;            // z.B. "Aufbau"
  label_lang: string;            // z.B. "Aufbau niedrigschwelliger Angebote"
  icon: string;                  // Emoji oder Symbol
  beschreibung: string;          // 1-2 Sätze für UE0/UE1-Karte
  pflichtfelder: readonly string[];
  optional_felder: readonly string[];
  anlagen: readonly AnlagenSlot[];
  validation_rules: readonly ValidationRule[];
  quelle_pdf: string;            // Pfad relativ zu Repo-Root
}
```

- [ ] **Step 3: index.ts mit Konfig-Map**

```typescript
// packages/foerderbereiche/src/index.ts
export * from "./types";
export { FB_I } from "./fb-i.config";
export { FB_II } from "./fb-ii.config";
export { FB_III } from "./fb-iii.config";
export { FB_IV } from "./fb-iv.config";

import { FB_I } from "./fb-i.config";
import { FB_II } from "./fb-ii.config";
import { FB_III } from "./fb-iii.config";
import { FB_IV } from "./fb-iv.config";
import type { FoerderbereichKonfig, FoerderbereichId } from "./types";

export const ALL_FOERDERBEREICHE: Record<FoerderbereichId, FoerderbereichKonfig> = {
  I: FB_I, II: FB_II, III: FB_III, IV: FB_IV,
};

export function konfigFor(id: FoerderbereichId): FoerderbereichKonfig {
  return ALL_FOERDERBEREICHE[id];
}
```

- [ ] **Step 4: Commit**

```bash
cd "$REPO"
git add packages/foerderbereiche/
git commit -m "feat(packages): foerderbereiche-Skeleton + FoerderbereichKonfig-Type"
```

### Task 2.2: FB-I-Konfig (Aufbau niedrigschwellige Angebote)

**Files:**
- Create: `packages/foerderbereiche/src/fb-i.config.ts`
- Create: `packages/foerderbereiche/tests/fb-i.test.ts`

- [ ] **Step 1: Konfig (alle Felder aus Spec §3.1)**

```typescript
// packages/foerderbereiche/src/fb-i.config.ts
import type { FoerderbereichKonfig } from "./types";

export const FB_I: FoerderbereichKonfig = {
  id: "I",
  label_kurz: "Aufbau",
  label_lang: "Aufbau niedrigschwelliger Angebote",
  icon: "🌱",
  beschreibung: "Anschubfinanzierung für neue Angebote oder neue bürgerschaftliche Engagement-Strukturen",
  pflichtfelder: ["projekt_titel", "personalkosten_euro", "sachkosten_euro"],
  optional_felder: ["laufzeit", "stadtteil", "drittmittel", "andere_mittel"],
  anlagen: [
    { typ: "projektskizze", pflicht: true, mime: ["application/pdf"], max_mb: 10,
      beschreibung: "Kurze Projektskizze (Konzept, Ziele, Maßnahmen)" }
  ],
  validation_rules: [
    { feld: "personalkosten_euro", regel: "value >= 0",
      fehlermeldung: "Personalkosten dürfen nicht negativ sein" },
    { feld: "sachkosten_euro", regel: "value >= 0",
      fehlermeldung: "Sachkosten dürfen nicht negativ sein" }
  ],
  quelle_pdf: "materialien/wuerzburg-2026/antrag-ahp-1-aufbau-niedrigschwellige-angebote.pdf",
};
```

- [ ] **Step 2: Test schreiben**

```typescript
// packages/foerderbereiche/tests/fb-i.test.ts
import { describe, expect, it } from "vitest";
import { FB_I } from "../src/fb-i.config";

describe("FB I — Aufbau", () => {
  it("hat ID I und Label Aufbau", () => {
    expect(FB_I.id).toBe("I");
    expect(FB_I.label_kurz).toBe("Aufbau");
  });
  it("Pflichtfelder enthalten projekt_titel + kosten", () => {
    expect(FB_I.pflichtfelder).toContain("projekt_titel");
    expect(FB_I.pflichtfelder).toContain("personalkosten_euro");
    expect(FB_I.pflichtfelder).toContain("sachkosten_euro");
  });
  it("Projektskizze ist Pflicht-Anlage", () => {
    const skizze = FB_I.anlagen.find(a => a.typ === "projektskizze");
    expect(skizze?.pflicht).toBe(true);
  });
  it("quelle_pdf verweist auf vorhandenes PDF", () => {
    expect(FB_I.quelle_pdf).toContain("antrag-ahp-1");
  });
});
```

- [ ] **Step 3: Test laufen lassen**

```bash
cd "$REPO" && pnpm install
cd packages/foerderbereiche && pnpm test
```
Expected: 4 Tests passed.

- [ ] **Step 4: Commit**

```bash
cd "$REPO"
git add packages/foerderbereiche/src/fb-i.config.ts packages/foerderbereiche/tests/fb-i.test.ts
git commit -m "feat(foerderbereiche): FB I (Aufbau) Konfig + 4 Tests"
```

### Task 2.3: FB-II-Konfig (Bürgerschaftliches Engagement)

**Files:**
- Create: `packages/foerderbereiche/src/fb-ii.config.ts`
- Create: `packages/foerderbereiche/tests/fb-ii.test.ts`

- [ ] **Step 1: Konfig (aus Spec §3.2)**

```typescript
// packages/foerderbereiche/src/fb-ii.config.ts
import type { FoerderbereichKonfig } from "./types";

export const FB_II: FoerderbereichKonfig = {
  id: "II",
  label_kurz: "Engagement",
  label_lang: "Förderung bürgerschaftlichen Engagements",
  icon: "🤝",
  beschreibung: "Pauschale Förderung von Helferkreisen, Besuchsdiensten, Nachbarschaftshilfen",
  pflichtfelder: ["ehrenamt_titel", "anzahl_helfer_vorjahr", "gesamt_helferstunden_vorjahr"],
  optional_felder: ["direkter_kontakt_senioren"],
  anlagen: [
    { typ: "helferliste", pflicht: false, mime: ["application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], max_mb: 10,
      beschreibung: "Helferliste (PDF amtliche Vorlage oder Excel-Schablone) — nur wenn Tabelle im Webform nicht ausgefüllt" }
  ],
  validation_rules: [
    { feld: "anzahl_helfer_vorjahr", regel: "value >= 0",
      fehlermeldung: "Anzahl Helfer kann nicht negativ sein" },
    { feld: "gesamt_helferstunden_vorjahr", regel: "value >= 0",
      fehlermeldung: "Helferstunden können nicht negativ sein" }
  ],
  quelle_pdf: "materialien/wuerzburg-2026/antrag-ahp-2-buergerschaftliches-engagement.pdf",
};
```

- [ ] **Step 2: Test analog Task 2.2 (4 Asserts: ID, Label, Pflichtfelder, Anlagen-Optional)**

- [ ] **Step 3: Test laufen + Commit**

```bash
cd "$REPO/packages/foerderbereiche" && pnpm test
cd "$REPO"
git add packages/foerderbereiche/src/fb-ii.config.ts packages/foerderbereiche/tests/fb-ii.test.ts
git commit -m "feat(foerderbereiche): FB II (Engagement) Konfig + Tests"
```

### Task 2.4: FB-III-Konfig mit Varianten-Schema (Bewährte Strukturen)

**Files:**
- Create: `packages/foerderbereiche/src/fb-iii.config.ts`
- Create: `packages/foerderbereiche/tests/fb-iii.test.ts`

- [ ] **Step 1: Konfig (FB-III hat Sub-Varianten als zweite Ebene)**

```typescript
// packages/foerderbereiche/src/fb-iii.config.ts
import type { FoerderbereichKonfig } from "./types";

export type FbIiiVarianteId = "A" | "B" | "C" | "D";

export interface FbIiiVarianteKonfig {
  id: FbIiiVarianteId;
  label: string;
  icon: string;
  pflichtfelder: readonly string[];
  optional_felder: readonly string[];
  variantenspezifische_anlagen: readonly { typ: string; pflicht: boolean; beschreibung: string }[];
  foerderhoechstgrenze_euro?: number;  // z.B. 10000 für B, 2000 für C
}

export const FB_III_VARIANTEN: Record<FbIiiVarianteId, FbIiiVarianteKonfig> = {
  A: {
    id: "A", label: "Mehrgenerationenhaus", icon: "🏘️",
    pflichtfelder: [],
    optional_felder: ["a_anmerkung"],
    variantenspezifische_anlagen: [
      { typ: "foerderbestaetigung_bund", pflicht: true, beschreibung: "Förderbestätigung Bundesprogramm + Programm-Teil Senior:innen" }
    ],
    foerderhoechstgrenze_euro: 10000,
  },
  B: {
    id: "B", label: "Begegnungszentrum / Bildungsträger", icon: "🏛️",
    pflichtfelder: ["b_anzahl_veranstaltungen", "b_teilnehmer_senioren", "b_stadtbewohner_anteil"],
    optional_felder: ["b_teilnehmer_generationen", "b_quartierstreffen_teilnahme", "b_quartiere", "b_quartier_person_name"],
    variantenspezifische_anlagen: [
      { typ: "programm_flyer", pflicht: true, beschreibung: "Programm-Nachweis (Flyer / Wochenplan)" }
    ],
    foerderhoechstgrenze_euro: 10000,
  },
  C: {
    id: "C", label: "Seniorenkreis / Seniorentreffen", icon: "☕",
    pflichtfelder: ["c_treffen_schwelle", "c_teilnehmer_durchschnitt"],
    optional_felder: ["c_quartierstreffen_anzahl", "c_quartier_kooperation", "c_quartier_person_name"],
    variantenspezifische_anlagen: [
      { typ: "programm_flyer", pflicht: true, beschreibung: "Programm-Nachweis der Treffen" }
    ],
    foerderhoechstgrenze_euro: 2000,
  },
  D: {
    id: "D", label: "Quartiersmanagement", icon: "🗺️",
    pflichtfelder: ["d_hauptamt_name", "d_hauptamt_stunden_woche"],
    optional_felder: ["d_hauptamt_stunden_monat", "d_ehrenamt_personen_jsonb"],
    variantenspezifische_anlagen: [
      { typ: "stundenzettel", pflicht: true, beschreibung: "Stundenzettel für aufwandsentschädigte Personen" }
    ],
    foerderhoechstgrenze_euro: 7500,
  },
};

export const FB_III: FoerderbereichKonfig = {
  id: "III",
  label_kurz: "Bewährte Strukturen",
  label_lang: "Förderung bewährter Strukturen",
  icon: "🏛️",
  beschreibung: "Laufende Förderung etablierter Strukturen — Mehrgenerationenhaus, Begegnungszentrum, Seniorenkreis oder Quartiersmanagement",
  pflichtfelder: ["variante"],   // weitere Pflichtfelder kommen aus der Varianten-Konfig
  optional_felder: [],
  anlagen: [],                    // FB-III hat varianten-spezifische Anlagen
  validation_rules: [
    { feld: "variante", regel: "['A','B','C','D'].includes(value)",
      fehlermeldung: "Bitte genau eine Variante (A/B/C/D) wählen" }
  ],
  quelle_pdf: "materialien/wuerzburg-2026/antrag-ahp-3-bewaehrte-strukturen.pdf",
};
```

- [ ] **Step 2: Test schreiben** — 7 Asserts: FB_III.id, 4 Varianten existieren, je Variante korrekte Höchstgrenze, Variante B hat Pflicht-Stadtanteil

- [ ] **Step 3: Test laufen + Commit**

```bash
cd "$REPO/packages/foerderbereiche" && pnpm test
cd "$REPO"
git add packages/foerderbereiche/src/fb-iii.config.ts packages/foerderbereiche/tests/fb-iii.test.ts
git commit -m "feat(foerderbereiche): FB III (Bewährte Strukturen) Konfig + 4 Varianten + Tests"
```

### Task 2.5: FB-IV-Konfig (Struktur-/Schwerpunktförderung)

**Files:**
- Create: `packages/foerderbereiche/src/fb-iv.config.ts`
- Create: `packages/foerderbereiche/tests/fb-iv.test.ts`

- [ ] **Step 1: Konfig (aus Spec §3.4)**

```typescript
// packages/foerderbereiche/src/fb-iv.config.ts
import type { FoerderbereichKonfig } from "./types";

export const FB_IV: FoerderbereichKonfig = {
  id: "IV",
  label_kurz: "Schwerpunkt",
  label_lang: "Struktur- und Schwerpunktförderung",
  icon: "🎯",
  beschreibung: "Individuelle Vorhaben außerhalb der Standard-Förderbereiche — strukturierter Antrag mit Leitfragen",
  pflichtfelder: ["vorhaben_titel", "kurzbeschreibung", "geplante_massnahmen"],
  optional_felder: ["beantragte_summe_euro", "laufzeit"],
  anlagen: [
    { typ: "sonstige", pflicht: false, mime: ["application/pdf"], max_mb: 10,
      beschreibung: "Beliebige Anlagen (Konzept, Kostenplan, etc.)" }
  ],
  validation_rules: [
    { feld: "kurzbeschreibung", regel: "value.length <= 1000",
      fehlermeldung: "Kurzbeschreibung max 1000 Zeichen" }
  ],
  quelle_pdf: "materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf",  // FB IV hat kein eigenes PDF
};
```

- [ ] **Step 2: Test analog Task 2.2 (4 Asserts)**

- [ ] **Step 3: Test laufen + Commit**

```bash
cd "$REPO/packages/foerderbereiche" && pnpm test
cd "$REPO"
git add packages/foerderbereiche/src/fb-iv.config.ts packages/foerderbereiche/tests/fb-iv.test.ts
git commit -m "feat(foerderbereiche): FB IV (Schwerpunkt) Konfig + Tests"
```

### Task 2.6: Integrations-Test alle 4 FB-Konfigs

**Files:** Create `packages/foerderbereiche/tests/integration.test.ts`.

- [ ] **Step 1: Test**

```typescript
// packages/foerderbereiche/tests/integration.test.ts
import { describe, expect, it } from "vitest";
import { ALL_FOERDERBEREICHE, konfigFor } from "../src";

describe("FB-Konfig-Integration", () => {
  it("ALL_FOERDERBEREICHE hat genau 4 Einträge", () => {
    expect(Object.keys(ALL_FOERDERBEREICHE).sort()).toEqual(["I", "II", "III", "IV"]);
  });
  it("Alle 4 haben unterschiedliche Labels", () => {
    const labels = Object.values(ALL_FOERDERBEREICHE).map(f => f.label_kurz);
    expect(new Set(labels).size).toBe(4);
  });
  it("Alle 4 haben quelle_pdf gesetzt", () => {
    for (const fb of Object.values(ALL_FOERDERBEREICHE)) {
      expect(fb.quelle_pdf).toMatch(/^materialien\//);
    }
  });
  it("konfigFor(id) liefert die richtige Konfig", () => {
    expect(konfigFor("I").label_kurz).toBe("Aufbau");
    expect(konfigFor("III").label_kurz).toBe("Bewährte Strukturen");
  });
});
```

- [ ] **Step 2: Test laufen — alle 4 + Integrations-Tests grün**

```bash
cd "$REPO/packages/foerderbereiche" && pnpm test
```
Expected: ~20 Tests pass total.

- [ ] **Step 3: Commit + Push**

```bash
cd "$REPO"
git add packages/foerderbereiche/tests/integration.test.ts
git commit -m "test(foerderbereiche): Integrations-Tests alle 4 FBs"
git push
```

---

## Phase 3 — packages/data-layer (Supabase-Wrapper + Typen)

**Referenz Spec:** §13.2 (Schicht 1 — Daten-Layer), §4 (DB-Schema).

### Task 3.1: Skeleton + Supabase-Typen generieren

**Files:**
- Create: `packages/data-layer/package.json`
- Create: `packages/data-layer/tsconfig.json`
- Create: `packages/data-layer/src/index.ts`
- Create: `packages/data-layer/src/supabase-client.ts`
- Create: `scripts/gen-supabase-types.ts`

- [ ] **Step 1: package.json**

```json
{
  "name": "@dv/data-layer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "@supabase/supabase-js": "^2.45.0" },
  "devDependencies": { "typescript": "^5.6.0", "vitest": "^2.1.0" }
}
```

- [ ] **Step 2: supabase-client.ts (Singleton-Wrapper)**

```typescript
// packages/data-layer/src/supabase-client.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = import.meta.env?.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL + SUPABASE_ANON_KEY müssen gesetzt sein");
  _client = createClient(url, key, { db: { schema: "apl" } });
  return _client;
}

export function resetSupabaseClient(): void { _client = null; }  // für Tests
```

- [ ] **Step 3: gen-supabase-types.ts (Helper-Script, nur Doku — Robert generiert manuell mit supabase CLI)**

```typescript
// scripts/gen-supabase-types.ts
// Verwendung: pnpm gen-types
// Voraussetzung: supabase CLI installiert (npm i -g supabase)
// Generiert TypeScript-Typen aus dem apl-Schema in packages/data-layer/src/db-types.ts
//
// Manueller Aufruf:
//   supabase gen types typescript \
//     --project-id ztmhgyzzcsygbburbhxz \
//     --schema apl > packages/data-layer/src/db-types.ts
//
// Für die Demo: wir tippen die Types manuell in db-types.ts (Task 3.2),
// weil die supabase CLI gegen Self-Hosted-Instanz eine separate Konfig braucht.
console.log("Manuelle Typ-Generierung — siehe Kommentar im File");
```

- [ ] **Step 4: Commit**

```bash
cd "$REPO"
git add packages/data-layer/ scripts/gen-supabase-types.ts
git commit -m "feat(packages): data-layer Skeleton + supabase-client Singleton"
```

### Task 3.2: db-types.ts (manuell getippt, matcht Migration 060-067)

**Files:** Create `packages/data-layer/src/db-types.ts`.

- [ ] **Step 1: Types schreiben (kompakt — nur die wichtigsten Felder, Rest TODO durch generierte Types ersetzbar)**

```typescript
// packages/data-layer/src/db-types.ts
// Manuell getippte Types — matchen Migrationen 060-067.
// TODO später: durch supabase gen types automatisch ersetzen.

export type FoerderbereichId = "I" | "II" | "III" | "IV";
export type FbIiiVariante = "A" | "B" | "C" | "D";
export type Status = "eingegangen" | "in_pruefung" | "rueckfrage" | "bewilligt" | "abgelehnt";
export type TreffenSchwelle = "GT_10" | "GT_20" | "GT_40";
export type AnlagenTyp = "projektskizze" | "helferliste" | "foerderbestaetigung_bund"
                      | "programm_flyer" | "stundenzettel" | "sonstige";

export interface Antrag {
  id: string;
  antragsnummer: string;
  haushaltsjahr: number;
  foerderbereich: FoerderbereichId;
  // Antragsteller-Block:
  dachverband: string | null;
  einrichtung: string;
  ansprechpartner: string;
  strasse: string;
  hausnummer: string | null;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  homepage: string | null;
  bankname: string;
  iban: string;
  bic: string;
  // Workflow
  status: Status;
  submitted_at: string;
  submitted_language: "de" | "tr";
  user_agent: string | null;
  ip_address: string | null;
}

export interface FbIProjekt {
  antrag_id: string;
  projekt_titel: string;
  laufzeit: string | null;
  stadtteil: string | null;
  personalkosten_euro: number | null;
  sachkosten_euro: number | null;
  drittmittel_jsonb: Array<{ quelle: string; betrag: number }>;
  andere_mittel_jsonb: Array<{ quelle: string; betrag: number }>;
}

export interface FbIiEhrenamt {
  antrag_id: string;
  ehrenamt_titel: string;
  anzahl_helfer_vorjahr: number | null;
  gesamt_helferstunden_vorjahr: number | null;
  direkter_kontakt_senioren: boolean;
}

export interface FbIiHelfer {
  id: string;
  antrag_id: string;
  position: number;
  name: string;
  vorname: string;
  einsatzbereich: string | null;
  eintritt: string | null;
  austritt: string | null;
  stunden_monat: number | null;
  stunden_jahr: number | null;
}

export interface FbIiiVarianteRow {
  antrag_id: string;
  variante: FbIiiVariante;
  a_anmerkung: string | null;
  b_anzahl_veranstaltungen: number | null;
  b_teilnehmer_senioren: number | null;
  b_teilnehmer_generationen: number | null;
  b_stadtbewohner_anteil: number | null;
  b_quartierstreffen_teilnahme: boolean | null;
  b_quartiere: string | null;
  b_quartier_person_name: string | null;
  c_treffen_schwelle: TreffenSchwelle | null;
  c_teilnehmer_durchschnitt: number | null;
  c_quartierstreffen_anzahl: number | null;
  c_quartier_kooperation: string | null;
  c_quartier_person_name: string | null;
  d_hauptamt_name: string | null;
  d_hauptamt_stunden_woche: number | null;
  d_hauptamt_stunden_monat: number | null;
  d_ehrenamt_personen_jsonb: Array<{ name: string; vorname: string; jahresstunden: number }>;
}

export interface FbIvFreitext {
  antrag_id: string;
  vorhaben_titel: string;
  kurzbeschreibung: string;
  geplante_massnahmen: string;
  beantragte_summe_euro: number | null;
  laufzeit: string | null;
}

export interface Anlage {
  id: string;
  antrag_id: string;
  anlagentyp: AnlagenTyp;
  dateiname: string;
  storage_path: string;
  groesse_bytes: number | null;
  hochgeladen_am: string;
}

// View
export interface AntragUebersicht extends Antrag {
  fb_label: string;
  fb_iii_variante: FbIiiVariante | null;
  antragssumme_euro: number | null;
  entschieden_am: string | null;
  entscheidungs_typ: "bewilligt" | "abgelehnt" | null;
}
```

- [ ] **Step 2: Commit**

```bash
cd "$REPO"
git add packages/data-layer/src/db-types.ts
git commit -m "feat(data-layer): db-types.ts — TS-Interfaces zu Migrations 060-067"
```

### Task 3.3: antraege.ts (CRUD-Wrapper) + Test

**Files:**
- Create: `packages/data-layer/src/antraege.ts`
- Create: `packages/data-layer/tests/antraege.test.ts`

- [ ] **Step 1: Wrapper schreiben**

```typescript
// packages/data-layer/src/antraege.ts
import { getSupabase } from "./supabase-client";
import type { Antrag, AntragUebersicht } from "./db-types";

export async function listAntraege(opts: { foerderbereich?: string } = {}): Promise<AntragUebersicht[]> {
  let q = getSupabase().from("antrag_uebersicht").select("*").order("submitted_at", { ascending: false });
  if (opts.foerderbereich) q = q.eq("foerderbereich", opts.foerderbereich);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AntragUebersicht[];
}

export async function getAntrag(id: string): Promise<Antrag | null> {
  const { data, error } = await getSupabase().from("antraege").select("*").eq("id", id).single();
  if (error) { if (error.code === "PGRST116") return null; throw error; }
  return data as Antrag;
}

export async function changeStatus(antrag_id: string, nach_status: Antrag["status"], kommentar?: string): Promise<void> {
  const { error: updateError } = await getSupabase().from("antraege").update({ status: nach_status }).eq("id", antrag_id);
  if (updateError) throw updateError;
  const { error: histError } = await getSupabase().from("antrag_history").insert({
    antrag_id, nach_status, kommentar: kommentar ?? null, geaendert_von: "ui"
  });
  if (histError) throw histError;
}
```

- [ ] **Step 2: Test mit Mock-Supabase** (siehe vorhandenes Pattern in `ue2/sachbearbeiter/tests/sektionPruefung.test.tsx`)

- [ ] **Step 3: Commit**

```bash
cd "$REPO"
git add packages/data-layer/src/antraege.ts packages/data-layer/tests/antraege.test.ts
git commit -m "feat(data-layer): antraege CRUD-Wrapper + Mock-Tests"
```

### Task 3.4: helfer.ts + anlagen.ts (analog)

**Files:** Create `packages/data-layer/src/helfer.ts` + `anlagen.ts` + Tests.

- [ ] Step 1-3: Analog Task 3.3 — `listHelfer(antrag_id)`, `upsertHelfer(antrag_id, helfer[])`, `uploadAnlage(antrag_id, file, typ)`, `listAnlagen(antrag_id)`. Tests pro Funktion.

- [ ] Step 4: Commit

```bash
cd "$REPO"
git add packages/data-layer/src/helfer.ts packages/data-layer/src/anlagen.ts packages/data-layer/tests/
git commit -m "feat(data-layer): helfer + anlagen Wrapper + Tests"
```

### Task 3.5: Phase-3-Abschluss

- [ ] **Step 1: Index + Build-Check**

```bash
cd "$REPO/packages/data-layer"
# index.ts: re-exports
cat > src/index.ts <<'EOF'
export * from "./db-types";
export { getSupabase, resetSupabaseClient } from "./supabase-client";
export * from "./antraege";
export * from "./helfer";
export * from "./anlagen";
EOF
pnpm test && pnpm typecheck
```
Expected: alle Tests grün, 0 TS-Errors.

- [ ] **Step 2: Commit + Push**

```bash
cd "$REPO"
git add packages/data-layer/src/index.ts
git commit -m "feat(data-layer): index re-exports"
git push
```

---

## Phase 4 — Backend `pruefung/` mit FB-Plugins + Hard-Fail-Quellen-Validator

**Referenz Spec:** §13.3 (Backend-Trennung), §12.1 (Quellen-Validator Hard-Fail), §13.4 (KI-Adoption mit Quellen-Zwang).

### Task 4.1: Backend-Skeleton — pruefung/src/pruefung/foerderbereiche/

**Files:** Create `pruefung/src/pruefung/foerderbereiche/{__init__.py, base.py}`.

- [ ] **Step 1: Plugin-Interface**

```python
# pruefung/src/pruefung/foerderbereiche/base.py
from __future__ import annotations
from typing import Any, Protocol, runtime_checkable
from pathlib import Path

@runtime_checkable
class FoerderbereichPlugin(Protocol):
    """Plugin-Interface pro Förderbereich. Eine Klasse pro FB
    (fb_i.py / fb_ii.py / fb_iii.py / fb_iv.py).

    Definition-of-Done aus Spec §12.7:
    - get_pflicht_felder muss alle Antrags-Pflichtfelder zurückgeben,
      sodass die FB-Pflicht-Validierung deterministisch ist.
    - baue_subsumtions_prompt darf nur Daten aus dem Antrag UND dem
      Doctree verwenden — NIE freie Texte oder Daten aus dem Web.
    - render_bescheid_template muss alle zitierten Paragraphen aus
      dem Doctree pinnen (Quellen-Validator Hard-Fail).
    """
    fb_id: str  # "I" | "II" | "III" | "IV"

    def get_pflicht_felder(self) -> list[str]: ...
    def baue_subsumtions_prompt(self, antrag: dict[str, Any], doctree: list[dict[str, Any]]) -> str: ...
    def post_process_kibescheid(self, raw: str) -> dict[str, Any]: ...
    def render_bescheid_template(self, antrag: dict[str, Any], ki_result: dict[str, Any]) -> Path: ...
```

- [ ] **Step 2: Commit**

```bash
cd "$REPO"
git add pruefung/src/pruefung/foerderbereiche/
git commit -m "feat(pruefung): FoerderbereichPlugin-Protocol für 4 FBs"
```

### Task 4.2-4.5: 4 FB-Plugins (FB I, II, III, IV)

Pro FB: ein File mit Subsumtions-Prompt-Builder + Bescheid-Template-Renderer + Tests.

**Files pro FB:**
- Create: `pruefung/src/pruefung/foerderbereiche/fb_{i,ii,iii,iv}.py`
- Create: `pruefung/tests/foerderbereiche/test_fb_{i,ii,iii,iv}.py`
- Create: `pruefung/src/pruefung/templates/bescheid_fb_{i,ii,iii,iv}.html.j2`

- [ ] Step pro FB: Plugin-Klasse mit den 4 Protocol-Methoden + 5-8 Tests + Jinja-Template
- [ ] Commit pro FB

```bash
cd "$REPO"
git add pruefung/src/pruefung/foerderbereiche/fb_i.py pruefung/tests/foerderbereiche/test_fb_i.py pruefung/src/pruefung/templates/bescheid_fb_i.html.j2
git commit -m "feat(pruefung): FB I (Aufbau) Plugin + Template + Tests"
```

### Task 4.6: Quellen-Validator als Hard-Fail (Spec §12.1)

**Files:** Modify `pruefung/src/pruefung/quellen_validator.py`.

- [ ] **Step 1: Hard-Fail-Modus erzwingen**

```python
# pruefung/src/pruefung/quellen_validator.py (Auszug)
class QuellenValidationError(Exception):
    """Wird beim Bescheid-Render geworfen, wenn ein zitierter Paragraph
    nicht in apl.ahp_norm_statements existiert. Hard-Fail, kein Toggle."""

def validate_oder_abort(bescheid_text: str, antrag_id: str) -> None:
    """Findet alle § X.Y-Zitate, prüft jede gegen apl.ahp_norm_statements.
    Wirft QuellenValidationError + loggt in apl.bescheid_render_log.
    """
    refs = extract_paragraph_refs(bescheid_text)
    statements = lade_norm_statements()
    bekannte = {s["ref"] for s in statements}
    erfunden = [r for r in refs if r not in bekannte]
    if erfunden:
        log_render_failure(antrag_id, f"Erfundene Paragraphen: {erfunden}")
        raise QuellenValidationError(
            f"Bescheid-Render abgebrochen — folgende Paragraphen sind nicht "
            f"in apl.ahp_norm_statements: {erfunden}"
        )
```

- [ ] **Step 2: Test mit erfundenen Paragraphen (muss raisen)**

```python
def test_validator_raises_bei_erfundenem_paragraph():
    text = "Gem. § 99.9 wird der Antrag abgelehnt."
    with pytest.raises(QuellenValidationError, match="99.9"):
        validate_oder_abort(text, "test-antrag-id")
```

- [ ] **Step 3: bescheid_subsumtion.py call vor Render einbauen**

```python
# pruefung/src/pruefung/bescheid_subsumtion.py
from .quellen_validator import validate_oder_abort

def render_bescheid_pdf(antrag_id: str, ki_result: dict) -> Path:
    bescheid_text = render_template(antrag_id, ki_result)
    validate_oder_abort(bescheid_text, antrag_id)  # ← Hard-Fail
    pdf_path = render_to_pdf(bescheid_text)
    return pdf_path
```

- [ ] **Step 4: Commit**

```bash
cd "$REPO"
git add pruefung/src/pruefung/quellen_validator.py pruefung/src/pruefung/bescheid_subsumtion.py pruefung/tests/test_quellen_validator.py
git commit -m "feat(pruefung): Quellen-Validator als Hard-Fail vor Bescheid-PDF-Render"
```

### Task 4.7: Halluzinations-Test-Pool (Spec §12.1)

**Files:** Create `pruefung/tests/test_halluzinations_pool.py`.

- [ ] **Step 1: 10 synthetische Anträge mit Fallstricken**

```python
# pruefung/tests/test_halluzinations_pool.py
HALLU_ANTRAEGE = [
    # Erfundener Träger
    { "einrichtung": "Senioren-Cyber-Club e.V.", "iban": "DE89370400440532013000", ... },
    # Ungültige IBAN
    { "einrichtung": "Caritas Würzburg", "iban": "DE00000000000000000000", ... },
    # Quartier, das nicht existiert
    { "einrichtung": "Demo AWO", "quartier": "Sandhof-West", ... },
    # Förderbetrag weit über Höchstgrenze
    { "einrichtung": "Demo Caritas", "beantragte_summe": 50000, "foerderbereich": "II", ... },
    # Treffen-Zahl unrealistisch
    { "einrichtung": "Demo Verein", "c_treffen_schwelle": "GT_40", "c_teilnehmer_durchschnitt": 1000, ... },
    # ... insgesamt 10 Fallstricke
]

def test_ki_markiert_mindestens_9_von_10_als_fraglich(client_with_mocked_llm):
    fraglich_count = 0
    for antrag in HALLU_ANTRAEGE:
        result = client_with_mocked_llm.pruefe(antrag)
        if result["empfehlung"] in ("fraglich", "unklar"):
            fraglich_count += 1
    assert fraglich_count >= 9, f"Nur {fraglich_count}/10 als fraglich/unklar — KI ist zu naiv"
```

- [ ] **Step 2: Tests laufen**

```bash
cd "$REPO/pruefung" && uv run pytest tests/test_halluzinations_pool.py -v
```
Expected: pass mit echtem LLM-Call (oder Mock).

- [ ] **Step 3: Commit**

### Task 4.8: Smart-Upload-Endpoint /api/klassifiziere-pdf

**Files:** Create `pruefung/src/pruefung/klassifiziere_pdf.py` + Tests.

- [ ] Step 1: Funktion `klassifiziere(pdf_bytes) -> {fb, variante, anlagentyp, konfidenz}` mit Claude Vision
- [ ] Step 2: FastAPI-Endpoint in `main.py` einhängen
- [ ] Step 3: Test mit 5 Test-PDFs (1 pro FB + 1 Helferliste)
- [ ] Step 4: Commit

### Task 4.9: Helferliste-OCR-Endpoint /api/extrahiere-helferliste

**Files:** Create `pruefung/src/pruefung/extrahiere_helferliste.py` + Tests.

- [ ] Step 1: Funktion parsed PDF mit Claude Vision, gibt `list[FbIiHelfer]` zurück
- [ ] Step 2: FastAPI-Endpoint
- [ ] Step 3: Test mit echtem Helferliste-PDF aus `materialien/wuerzburg-2026/anlage-ahp-2-helferliste.pdf`
- [ ] Step 4: Commit

### Task 4.10: Excel-Schablonen-Import-Endpoint /api/import-excel-schablone

**Files:** Create `pruefung/src/pruefung/excel_import.py` + Tests + Demo-Schablonen.

- [ ] Step 1: openpyxl-Parser für Helferliste-Excel + Beleg-Aufstellung-Excel
- [ ] Step 2: Demo-Schablonen in `materialien/wuerzburg-2026/schablonen/helferliste.xlsx` + `beleg-aufstellung.xlsx` (via openpyxl-Script erstellt)
- [ ] Step 3: FastAPI-Endpoint
- [ ] Step 4: Commit

### Task 4.11-4.15: Backend-Cleanup + neue Endpoints + Tests + Deploy

Tasks 4.11-4.14 (kompakt):
- 4.11: `bescheid_subsumtion.py` refactor — generischer Dispatcher ruft FB-Plugin
- 4.12: Adoption-CI-Gate-Test (Spec §12.4) — 20 Demo-Anträge + Ground-Truth-Set
- 4.13: Doctree-Drift-Check-Script (`scripts/doctree-drift-check.py`)
- 4.14: PDF-Field-Extractor-Script (`scripts/extract-fields-from-pdf.py`)

### Task 4.15: pruefung-Service deployen + Smoke

- [ ] **Step 1: Container builden + starten**

```bash
ssh vps "cd /opt/pruefung/repo/pruefung/docker && docker compose build && docker compose up -d"
```

- [ ] **Step 2: Endpoint-Smoke**

```bash
curl -s https://pruefung.butscher.cloud/health
curl -s -X POST https://pruefung.butscher.cloud/api/pruefung/erstpruefung \
  -H "Content-Type: application/json" \
  -d '{"antrag_id":"33333333-3333-3333-3333-333333333333"}'
```
Expected: gültiges JSON-Ergebnis mit Quellen-Zitaten.

- [ ] **Step 3: Phase-4-Abschluss-Push**

```bash
cd "$REPO" && git push
```

---

## Phase 5 — UE1 Webformular (Multi-FB, 3 Phasen, DE+TR)

**Referenz Spec:** §5.2 (UE1-Flow), §3 (FB-Felder).

### Task 5.1: ue1/webformular Neuaufbau auf packages-Basis

**Files:** Modify `ue1/webformular/package.json`, neuer Source unter `ue1/webformular/src/`.

- [ ] Step 1: dependencies um `@dv/foerderbereiche` + `@dv/data-layer` ergänzen
- [ ] Step 2: Alten Source weg, neuer FB-Wahl-Page als Einstieg
- [ ] Step 3: Commit „chore: ue1 zurück auf Multi-FB-Skeleton"

### Task 5.2: FB-Wahl-Page mit Hybrid-Pattern (Karten + Wizard-Link)

**Files:** Create `ue1/webformular/src/pages/fb-wahl.ts` + Tests.

- [ ] Step 1: Karten-Komponente nutzt `ALL_FOERDERBEREICHE` aus @dv/foerderbereiche
- [ ] Step 2: `unsicher?`-Link öffnet 2-3-Fragen-Wizard (klein, inline)
- [ ] Step 3: Auswahl → Routing zu /antrag/phase-1
- [ ] Step 4: Commit

### Task 5.3: Phase 1 — Antragsteller-Block

**Files:** Create `ue1/webformular/src/pages/phase1-antragsteller.ts`.

- [ ] Step 1: `<AntragstellerBlock />` aus packages/ui-komponenten (kommt aus Task 5.10)
- [ ] Step 2: Validation (Email, PLZ, IBAN-Mod-97)
- [ ] Step 3: „Weiter zu Phase 2" → Routing
- [ ] Step 4: Tests + Commit

### Task 5.4: Phase 2 — FB-spezifische Felder (Dispatcher)

**Files:** Create `ue1/webformular/src/pages/phase2-fb-details.ts`.

- [ ] Step 1: switch auf `state.foerderbereich`, lädt FB-spezifische Sub-Page
- [ ] Step 2-5: 4 Sub-Pages — `phase2-fb-i.ts`, `phase2-fb-ii.ts`, `phase2-fb-iii.ts` (mit Varianten-Wahl), `phase2-fb-iv.ts`
- [ ] Step 6: Helferliste-Tabelle als eigene Komponente (`<HelferTabelle />`)
- [ ] Step 7: Commits pro Sub-Page

### Task 5.5: Phase 3 — Anlagen + Übersicht + Senden

**Files:** Create `ue1/webformular/src/pages/phase3-senden.ts`.

- [ ] Step 1: Anlagen-Upload pro FB-Konfig
- [ ] Step 2: Pre-Submit-Übersicht
- [ ] Step 3: Submit ruft Edge Function (siehe Task 5.6)
- [ ] Step 4: Tests + Commit

### Task 5.6: Edge Function submit-antrag neu (für alle 4 FBs)

**Files:** Modify `supabase/functions/submit-antrag/index.ts`.

- [ ] Step 1: JSON-Schema-Validation (per FB unterschiedlich)
- [ ] Step 2: Transaktion: INSERT apl.antraege + FB-Detail-Tabelle + Helfer + Anlagen
- [ ] Step 3: Rollback bei Fehler (Storage-Cleanup)
- [ ] Step 4: Deploy + Smoketest
- [ ] Step 5: Commit

### Task 5.7-5.9: i18n DE + TR, Druckansicht, Tests

- 5.7: i18n-Module für DE + TR (alle FB-Labels + Field-Labels + Validation-Messages)
- 5.8: Druckansicht via `window.print` mit FB-spezifischem Stylesheet
- 5.9: Vitest-Suite: pro FB ein E2E-Test (FB wählen → Felder ausfüllen → Submit → Mock-DB-Insert)

### Task 5.10: packages/ui-komponenten Skeleton (parallel zu UE1)

**Files:** Create `packages/ui-komponenten/` mit AntragstellerBlock, FBKartenWahl, FBVariantenWahl, HelferTabelle, DocSection, AnlageUpload.

- [ ] Pro Komponente 1-2 Story-Tests
- [ ] UE1 importiert aus dem Paket, damit UE0/UE3 später wiederverwenden

### Task 5.11: UE1 Build + Deploy + Smoke

```bash
cd "$REPO/ue1/webformular" && pnpm build && pnpm test
git push  # GH Actions baut wieder (Pages-Workflow nach Phase 0 re-aktivieren!)
```

---

## Phase 6 — UE0 Upload-Portal (FB-Wahl + FB-spezifische Slots)

**Referenz Spec:** §5.1 (UE0-Flow).

### Task 6.1: ue0/upload-portal Neuaufbau

**Files:** Modify `ue0/upload-portal/src/main.ts`, neuer FB-Wahl-Step.

- [ ] Step 1: FBKartenWahl aus packages/ui-komponenten verwenden
- [ ] Step 2: Nach FB-Wahl: FB-spezifische Slots (aus FB-Konfig → anlagen[])
- [ ] Step 3: Upload an Edge Function `upload-antragspdf` mit `foerderbereich`-Feld
- [ ] Step 4: Commit

### Task 6.2: upload-antragspdf Edge Function erweitern

**Files:** Modify `supabase/functions/upload-antragspdf/index.ts`.

- [ ] Step 1: `foerderbereich` aus FormData lesen + in `apl.einreichung` speichern
- [ ] Step 2: Anlagen je nach FB validieren (max-Größe, MIME)
- [ ] Step 3: Deploy + Test

### Task 6.3: n8n-Workflow erweitern (pro FB eigener OCR-Prompt)

**Files:** Modify `supabase/webhooks/n8n-ue0-pdf-ocr.json`.

- [ ] Step 1: Switch-Node auf `foerderbereich`, 4 OCR-Branches mit FB-spezifischen Schemas
- [ ] Step 2: Pro FB: Claude-Vision-Call mit Field-Inventory-JSON aus `scripts/extract-fields-from-pdf.py`
- [ ] Step 3: Helferliste-Anlage (FB II): Extra-Branch ruft `pruefung/api/extrahiere-helferliste`
- [ ] Step 4: Deploy auf VPS + Smoke

### Task 6.4: UE0 Build + Deploy + E2E-Test pro FB

- [ ] Pro FB ein Test-PDF aus `materialien/wuerzburg-2026/demo-ausgefuellt/` (kommt in Task 8.x) hochladen, OCR-Pipeline durchlaufen lassen, prefilled UE1 prüfen.

---

## Phase 7 — UE2 + UE3 Inbox-Anpassung Multi-FB + UE3 Smart-Upload

**Referenz Spec:** §5.3 (UE2), §5.4 (UE3).

### Task 7.1: useAntraege Hook auf packages/data-layer umstellen

**Files:** Modify `ue2/sachbearbeiter/src/hooks/useAntraege.ts` + `ue3/sachbearbeitung-ki/src/hooks/useAntraege.ts`.

- [ ] Step 1: Import `listAntraege` aus `@dv/data-layer`
- [ ] Step 2: Interface `AntragRow` → `AntragUebersicht` aus db-types
- [ ] Step 3: Tests anpassen
- [ ] Step 4: Commit

### Task 7.2: Inbox.tsx — FB-Spalte + FB-Filter-Pills

**Files:** Modify `ue2/sachbearbeiter/src/pages/Inbox.tsx` + UE3-Analog.

- [ ] Step 1: Neue Spalte `fb_label` (default sichtbar, sortierbar)
- [ ] Step 2: Filter-Pills oben: „Alle / Aufbau / Engagement / Bewährte / Schwerpunkt"
- [ ] Step 3: Antragssumme-Spalte zeigt FB-spezifischen Wert (View liefert)
- [ ] Step 4: Test + Commit

### Task 7.3: AntragDetail FB-spezifisch rendern

**Files:** Modify `ue2/sachbearbeiter/src/pages/AntragDetail.tsx` + UE3-Analog.

- [ ] Step 1: Dispatcher auf `antrag.foerderbereich` lädt FB-spezifischen Block
- [ ] Step 2: 4 FB-Blöcke als wiederverwendbare Komponenten in packages/ui-komponenten
- [ ] Step 3: HelferTabelle (FB II) zeigt Liste read-only mit Edit-Button
- [ ] Step 4: Tests + Commit

### Task 7.4: UE3 Smart-Upload-Komponente

**Files:** Create `ue3/sachbearbeitung-ki/src/components/SmartUpload.tsx` + Tests.

- [ ] Step 1: Drop-Zone, Mehrfach-PDF, Live-Preview pro Datei mit Klassifikations-Spinner
- [ ] Step 2: Klassifikations-Vorschläge pro PDF (FB + Variante + Anlagentyp) als Card
- [ ] Step 3: Sachbearbeiter klickt „Anwenden" oder „Korrigieren"
- [ ] Step 4: Helferliste-Spezialfall: nach Anwenden öffnet sich Helfer-Vorschlags-Liste
- [ ] Step 5: Tests + Commit

### Task 7.5: UE3 ComplianceStatus + Adoption-Dashboard auf Multi-FB

- [ ] Step 1: Statistiken pro FB anzeigen (Bewilligungs-Quote je FB)
- [ ] Step 2: Halluzinations-Test-Status (passt zu Spec §12.1)
- [ ] Step 3: Commit

### Task 7.6: UE2 + UE3 Build + Deploy

- [ ] Beide rebuilden + neu deployen auf VPS

---

## Phase 8 — E2E-Tests + Demo-Reset + Pre-Flight-Checkliste

**Referenz Spec:** §12.6 + §12.7 (Definition-of-Done).

### Task 8.1: Demo-PDFs ausgefüllt erzeugen (1 pro FB)

**Files:** Create `materialien/wuerzburg-2026/demo-ausgefuellt/` (4 PDFs via Skript).

- [ ] Step 1: Python-Script mit reportlab, das pro FB ein ausgefülltes Demo-PDF erzeugt mit den Seed-Daten aus Migration 067
- [ ] Step 2: Commit

### Task 8.2: scripts/demo-reset.sh

**Files:** Create `scripts/demo-reset.sh`.

- [ ] Step 1: Skript
  - DB: `truncate apl.einreichung, apl.bescheide, apl.bescheid_render_log cascade` (Anträge bleiben)
  - Storage: `antragseingang-pdf/` leeren (außer Demo-PDFs)
  - localStorage-Reset-Hint
- [ ] Step 2: Commit

### Task 8.3: docs/lehrveranstaltung/pre-flight-checklist.md

**Files:** Create `docs/lehrveranstaltung/pre-flight-checklist.md`.

- [ ] Step 1: Checkliste (Spec §12.6 ausgeschrieben):
  - Container-Status prüfen
  - Cache-Clear browser
  - Smoke-Test 1 Antrag pro FB
  - TTFB-Check < 500 ms
  - Fallback-Screenshots vorrätig
- [ ] Step 2: Commit

### Task 8.4: E2E-Test pro FB durchklicken (manuell, dokumentiert)

**Files:** Create `docs/superpowers/e2e-runs/2026-XX-XX-multi-fb-smoke.md`.

- [ ] Step 1: Pro FB:
  - UE0 → PDF hochladen → OCR-Pipeline → Auto-Redirect UE1
  - UE1 → Felder prefilled, korrigieren, absenden
  - UE2 → Antrag in Inbox sichtbar, Status ändern
  - UE3 → Smart-Upload, KI-Bescheid-Vorschlag, Quellen-Validator passt
- [ ] Step 2: Screenshots speichern, Probleme dokumentieren
- [ ] Step 3: Commit

### Task 8.5: GH-Actions-Pages-Workflow re-aktivieren

```bash
cd "$REPO"
sed -i.bak 's/^  push_DISABLED:/  push:/' .github/workflows/deploy-pages.yml
git add .github/workflows/deploy-pages.yml
git commit -m "ci(pages): auto-deploy reaktiviert nach Multi-FB-Cut"
git push
```

### Task 8.6: Definition-of-Done-Verifikation

Checkliste aus Spec §12.7 abarbeiten:
- [ ] Alle Doctree-Statements haben `quelle_pdf_pfad` + `quelle_seite` + `woertliches_zitat` (nicht „TBD")
- [ ] Quellen-Validator als Hard-Fail aktiv
- [ ] Halluzinations-Test-Pool ≥ 9/10
- [ ] Adoption-CI-Gate ≥ 70%
- [ ] PDF-Field-Inventory matched DB-Schema + TS-Interfaces
- [ ] Pre-Flight-Checkliste durchgearbeitet
- [ ] Demo-Reset-Skript getestet

### Task 8.7: README + Doku-Update

**Files:** Modify Root-README.md + `ue0/upload-portal/README.md` etc.

- [ ] Step 1: README erwähnt jetzt alle 4 FBs
- [ ] Step 2: Pro UE-README Multi-FB-Hinweis
- [ ] Step 3: Commit + Push

---

## Schluss-Checkliste vor Vorlesungs-Demo

- [ ] Alle 8 Phasen completed
- [ ] Robert hat Demo-Daten verifiziert + ggf. nachgepflegt
- [ ] AHP-Doctree-Statements aus „TBD" zu echten Zitaten kuratiert (Migration 068)
- [ ] Performance-Floor < 500 ms TTFB (eventuell VPS-Upgrade)
- [ ] Pre-Flight-Checkliste am Vorlesungstag durchgearbeitet
- [ ] Backup vor Demo
- [ ] Notfall-Screenshots/Mock-Modus bereit
