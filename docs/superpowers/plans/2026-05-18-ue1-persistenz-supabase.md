# UE1 Persistenz via Supabase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UE1-Webformular um Persistenz erweitern: APL-2-Anträge in Postgres-Schema `apl2`, Belege (PDF/Bild) in Storage-Bucket, atomare Submission via Edge Function. Nutzt bestehende Supabase-Instanz auf Roberts VPS.

**Architecture:** Browser → POST `verwaltung.butscher.cloud/functions/v1/submit-antrag` (Edge Function, Deno) → atomar: Insert `apl2.antraege` + Upload Storage + Insert `apl2.anlagen` (bei Fehler: full rollback). Anon-Key im Frontend hat nur SELECT auf `apl2.form_translations`. Traefik routet die neue Subdomain auf bestehenden `supabase-kong:8000`.

**Tech Stack:** Postgres 15.8, Supabase (Kong, Storage, Auth, Edge Runtime v1.70.3), Deno für Edge Function, Vite 6 + TypeScript 5 + Vitest 2 (Frontend), Traefik v3.6.10, Let's Encrypt via TLS-Challenge.

**Konventionen (etabliert in UE1 Phase 1):**
- Alle git-Operationen via `git -C "$REPO"` mit `REPO="/Users/robert/Library/CloudStorage/OneDrive-Persönlich/Vorlesungen/Übergreifend/Fallstudien/DigitalisierungVerwaltung"`
- SSH-Operationen: `ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "<befehl>"`
- NIEMALS ins LVE-Repo (`Auswertungen-csv`) schreiben
- git-User ist bereits lokal `swrobuts <swrobuts@googlemail.com>`

---

## File Structure

```
DigitalisierungVerwaltung/
├─ supabase/                                  # NEU — Top-Level (geteilt über UEs)
│  ├─ migrations/
│  │  ├─ 001_schema_apl2.sql
│  │  ├─ 002_storage_belege.sql
│  │  ├─ 003_seed_translations.sql
│  │  └─ 004_rls_policies.sql
│  ├─ functions/
│  │  └─ submit-antrag/
│  │     ├─ index.ts                          # Deno Edge Function
│  │     ├─ deno.json
│  │     └─ types.ts                          # Shared mit Frontend (snake_case-Mapping)
│  ├─ traefik-router-snippet.yml              # Labels-Block zum Einsetzen in /root/docker-compose.yml
│  ├─ kong-cors-config.md                     # CORS-Plugin-Anleitung (Kong DB-less mode)
│  └─ README.md                               # Setup-Pfad VPS + Cloud (Studis)
├─ ue1/webformular/
│  ├─ .env.example                            # NEU — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
│  ├─ package.json                            # MODIFIED — @supabase/supabase-js dep
│  ├─ src/
│  │  ├─ supabase.ts                          # NEU — submitAntrag()
│  │  ├─ submit.ts                            # MODIFIED — erzeugeAntragsnummer entfernt
│  │  ├─ attachments.ts                       # MODIFIED — Anlage hält jetzt File-Object
│  │  ├─ types.ts                             # MODIFIED — Anlage.file: File
│  │  └─ main.ts                              # MODIFIED — Submit-Flow async mit Loading/Error
│  ├─ tests/
│  │  └─ supabase.test.ts                     # NEU — Snake-Case-Mapping + FormData-Building
│  ├─ 01-konzept.md                           # MODIFIED — Persistenz im Konzept
│  ├─ 02-vorteile-voraussetzungen.md          # MODIFIED — Persistenz aus „nicht gelöst"-Liste, Supabase als Voraussetzung
│  └─ 03-walkthrough.md                       # MODIFIED — neue Mitmach-Aufgaben (DB-Feld ergänzen)
├─ .github/workflows/deploy-ue1.yml           # MODIFIED — VITE_SUPABASE_URL/ANON_KEY via Secrets
└─ docs/superpowers/specs/
   └─ 2026-05-17-roadmap-5-ue-…md             # MODIFIED am Plan-Ende — UE2 neu konzipiert
```

---

## Phase 0 — VPS-Vorbereitung (Audit & Backup, kein destruktives Doing)

**Ziel:** Sicherstellen, dass das Exponieren der bestehenden Supabase via `verwaltung.butscher.cloud` das produktive LVE-Cockpit nicht gefährdet.

### Task 0.1: RLS-Audit aller bestehenden Postgres-Schemas

**Files:** keine (nur SSH-Inspektion + Report).

- [ ] **Step 1: Schemas auflisten**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec supabase-db psql -U postgres -c \"\\dn\""
```
Expected: Liste der Schemas (typisch: `public`, `auth`, `storage`, `lve`, evtl. `qs`, `realtime`, etc.).

- [ ] **Step 2: Pro Nicht-System-Schema die Tabellen ohne RLS finden**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec supabase-db psql -U postgres -c \"
    select schemaname, tablename, rowsecurity
    from pg_tables
    where schemaname not in ('pg_catalog','information_schema','auth','storage','_realtime','realtime','net','vault','extensions','supabase_functions','supabase_migrations','graphql','graphql_public','pgsodium','pgsodium_masks','pgbouncer')
    order by schemaname, tablename;\""
```
Expected: Tabelle mit `rowsecurity = t|f` für jede User-Tabelle.

- [ ] **Step 3: Report dem User vorlegen, GO/NOGO einholen**

Output formatieren als Markdown-Tabelle. An den User schicken mit Frage:
> „Folgende Tabellen haben KEIN RLS: [...]. Sind sie dennoch sicher gegen externen anon-Zugriff (z.B. weil sie keine sensiblen Daten halten)? Oder bauen wir den Kong-Routing-Filter ein, der externe Requests auf `/rest/v1/apl2.*` beschränkt?"

**Gate:** Erst weiter, wenn User entweder „alle Tabellen mit Daten haben RLS, kein Filter nötig" oder „bau den Filter" sagt.

### Task 0.2: Vollständiges Backup

**Files:** auf VPS unter `/root/backups/<YYYY-MM-DD-HHMM>/`.

- [ ] **Step 1: Backup-Verzeichnis anlegen**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "mkdir -p /root/backups/$(date +%Y-%m-%d-%H%M)-pre-apl2 && echo /root/backups/$(date +%Y-%m-%d-%H%M)-pre-apl2"
```
Notieren: der ausgegebene Pfad ist die `BACKUP_DIR` für die folgenden Steps.

- [ ] **Step 2: pg_dumpall aller Schemas (KOMPLETT-Backup)**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec supabase-db pg_dumpall -U postgres > $BACKUP_DIR/full-dump.sql && ls -lh $BACKUP_DIR/full-dump.sql"
```
Expected: SQL-Dump (typisch 10-200 MB), Größe ausgegeben.

- [ ] **Step 3: docker-compose.yml sichern**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "cp /root/docker-compose.yml $BACKUP_DIR/docker-compose.yml.bak && ls -lh $BACKUP_DIR/docker-compose.yml.bak"
```

- [ ] **Step 4: Kong-Config sichern (falls extern)**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec supabase-kong cat /home/kong/kong.yml 2>/dev/null > $BACKUP_DIR/kong.yml.bak; ls -l $BACKUP_DIR/kong.yml.bak 2>/dev/null || echo 'kong-config nicht gefunden — wahrscheinlich ENV-konfiguriert'"
```

- [ ] **Step 5: Backup-Liste an den User**

Report: „Backup unter `$BACKUP_DIR` mit X MB, enthält full-dump.sql + docker-compose.yml.bak (+ kong.yml.bak falls vorhanden)."

### Task 0.3: CORS- und Routing-Strategie klären

**Files:** keine (nur Klärung mit User).

- [ ] **Step 1: Origins listen, die zugreifen müssen**

Frontend-Origins:
- `https://swrobuts.github.io` (GitHub Pages Produktion)
- `http://localhost:5173` (Vite Dev)
- `http://localhost:4173` (Vite Preview)

- [ ] **Step 2: Routing-Strategie festlegen**

Zwei Modi:
- **Modus A**: `verwaltung.butscher.cloud` routet 1:1 auf `supabase-kong:8000` — Kong filtert intern via Header
- **Modus B**: `verwaltung.butscher.cloud` routet auf Kong + Traefik-Middleware whitelist nur `/functions/v1/submit-antrag` und `/rest/v1/apl2.*`

Wenn RLS-Audit in 0.1 vollständig: **Modus A** reicht. Wenn nicht: **Modus B**.

Klärung mit User, Entscheidung notieren.

- [ ] **Step 3: Commit der Erkenntnisse in den Spec (Anhang)**

```bash
git -C "$REPO" commit --allow-empty -m "audit(ue1-persistenz): RLS-Audit + Backup + Routing-Modus dokumentiert in spec"
```
(Spec wird live ergänzt mit dem Audit-Ergebnis als Anhang in einem separaten Step.)

---

## Phase 1 — DB-Schema + Migrations

### Task 1.1: Migration 001 — Schema `apl2` + Tabellen + Trigger

**Files:** Create `supabase/migrations/001_schema_apl2.sql`.

- [ ] **Step 1: Migration-Datei schreiben**

```sql
-- 001_schema_apl2.sql — APL-2-Antrag-Schema für UE1 (Webformular-Persistenz)

create schema if not exists apl2;

-- Hauptantrag
create table apl2.antraege (
  id                          uuid primary key default gen_random_uuid(),
  antragsnummer               text unique not null,
  haushaltsjahr               int not null,
  name                        text not null,
  anschrift                   text not null,
  traeger                     text not null,
  bankverbindung              text not null,
  iban                        text not null,
  bic                         text,
  ansprechpartner             text not null,
  telefon                     text not null,
  email                       text not null,
  betriebskosten_vorjahr_euro numeric(12,2) not null,
  personalkosten_vorjahr_euro numeric(12,2) not null,
  raeume_vorhanden            text not null check (raeume_vorhanden in ('ja','nein')),
  raeume_unentgeltlich        text not null check (raeume_unentgeltlich in ('ja','nein')),
  monatliche_miete_euro       numeric(12,2) not null default 0,
  antragsdatum                date not null,
  submitted_language          text not null check (submitted_language in ('de','it','tr','es')),
  submitted_at                timestamptz not null default now(),
  user_agent                  text,
  ip_address                  inet,
  status                      text not null default 'eingegangen'
);

-- Anlagen (1:n)
create table apl2.anlagen (
  id            uuid primary key default gen_random_uuid(),
  antrag_id     uuid not null references apl2.antraege(id) on delete cascade,
  typ           text not null check (typ in
                  ('mietvertrag','programm-altentagesstaette',
                   'anlage-1-kostennachweis','personalkostenbelege')),
  dateiname     text not null,
  groesse_bytes bigint not null,
  mime_type     text not null,
  storage_path  text not null,
  uploaded_at   timestamptz not null default now()
);

-- Translations
create table apl2.form_translations (
  key         text not null,
  language    text not null check (language in ('de','it','tr','es')),
  value       text not null,
  updated_at  timestamptz not null default now(),
  primary key (key, language)
);

-- Antragsnummer-Generator (analog Frontend-Format: APL2-<jahr>-<KUE>-<random6>)
create or replace function apl2.set_antragsnummer() returns trigger language plpgsql as $$
declare
  kuerzel text;
begin
  kuerzel := upper(rpad(regexp_replace(coalesce(new.traeger,'XXX'),
                       '[^A-Za-zÄÖÜäöüß]','','g'), 3, 'X'));
  kuerzel := substr(kuerzel, 1, 3);
  new.antragsnummer := format('APL2-%s-%s-%s', new.haushaltsjahr, kuerzel,
                               upper(substr(md5(random()::text), 1, 6)));
  return new;
end;
$$;

create trigger trg_set_antragsnummer
  before insert on apl2.antraege
  for each row when (new.antragsnummer is null)
  execute function apl2.set_antragsnummer();

-- Indexe für Sachbearbeiter-View (UE2 nutzt sie)
create index idx_antraege_status on apl2.antraege(status);
create index idx_antraege_submitted_at on apl2.antraege(submitted_at desc);
create index idx_anlagen_antrag on apl2.anlagen(antrag_id);
```

- [ ] **Step 2: Migration einspielen (Test in localem Container? Nein — auf Roberts VPS, weil dort die Instanz läuft)**

```bash
REPO="/Users/robert/Library/CloudStorage/OneDrive-Persönlich/Vorlesungen/Übergreifend/Fallstudien/DigitalisierungVerwaltung"
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/001_schema_apl2.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec -i supabase-db psql -U postgres < /tmp/001_schema_apl2.sql"
```
Expected: keine ERROR-Meldungen, CREATE-Statements OK.

- [ ] **Step 3: Verifizieren**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec supabase-db psql -U postgres -c \"\\dt apl2.*\""
```
Expected: `antraege`, `anlagen`, `form_translations`.

- [ ] **Step 4: Smoke-Insert + Trigger-Test**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c \"
insert into apl2.antraege (haushaltsjahr,name,anschrift,traeger,bankverbindung,iban,ansprechpartner,
telefon,email,betriebskosten_vorjahr_euro,personalkosten_vorjahr_euro,raeume_vorhanden,
raeume_unentgeltlich,antragsdatum,submitted_language)
values (2026,'Test','Test 1','Diakonie','Sparkasse','DE89370400440532013000','Erika',
'0931 1','t@x.de',1000,5000,'ja','nein','2026-05-18','de')
returning id, antragsnummer;\""
```
Expected: 1 row mit UUID + Antragsnummer wie `APL2-2026-DIA-XXXXXX`.

- [ ] **Step 5: Test-Insert wieder löschen**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec supabase-db psql -U postgres -c \"delete from apl2.antraege where name = 'Test';\""
```

- [ ] **Step 6: Commit**

```bash
git -C "$REPO" add supabase/migrations/001_schema_apl2.sql
git -C "$REPO" commit -m "feat(supabase): Migration 001 — apl2-Schema (antraege, anlagen, form_translations, Trigger)"
```

### Task 1.2: Migration 002 — Storage-Bucket `antragsbelege`

**Files:** Create `supabase/migrations/002_storage_belege.sql`.

- [ ] **Step 1: Migration-Datei schreiben**

```sql
-- 002_storage_belege.sql — privater Storage-Bucket für APL-2-Anlagen

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'antragsbelege',
  'antragsbelege',
  false,
  10485760,                                              -- 10 MB
  array['application/pdf','image/jpeg','image/png']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = excluded.public;
```

- [ ] **Step 2: Einspielen + verifizieren**

```bash
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/002_storage_belege.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec -i supabase-db psql -U postgres < /tmp/002_storage_belege.sql"
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec supabase-db psql -U postgres -c \"select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='antragsbelege';\""
```
Expected: 1 row mit den richtigen Werten.

- [ ] **Step 3: Commit**

```bash
git -C "$REPO" add supabase/migrations/002_storage_belege.sql
git -C "$REPO" commit -m "feat(supabase): Migration 002 — Storage-Bucket antragsbelege (privat, 10MB, PDF/Bild)"
```

### Task 1.3: Migration 003 — Translations-Seed

**Files:** Create `supabase/migrations/003_seed_translations.sql`.

- [ ] **Step 1: Generieren-Script anlegen** (im Repo, nicht Migration selbst)

Create `supabase/migrations/_generate_003.mjs`:
```js
// Generiert 003_seed_translations.sql aus ue1/webformular/src/translations.ts
import { translations } from "../../ue1/webformular/src/translations.ts";
import { writeFileSync } from "node:fs";

const lines = [`-- 003_seed_translations.sql — Seed der 4 Sprachen aus translations.ts (Stand: ${new Date().toISOString().slice(0,10)})`, ""];
lines.push("insert into apl2.form_translations (key, language, value) values");
const rows = [];
for (const [lang, dict] of Object.entries(translations)) {
  for (const [key, value] of Object.entries(dict)) {
    rows.push(`  ('${key}', '${lang}', ${escape(value)})`);
  }
}
lines.push(rows.join(",\n"));
lines.push("on conflict (key, language) do update set value = excluded.value, updated_at = now();");
function escape(s) { return `'${String(s).replace(/'/g, "''")}'`; }
writeFileSync("003_seed_translations.sql", lines.join("\n"));
console.log(`Wrote 003_seed_translations.sql with ${rows.length} rows`);
```

- [ ] **Step 2: Skript ausführen (Vite-TS-Loader nicht nötig wenn translations.ts pure TS export ist)**

Da `translations.ts` ESM exportiert aber TypeScript, brauchen wir tsx oder ts-node. Einfacher: ein kleines Node-Script, das die Datei via Regex parst.

Einfacher Approach: Datei direkt schreiben, manuell aus dem bestehenden translations.ts kopieren:

Datei `supabase/migrations/003_seed_translations.sql` (vollständig, alle 4 Sprachen):
```sql
-- 003_seed_translations.sql — Seed aus ue1/webformular/src/translations.ts (Stand: 2026-05-18)
-- Wenn sich translations.ts ändert: dieses File neu generieren oder UPSERT per Hand erweitern.

insert into apl2.form_translations (key, language, value) values
  ('form.title', 'de', 'Antrag auf Gewährung eines Zuschusses'),
  ('form.title', 'it', 'Domanda di concessione di un contributo'),
  ('form.title', 'tr', 'Hibe başvurusu'),
  ('form.title', 'es', 'Solicitud de concesión de una subvención'),
  ('form.subtitle', 'de', 'ALTENHILFEPLAN Nr. 2 — Altentagesstätten · Betriebs- & Personalkostenzuschüsse'),
  ('form.subtitle', 'it', 'PIANO DI ASSISTENZA AGLI ANZIANI n. 2 — Centri diurni · Sovvenzioni per costi operativi e del personale'),
  ('form.subtitle', 'tr', 'WÜRZBURG YAŞLILARA YARDIM PLANI No. 2 — Yaşlı gündüz merkezleri · İşletme ve personel maliyeti hibeleri'),
  ('form.subtitle', 'es', 'PLAN DE AYUDA A PERSONAS MAYORES n.º 2 — Centros de día · Subvenciones de costes operativos y de personal'),
  ('form.button.absenden', 'de', 'Antrag absenden'),
  ('form.button.absenden', 'it', 'Invia domanda'),
  ('form.button.absenden', 'tr', 'Başvuruyu gönder'),
  ('form.button.absenden', 'es', 'Enviar solicitud')
  -- ... (die übrigen 41-3=38 Keys × 4 Sprachen ergänzen — pro Key 4 Zeilen)
on conflict (key, language) do update set
  value = excluded.value,
  updated_at = now();
```

**Hinweis für Implementer:** Die SQL-Datei muss alle 41×4=164 Übersetzungen enthalten. Quelle: `ue1/webformular/src/translations.ts`. Statt händisch zu kopieren, das `_generate_003.mjs`-Script ausführen mit `npx tsx supabase/migrations/_generate_003.mjs` (dann ist tsx als devdep nötig — alternativ tsc compile + node).

Pragmatischste Variante: `_generate_003.mjs` Anpassen, dass es per Regex die Strings aus translations.ts liest und das SQL generiert. Dann einmal laufen lassen, Output committen.

- [ ] **Step 3: Migration einspielen + verifizieren**

```bash
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/003_seed_translations.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec -i supabase-db psql -U postgres < /tmp/003_seed_translations.sql"
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec supabase-db psql -U postgres -c \"select count(*) from apl2.form_translations;\""
```
Expected: count = 164 (41 Keys × 4 Sprachen).

- [ ] **Step 4: Commit**

```bash
git -C "$REPO" add supabase/migrations/003_seed_translations.sql supabase/migrations/_generate_003.mjs
git -C "$REPO" commit -m "feat(supabase): Migration 003 — Translations-Seed aus translations.ts (164 Zeilen)"
```

### Task 1.4: Migration 004 — RLS-Policies

**Files:** Create `supabase/migrations/004_rls_policies.sql`.

- [ ] **Step 1: Migration-Datei schreiben**

```sql
-- 004_rls_policies.sql — RLS für apl2-Schema
-- Anon: SELECT auf form_translations (für künftiges Live-Reload), sonst nichts
-- Service-Role: voller Zugriff (für Edge Function)
-- Authenticated: kommt in UE2 (Sachbearbeiter)

alter table apl2.antraege          enable row level security;
alter table apl2.anlagen           enable row level security;
alter table apl2.form_translations enable row level security;

-- form_translations: anon darf SELECT
drop policy if exists "anon select translations" on apl2.form_translations;
create policy "anon select translations" on apl2.form_translations
  for select to anon using (true);

-- antraege + anlagen: KEINE Policy für anon → default-deny
-- service_role hat per Supabase-Default bypass auf RLS, braucht keine explicite Policy

-- Storage-Bucket Policies (storage.objects)
-- anon: KEIN Upload, KEIN SELECT
-- service_role: voll (für Edge Function), default

-- Für UE2 dann hier:
-- create policy "sachbearbeiter read all" on apl2.antraege
--   for select to authenticated using (auth.jwt() ->> 'role' = 'sachbearbeiter');
```

- [ ] **Step 2: Einspielen + Negativ-Test (Anon darf antraege NICHT lesen)**

```bash
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/004_rls_policies.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec -i supabase-db psql -U postgres < /tmp/004_rls_policies.sql"

# Anon-Role: SELECT auf antraege muss leer / verweigert sein
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c \"
set role anon;
select count(*) from apl2.form_translations;  -- erlaubt
select count(*) from apl2.antraege;            -- soll 0 zurückgeben (RLS filtert alles weg)
reset role;\""
```
Expected: `count` auf `form_translations` = 164, `count` auf `antraege` = 0 (oder „permission denied" wenn anon kein USAGE auf Schema apl2 hat — dann anon explicit USAGE geben).

- [ ] **Step 3: Falls Step 2 „permission denied" wirft: GRANT-Statements ergänzen**

Append zu `004_rls_policies.sql`:
```sql
-- Anon braucht USAGE auf Schema + SELECT auf form_translations
grant usage on schema apl2 to anon;
grant select on apl2.form_translations to anon;

-- service_role braucht volles Schema-Privileg
grant usage on schema apl2 to service_role;
grant all privileges on all tables in schema apl2 to service_role;
grant all privileges on all sequences in schema apl2 to service_role;
alter default privileges in schema apl2 grant all on tables to service_role;
alter default privileges in schema apl2 grant all on sequences to service_role;
```

Erneut einspielen + Step 2 wiederholen.

- [ ] **Step 4: Commit**

```bash
git -C "$REPO" add supabase/migrations/004_rls_policies.sql
git -C "$REPO" commit -m "feat(supabase): Migration 004 — RLS-Policies + GRANT-Statements für anon/service_role"
```

---

## Phase 2 — Edge Function `submit-antrag`

### Task 2.1: Edge Function Code

**Files:**
- Create: `supabase/functions/submit-antrag/index.ts`
- Create: `supabase/functions/submit-antrag/deno.json`

- [ ] **Step 1: Code schreiben**

`supabase/functions/submit-antrag/index.ts`:
```typescript
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = [
  "https://swrobuts.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
];

const ALLOWED_ANLAGE_TYPEN = [
  "mietvertrag",
  "programm-altentagesstaette",
  "anlage-1-kostennachweis",
  "personalkostenbelege",
];

const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 10 * 1024 * 1024;

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }),
      { status: 405, headers: { ...corsHeaders(origin), "content-type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "apl2" } },
  );

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "invalid multipart body" },
      { status: 400, headers: corsHeaders(origin) });
  }

  const antragRaw = form.get("antrag");
  if (typeof antragRaw !== "string") {
    return Response.json({ error: "missing 'antrag' field" },
      { status: 400, headers: corsHeaders(origin) });
  }

  let antrag: Record<string, unknown>;
  try {
    antrag = JSON.parse(antragRaw);
  } catch {
    return Response.json({ error: "antrag JSON invalid" },
      { status: 400, headers: corsHeaders(origin) });
  }

  const ip = req.headers.get("x-real-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? null;
  const userAgent = req.headers.get("user-agent");

  // 1) Insert antraege
  const { data: row, error: insertErr } = await supabase
    .from("antraege")
    .insert({ ...antrag, user_agent: userAgent, ip_address: ip })
    .select("id, antragsnummer")
    .single();

  if (insertErr || !row) {
    return Response.json(
      { error: `db insert failed: ${insertErr?.message ?? "unknown"}` },
      { status: 500, headers: corsHeaders(origin) },
    );
  }

  // 2) Uploads + anlagen-Rows (transaktional: bei Fehler full rollback)
  const fileEntries = [...form.entries()].filter(([k]) => k.startsWith("file__"));
  const uploadedPaths: string[] = [];
  try {
    for (const [key, value] of fileEntries) {
      if (!(value instanceof File)) continue;
      const typ = key.replace(/^file__/, "");
      if (!ALLOWED_ANLAGE_TYPEN.includes(typ)) {
        throw new Error(`invalid anlage typ: ${typ}`);
      }
      if (value.size > MAX_BYTES) {
        throw new Error(`${typ}: file too large (${value.size} bytes)`);
      }
      if (!ALLOWED_MIME.includes(value.type)) {
        throw new Error(`${typ}: mime type not allowed: ${value.type}`);
      }
      const safeName = value.name.replace(/[^\w.\-]/g, "_");
      const path = `${row.id}/${typ}__${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("antragsbelege")
        .upload(path, value, { contentType: value.type, upsert: false });
      if (upErr) throw upErr;
      uploadedPaths.push(path);

      const { error: anlErr } = await supabase.from("anlagen").insert({
        antrag_id: row.id,
        typ,
        dateiname: value.name,
        groesse_bytes: value.size,
        mime_type: value.type,
        storage_path: path,
      });
      if (anlErr) throw anlErr;
    }
  } catch (e) {
    // Full rollback: erst Anlagen-Rows + Storage cleanen, dann Antrag löschen
    if (uploadedPaths.length > 0) {
      await supabase.storage.from("antragsbelege").remove(uploadedPaths);
    }
    await supabase.from("antraege").delete().eq("id", row.id);
    return Response.json(
      { error: `upload failed, rolled back: ${(e as Error).message}` },
      { status: 500, headers: corsHeaders(origin) },
    );
  }

  return Response.json(
    { antragsnummer: row.antragsnummer, id: row.id },
    { status: 200, headers: corsHeaders(origin) },
  );
});
```

`supabase/functions/submit-antrag/deno.json`:
```json
{
  "imports": {}
}
```

- [ ] **Step 2: Commit**

```bash
git -C "$REPO" add supabase/functions/submit-antrag/
git -C "$REPO" commit -m "feat(supabase): Edge Function submit-antrag — atomar mit Rollback bei Upload-Fehler"
```

### Task 2.2: Edge Function deployen

**Files:** keine (Deploy auf VPS).

- [ ] **Step 1: Verzeichnis auf VPS anlegen + Funktion hochladen**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "mkdir -p /root/supabase-functions/submit-antrag"
scp -i ~/.ssh/id_vps -P 22 \
  "$REPO/supabase/functions/submit-antrag/index.ts" \
  "$REPO/supabase/functions/submit-antrag/deno.json" \
  root@bot.butscher.cloud:/root/supabase-functions/submit-antrag/
```

- [ ] **Step 2: Edge-Runtime-Container neu starten mit Mount auf neues Verzeichnis**

Vor diesem Schritt prüfen wie der bestehende `supabase-edge-functions`-Container die Functions findet:
```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker inspect supabase-edge-functions --format '{{json .Mounts}}'" | python3 -m json.tool
```
Expected: zeigt eines oder mehrere Volume-Mounts. Wahrscheinlich `/home/deno/functions` oder ähnlich.

**Wenn die existierende Function-Verzeichnis-Struktur klar ist:** Funktion in das vorhandene Mount-Verzeichnis kopieren statt ein neues anzulegen.

```bash
# Beispiel falls Mount auf /root/supabase/functions zeigt:
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "mkdir -p /root/supabase/functions/submit-antrag && \
   cp /root/supabase-functions/submit-antrag/* /root/supabase/functions/submit-antrag/"
```

- [ ] **Step 3: Edge-Runtime-Container reloaden (Function-Hot-Reload oder Container-Restart)**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker restart supabase-edge-functions"
sleep 5
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker logs --tail 20 supabase-edge-functions"
```
Expected: Logs zeigen die neue Function als geladen.

- [ ] **Step 4: Smoke-Test direkt im VPS (intern, ohne Kong)**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-kong curl -sS -X OPTIONS http://supabase-edge-functions:9000/submit-antrag -H 'Origin: http://localhost:5173' -i" | head -10
```
Expected: 204 No Content mit CORS-Headern.

---

## Phase 3 — Traefik + Kong-CORS

### Task 3.1: Traefik-Router für verwaltung.butscher.cloud

**Files:** Modify `/root/docker-compose.yml` auf VPS, plus Snippet im Repo.

- [ ] **Step 1: Snippet im Repo dokumentieren** (für Studis + Backup-Doc)

`supabase/traefik-router-snippet.yml`:
```yaml
# Labels-Block am supabase-kong-Service in /root/docker-compose.yml ergänzen
# (Service-Definition muss bereits `networks: [root_default]` haben, was schon der Fall ist)

    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=root_default"
      - "traefik.http.routers.verwaltung.rule=Host(`verwaltung.butscher.cloud`)"
      - "traefik.http.routers.verwaltung.entrypoints=websecure"
      - "traefik.http.routers.verwaltung.tls.certresolver=mytlschallenge"
      - "traefik.http.services.verwaltung.loadbalancer.server.port=8000"
```

- [ ] **Step 2: Aktuelle `supabase-kong`-Service-Definition aus Compose lesen**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "grep -A 30 'supabase-kong:' /root/docker-compose.yml | head -40"
```
Output sichten, identifizieren wo `labels:` hinkommt (oder ob schon vorhanden).

- [ ] **Step 3: Labels ergänzen (GATE — User-Bestätigung vor Edit)**

```
GATE: Diff vorschlagen, User-OK einholen, erst dann ändern.
Vorschlag-Diff: Anhängen der 6 Labels an supabase-kong-Service.
```

Edit auf VPS via sed oder Python. Beispiel mit `ed`/`python -c`:

```bash
# Backup vor Änderung
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "cp /root/docker-compose.yml /root/docker-compose.yml.before-verwaltung-router"

# Manuelle Edit via Editor — am sichersten: User nimmt vim/nano selbst
# ODER: einen Python-Script schicken, der den Service-Block lokalisiert + Labels einfügt
```

**Sicherste Variante:** Den Subagent eine YAML-Patch-Operation per Python ausführen lassen (PyYAML im Container), mit Backup vorab und Diff zur Bestätigung.

- [ ] **Step 4: Compose reloaden NUR für betroffenes Service**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "cd /root && docker compose up -d supabase-kong"
```
Expected: Container restart, kein anderer Container betroffen.

- [ ] **Step 5: TLS-Cert via Traefik abwarten**

```bash
sleep 30  # Traefik braucht ein paar Sekunden für die Cert-Issuance
curl -sI https://verwaltung.butscher.cloud/ -m 10 | head -3
```
Expected: HTTP/2 401 oder 404 (Kong antwortet ohne Auth) — Hauptsache TLS-Handshake OK.

- [ ] **Step 6: Commit Snippet ins Repo**

```bash
git -C "$REPO" add supabase/traefik-router-snippet.yml
git -C "$REPO" commit -m "docs(supabase): Traefik-Router-Snippet für verwaltung.butscher.cloud"
```

### Task 3.2: Kong-CORS-Plugin konfigurieren

**Files:** Modify Kong-Config auf VPS, plus Doku-File im Repo.

- [ ] **Step 1: Kong-Modus prüfen**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec supabase-kong env | grep -i 'KONG_'" | head -10
```
Identifiziert: ist Kong im DB-mode oder DB-less (declarative YAML)?

- [ ] **Step 2: CORS für Submit-Function-Route ergänzen**

Falls DB-less: in `kong.yml` einen CORS-Plugin-Block für die Route ergänzen.

`supabase/kong-cors-config.md` (Doku im Repo):
```markdown
# Kong CORS für submit-antrag

Im Kong-DB-less-Mode (typisch für Supabase Self-Host) wird `kong.yml`
deklarativ konfiguriert. Für unsere Edge Function reicht eigentlich der
CORS-Handler IN der Function selbst (siehe `functions/submit-antrag/index.ts`).
Kong braucht in der Regel keinen separaten CORS-Block, da die Function-Antwort
schon die richtigen Header trägt.

Falls Kong präemptiv CORS-Preflight terminiert:

```yaml
plugins:
  - name: cors
    config:
      origins:
        - https://swrobuts.github.io
        - http://localhost:5173
        - http://localhost:4173
      methods: [POST, OPTIONS]
      headers: [authorization, x-client-info, apikey, content-type]
      credentials: false
```
```

- [ ] **Step 3: End-to-End OPTIONS Smoke**

```bash
curl -sI -X OPTIONS https://verwaltung.butscher.cloud/functions/v1/submit-antrag \
  -H 'Origin: http://localhost:5173' \
  -H 'Access-Control-Request-Method: POST' | head -10
```
Expected: 204 No Content + `Access-Control-Allow-Origin: http://localhost:5173`.

- [ ] **Step 4: Commit**

```bash
git -C "$REPO" add supabase/kong-cors-config.md
git -C "$REPO" commit -m "docs(supabase): Kong-CORS-Konfiguration für submit-antrag-Function"
```

---

## Phase 4 — Frontend-Integration

### Task 4.1: Supabase-Client installieren

**Files:** Modify `ue1/webformular/package.json`.

- [ ] **Step 1: Installieren**

```bash
cd "$REPO/ue1/webformular" && npm install @supabase/supabase-js@^2.45.0
```
Expected: package.json um Dependency erweitert, package-lock.json updated.

- [ ] **Step 2: Verify build still works**

```bash
cd "$REPO/ue1/webformular" && npm run build
```
Expected: dist/ erfolgreich gebaut, keine TS-Errors.

- [ ] **Step 3: Commit**

```bash
git -C "$REPO" add ue1/webformular/package.json ue1/webformular/package-lock.json
git -C "$REPO" commit -m "feat(ue1): @supabase/supabase-js als Dependency"
```

### Task 4.2: `.env.example` + Doku

**Files:** Create `ue1/webformular/.env.example`.

- [ ] **Step 1: ENV-Vorlage**

`ue1/webformular/.env.example`:
```bash
# Wird zur Build-Zeit von Vite in den Bundle injiziert (VITE_-Präfix).
# Frontend kommuniziert nur mit der Edge Function — der ANON_KEY hat nur
# SELECT-Recht auf apl2.form_translations.

# Für Roberts Self-Hosted Instanz:
VITE_SUPABASE_URL=https://verwaltung.butscher.cloud
VITE_SUPABASE_ANON_KEY=<anon-key-vom-supabase-studio>

# Für Studi-Setup mit supabase.com Cloud:
# VITE_SUPABASE_URL=https://<projekt-ref>.supabase.co
# VITE_SUPABASE_ANON_KEY=<dein-anon-key>
```

- [ ] **Step 2: Commit**

```bash
git -C "$REPO" add ue1/webformular/.env.example
git -C "$REPO" commit -m "feat(ue1): .env.example mit Supabase-URLs (VPS + Cloud-Variante)"
```

### Task 4.3: `src/supabase.ts` — submitAntrag

**Files:** Create `ue1/webformular/src/supabase.ts`.

- [ ] **Step 1: Code**

```typescript
import type { APL2Antrag, Anlage } from "./types";
import { getSprache } from "./i18n";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY müssen in .env stehen — siehe .env.example",
  );
}

export interface SubmitErfolg { antragsnummer: string; id: string; }
export interface SubmitFehler { error: string; }
export type SubmitErgebnis = SubmitErfolg | SubmitFehler;

export function toSnakeCase(antrag: APL2Antrag): Record<string, unknown> {
  return {
    haushaltsjahr: antrag.haushaltsjahr,
    name: antrag.name,
    anschrift: antrag.anschrift,
    traeger: antrag.traeger,
    bankverbindung: antrag.bankverbindung,
    iban: antrag.iban,
    bic: antrag.bic || null,
    ansprechpartner: antrag.ansprechpartner,
    telefon: antrag.telefon,
    email: antrag.email,
    betriebskosten_vorjahr_euro: antrag.betriebskostenVorjahrEuro,
    personalkosten_vorjahr_euro: antrag.personalkostenVorjahrEuro,
    raeume_vorhanden: antrag.raeumeVorhanden,
    raeume_unentgeltlich: antrag.raeumeUnentgeltlich,
    monatliche_miete_euro: antrag.monatlicheMieteEuro,
    antragsdatum: antrag.antragsdatum,
    submitted_language: getSprache(),
  };
}

export async function submitAntrag(antrag: APL2Antrag, anlagen: Anlage[]): Promise<SubmitErgebnis> {
  const fd = new FormData();
  fd.append("antrag", JSON.stringify(toSnakeCase(antrag)));
  for (const a of anlagen) {
    if (a.file) fd.append(`file__${a.typ}`, a.file, a.dateiname);
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-antrag`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: fd,
    });
    const json = await res.json();
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return json as SubmitErfolg;
  } catch (e) {
    return { error: `Netzwerkfehler: ${(e as Error).message}` };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git -C "$REPO" add ue1/webformular/src/supabase.ts
git -C "$REPO" commit -m "feat(ue1): src/supabase.ts — submitAntrag + snake_case-Mapping"
```

### Task 4.4: `types.ts` + `attachments.ts` — File-Object halten

**Files:** Modify `ue1/webformular/src/types.ts`, `ue1/webformular/src/attachments.ts`.

- [ ] **Step 1: Anlage-Typ erweitern**

In `src/types.ts`, ersetze die `Anlage`-Definition:
```typescript
export interface Anlage {
  typ: AnlagenTyp;
  dateiname: string;
  groesseBytes: number;
  mimeType: string;
  file?: File;        // Für Upload — wird beim Submit gelesen
}
```

- [ ] **Step 2: `attachments.ts` anpassen — File mitgeben**

In `src/attachments.ts`, ersetze die `collectAnlagen`-Funktion (das `file`-Feld wird befüllt):
```typescript
import type { Anlage, AnlagenTyp } from "./types";

const MAX_BYTES = 10 * 1024 * 1024;
const ANLAGEN_TYPEN: AnlagenTyp[] = [
  "programm-altentagesstaette",
  "anlage-1-kostennachweis",
  "personalkostenbelege",
  "mietvertrag",
];
const ANLAGEN_ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];

export function collectAnlagen(form: HTMLFormElement): Anlage[] {
  const anlagen: Anlage[] = [];
  for (const typ of ANLAGEN_TYPEN) {
    const input = form.querySelector<HTMLInputElement>(`input[type="file"][name="${typ}"]`);
    const file = input?.files?.[0];
    if (!file) continue;
    if (file.size > MAX_BYTES) {
      setUploadError(typ, `Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB, max. 10 MB).`);
      continue;
    }
    if (!ANLAGEN_ALLOWED_MIME.includes(file.type)) {
      setUploadError(typ, "Nur PDF, JPEG oder PNG erlaubt.");
      continue;
    }
    setUploadError(typ, "");
    anlagen.push({
      typ,
      dateiname: file.name,
      groesseBytes: file.size,
      mimeType: file.type,
      file,
    });
  }
  return anlagen;
}

function setUploadError(typ: AnlagenTyp, message: string): void {
  const target = document.querySelector<HTMLElement>(`[data-error-for="${typ}"]`);
  if (target) target.textContent = message;
}
```

- [ ] **Step 3: Build verifizieren**

```bash
cd "$REPO/ue1/webformular" && npx tsc --noEmit && npm test
```
Expected: TS clean, 30 tests still passing (Anlage-Type-Erweiterung ist optional → keine bestehenden Tests brechen).

- [ ] **Step 4: Commit**

```bash
git -C "$REPO" add ue1/webformular/src/types.ts ue1/webformular/src/attachments.ts
git -C "$REPO" commit -m "feat(ue1): Anlage hält File-Object für Upload + JPEG/PNG erlaubt"
```

### Task 4.5: `main.ts` — Submit-Flow async mit Loading/Error

**Files:** Modify `ue1/webformular/src/main.ts`.

- [ ] **Step 1: Submit-Handler komplett ersetzen**

In `main.ts`, ersetze den existierenden `form.addEventListener("submit", ...)`-Block mit:

```typescript
import { submitAntrag } from "./supabase";

const btnAbsenden = document.getElementById("btn-absenden") as HTMLButtonElement;

function setzeBusy(busy: boolean): void {
  btnAbsenden.disabled = busy;
  btnAbsenden.textContent = busy ? "Wird gesendet…" : (btnAbsenden.dataset.label ?? "Antrag absenden");
}
// Original-Label sichern fürs Reset
btnAbsenden.dataset.label = btnAbsenden.textContent ?? "Antrag absenden";

function zeigeServerFehler(message: string): void {
  const div = document.createElement("div");
  div.className = "field-error";
  div.setAttribute("role", "alert");
  div.style.padding = "0.7rem";
  div.style.marginTop = "1rem";
  div.style.background = "#ffe5e5";
  div.style.borderLeft = "3px solid var(--error)";
  div.textContent = `Übermittlung fehlgeschlagen: ${message}. Bitte später erneut versuchen.`;
  form.appendChild(div);
  setTimeout(() => div.remove(), 8000);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const antrag = leseAntragAusFormular();
  const errors = alleFehler(antrag);
  if (Object.keys(errors).length > 0) {
    fehlerAnzeigen(errors);
    const firstError = form.querySelector<HTMLElement>("[aria-invalid='true']");
    firstError?.focus();
    firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  setzeBusy(true);
  const ergebnis = await submitAntrag(antrag, antrag.anlagen);
  setzeBusy(false);

  if ("error" in ergebnis) {
    zeigeServerFehler(ergebnis.error);
    return;
  }
  zeigeBestaetigung(bestaetigung, antrag, ergebnis.antragsnummer);
  form.hidden = true;
  bestaetigung.scrollIntoView({ behavior: "smooth", block: "start" });
});
```

- [ ] **Step 2: Alte clientseitige Antragsnummer-Logik entfernen**

In `src/submit.ts` die Funktion `erzeugeAntragsnummer` entfernen (wird jetzt server-side im Trigger generiert), `zeigeBestaetigung` bleibt:

```typescript
// src/submit.ts (nach Refactor)
import type { APL2Antrag } from "./types";

export function zeigeBestaetigung(
  container: HTMLElement,
  antrag: APL2Antrag,
  nummer: string,
): void {
  container.hidden = false;
  container.innerHTML = `
    <h2>Antrag aufgenommen</h2>
    <p>Ihre Antragsnummer:</p>
    <p class="antragsnummer">${nummer}</p>
    <p>Ihr Antrag wurde an die Beratungsstelle für Senioren übermittelt. Sie können diese Nummer für Rückfragen verwenden.</p>
    <details>
      <summary>Zusammenfassung der gesendeten Daten</summary>
      <pre>${escapeHTML(JSON.stringify(antrag, null, 2))}</pre>
    </details>
    <button type="button" onclick="location.reload()">Neuen Antrag stellen</button>
  `;
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    };
    return map[c] ?? c;
  });
}
```

In `main.ts` den nicht mehr existierenden Import von `erzeugeAntragsnummer` entfernen:
```typescript
// Vorher:
// import { erzeugeAntragsnummer, zeigeBestaetigung } from "./submit";
// Nachher:
import { zeigeBestaetigung } from "./submit";
```

- [ ] **Step 3: Build + Tests**

```bash
cd "$REPO/ue1/webformular" && npx tsc --noEmit && npm test
```
Expected: TS clean. Bestehende Tests grün (kein Test für erzeugeAntragsnummer war drin).

- [ ] **Step 4: Commit**

```bash
git -C "$REPO" add ue1/webformular/src/main.ts ue1/webformular/src/submit.ts
git -C "$REPO" commit -m "feat(ue1): Submit-Flow async mit Loading-State + Server-Antragsnummer"
```

### Task 4.6: Tests für `supabase.ts` — Snake-Case + FormData

**Files:** Create `ue1/webformular/tests/supabase.test.ts`.

- [ ] **Step 1: Vitest-Environment auf `jsdom` umstellen (für FormData/File)**

In `ue1/webformular/vitest.config.ts`, ändere `environment: "node"` → `environment: "jsdom"`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
```

Dependency:
```bash
cd "$REPO/ue1/webformular" && npm install -D jsdom
```

- [ ] **Step 2: Failing Test schreiben**

`tests/supabase.test.ts`:
```typescript
import { describe, expect, it, beforeEach, vi } from "vitest";

// ENV-Vars für Test setzen, BEVOR supabase.ts importiert wird
vi.stubEnv("VITE_SUPABASE_URL", "https://verwaltung.test");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");

import { toSnakeCase, submitAntrag } from "../src/supabase";
import type { APL2Antrag } from "../src/types";
import { setSprache } from "../src/i18n";

const beispielAntrag: APL2Antrag = {
  haushaltsjahr: 2026,
  name: "Test-Einrichtung",
  anschrift: "Musterstraße 1, 97070 Würzburg",
  traeger: "Diakonie e.V.",
  bankverbindung: "Sparkasse Mainfranken",
  iban: "DE89 3704 0044 0532 0130 00",
  bic: "",
  ansprechpartner: "Erika Mustermann",
  telefon: "0931 1234567",
  email: "kontakt@test.de",
  betriebskostenVorjahrEuro: 10000,
  personalkostenVorjahrEuro: 50000,
  raeumeVorhanden: "ja",
  raeumeUnentgeltlich: "nein",
  monatlicheMieteEuro: 0,
  antragsdatum: "2026-05-18",
  anlagen: [],
};

describe("toSnakeCase", () => {
  beforeEach(() => setSprache("de"));

  it("mappt camelCase auf snake_case", () => {
    const s = toSnakeCase(beispielAntrag);
    expect(s.haushaltsjahr).toBe(2026);
    expect(s.betriebskosten_vorjahr_euro).toBe(10000);
    expect(s.personalkosten_vorjahr_euro).toBe(50000);
    expect(s.raeume_vorhanden).toBe("ja");
    expect(s.monatliche_miete_euro).toBe(0);
    expect(s.submitted_language).toBe("de");
  });

  it("schickt leeren BIC als null", () => {
    expect(toSnakeCase(beispielAntrag).bic).toBeNull();
  });

  it("inkludiert die aktuelle Sprache", () => {
    setSprache("tr");
    expect(toSnakeCase(beispielAntrag).submitted_language).toBe("tr");
    setSprache("de");
  });
});

describe("submitAntrag", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("schickt FormData mit 'antrag' JSON-String + file__<typ> entries", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ antragsnummer: "APL2-2026-DIA-XXXXXX", id: "uuid-xxx" }),
    });
    const file = new File(["pdf-content"], "test.pdf", { type: "application/pdf" });
    const ergebnis = await submitAntrag(beispielAntrag, [{
      typ: "programm-altentagesstaette",
      dateiname: "test.pdf",
      groesseBytes: 11,
      mimeType: "application/pdf",
      file,
    }]);
    expect(ergebnis).toEqual({ antragsnummer: "APL2-2026-DIA-XXXXXX", id: "uuid-xxx" });
    const call = (global.fetch as any).mock.calls[0];
    expect(call[0]).toContain("/functions/v1/submit-antrag");
    expect(call[1].method).toBe("POST");
    expect(call[1].headers.apikey).toBe("test-anon-key");
    const body: FormData = call[1].body;
    expect(body.get("antrag")).toBeTruthy();
    expect(body.get("file__programm-altentagesstaette")).toBeInstanceOf(File);
  });

  it("liefert error wenn Server 500 returnt", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false, status: 500,
      json: async () => ({ error: "db down" }),
    });
    const ergebnis = await submitAntrag(beispielAntrag, []);
    expect(ergebnis).toEqual({ error: "db down" });
  });

  it("liefert Netzwerkfehler wenn fetch wirft", async () => {
    (global.fetch as any).mockRejectedValue(new Error("network unreachable"));
    const ergebnis = await submitAntrag(beispielAntrag, []);
    expect(ergebnis).toEqual({ error: "Netzwerkfehler: network unreachable" });
  });
});
```

- [ ] **Step 3: Tests laufen lassen**

```bash
cd "$REPO/ue1/webformular" && npx vitest run
```
Expected: alle bestehenden 30 + 6 neue = 36 Tests grün.

- [ ] **Step 4: Commit**

```bash
git -C "$REPO" add ue1/webformular/tests/supabase.test.ts ue1/webformular/vitest.config.ts ue1/webformular/package.json ue1/webformular/package-lock.json
git -C "$REPO" commit -m "test(ue1): supabase.ts mit jsdom-env + 6 neue Tests (snake_case + submitAntrag)"
```

---

## Phase 5 — GitHub Pages Deployment-Anpassung

### Task 5.1: GitHub-Secrets setzen (manuell, Robert)

**Files:** keine (GitHub UI).

- [ ] **Step 1: User-Hinweis**

Robert öffnet GitHub → Repo Settings → Secrets and variables → Actions → New repository secret:
- `VITE_SUPABASE_URL` = `https://verwaltung.butscher.cloud`
- `VITE_SUPABASE_ANON_KEY` = (Wert aus Supabase Studio)

### Task 5.2: Deploy-Workflow mit Secret-Injection

**Files:** Modify `.github/workflows/deploy-ue1.yml`.

- [ ] **Step 1: Env-Block im build-Job ergänzen**

Im `build`-Job, vor `- run: npm run build`, einen `env`-Block ergänzen. Das komplette modifizierte Snippet:

```yaml
      - run: npm ci
      - run: npm test
      - name: Build with Supabase env
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
        run: npm run build
```

- [ ] **Step 2: Commit**

```bash
git -C "$REPO" add .github/workflows/deploy-ue1.yml
git -C "$REPO" commit -m "ci(ue1): VITE_SUPABASE_URL/ANON_KEY als GitHub-Secrets in Build"
```

### Task 5.3: Push + Deploy verifizieren

- [ ] **Step 1: Push + Workflow abwarten**

```bash
git -C "$REPO" push origin main
gh -R swrobuts/DigitalisierungVerwaltung run watch
```
Expected: `Deploy UE1` succeeds.

- [ ] **Step 2: Live-URL prüfen + Submit-Smoke**

Robert öffnet `https://swrobuts.github.io/DigitalisierungVerwaltung/ue1/webformular/`:
- Pflichtfelder mit Test-Daten füllen
- 3 Pflicht-PDFs hochladen (irgendwelche, max. 10 MB)
- Submit
- Bestätigungsseite muss eine Antragsnummer im Format `APL2-2026-XXX-XXXXXX` zeigen

- [ ] **Step 3: DB-Verifikation**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec supabase-db psql -U postgres -c \"select antragsnummer, name, submitted_language, submitted_at, ip_address from apl2.antraege order by submitted_at desc limit 3;\""
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec supabase-db psql -U postgres -c \"select typ, dateiname, groesse_bytes, storage_path from apl2.anlagen order by uploaded_at desc limit 5;\""
```
Expected: der zuletzt gesendete Antrag steht in der DB, Anlagen verlinkt.

---

## Phase 6 — Doku-Updates

### Task 6.1: UE1-Doku anpassen

**Files:** Modify `ue1/webformular/01-konzept.md`, `02-vorteile-voraussetzungen.md`, `03-walkthrough.md`.

- [ ] **Step 1: `01-konzept.md` ergänzen — Persistenz im Konzept**

In `01-konzept.md`, im Abschnitt „Was technisch passiert" am Ende ergänzen:
```markdown
- **Persistenz**: Submit ruft eine **Edge Function** (Deno) auf der Stadt-Supabase auf. Diese
  validiert, holt die IP server-side, schreibt den Antrag in Postgres und lädt die Belege in den
  Storage-Bucket. Bei Upload-Fehler full Rollback. Antragsnummer wird vom DB-Trigger erzeugt
  (`APL2-<jahr>-<KUE>-<random6>`).
```

Im Mermaid-Diagramm den Cliffhanger-Pfeil ändern: statt „Cliffhanger UE2: echtes Absenden" jetzt:
```mermaid
        B5[Antrag landet in DB + Storage<br/>Cliffhanger UE2:<br/>Sachbearbeiter-Inbox + Mail]
```

- [ ] **Step 2: `02-vorteile-voraussetzungen.md` umbauen**

Aus „Was diese Stufe nicht löst" entfernen: „Keine Persistenz", „Antragsnummer clientseitig".
Hinzufügen: „Kein Status-Tracking", „Keine Eingangsbestätigung per Mail", „Keine Sachbearbeiter-Sicht" — alles UE2.

In „Voraussetzungen → Technisch" ergänzen:
```markdown
- Eine Supabase-Instanz (Self-hosted oder supabase.com Cloud), die das Schema `apl2` und den
  Storage-Bucket `antragsbelege` enthält (siehe [supabase/README.md](../../supabase/README.md))
- Eine deployte Edge Function `submit-antrag`
- Für die Demo: GitHub Secrets `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`
```

In „Rechtlich" ergänzen:
```markdown
- **DSGVO ab jetzt voll relevant**: personenbezogene Daten werden gespeichert (Name, Anschrift,
  E-Mail, IP). In Produktion: AVV mit Hosting-Provider, Löschkonzept (z.B. 5 Jahre nach
  Bescheid), Verarbeitungsverzeichnis, Datenschutzhinweis im Formular
- Anon-Key ist im Frontend-Bundle sichtbar — Sicherheit kommt ausschließlich aus RLS +
  Edge-Function-Validation
```

- [ ] **Step 3: `03-walkthrough.md` Mitmach-Aufgaben aktualisieren**

Aufgabe A bleibt (Cross-Field). Aufgabe B+C ergänzen um DB-Aspekt:

Aufgabe B (alt: Sprachpaket ergänzen) — ergänzen:
> Vergessen Sie nicht, die Translations-Tabelle in der DB nachzuziehen (Migration 003 erweitern oder
> Studio-UI nutzen).

Aufgabe C (alt: Mobil-Telefon-Feld) — ergänzen:
> In `001_schema_apl2.sql` die Tabelle um eine Spalte `mobil_telefon text` erweitern, Migration
> per `alter table apl2.antraege add column mobil_telefon text;` einspielen, dann im Frontend
> Mapping in `toSnakeCase()` ergänzen.

Neue **Aufgabe D**: „Schau dir den Antrag in der DB an" — Studis dürfen via Studio-Login die DB-Tabelle sehen.

- [ ] **Step 4: Commit**

```bash
git -C "$REPO" add ue1/webformular/01-konzept.md ue1/webformular/02-vorteile-voraussetzungen.md ue1/webformular/03-walkthrough.md
git -C "$REPO" commit -m "docs(ue1): Doku angepasst — Persistenz im Konzept, DSGVO-Hinweise, Mitmach-Aufgabe D"
```

### Task 6.2: supabase/README.md schreiben

**Files:** Create `supabase/README.md`.

- [ ] **Step 1: Vollständige Setup-Anleitung**

`supabase/README.md`:
```markdown
# Supabase-Setup für DigitalisierungVerwaltung

Das `apl2`-Schema und der Storage-Bucket `antragsbelege` werden über alle 5 UEs hinweg geteilt.

## Pfad A — Roberts Self-Hosted Instanz (verwaltung.butscher.cloud)

Setzt voraus, dass eine bestehende Supabase-Instanz im docker-compose-Stack läuft (siehe
LVE-Cockpit-Setup). Schritte siehe `Phase 0–3` im Implementation-Plan
`docs/superpowers/plans/2026-05-18-ue1-persistenz-supabase.md`.

## Pfad B — Eigene Supabase.com Cloud-Instanz (Studis)

1. **Account anlegen** auf https://supabase.com, neues Projekt erstellen
   (Region: `eu-central-1` für DSGVO-Bewusstsein)
2. **SQL-Editor öffnen**, nacheinander einspielen:
   - `migrations/001_schema_apl2.sql`
   - `migrations/002_storage_belege.sql`
   - `migrations/003_seed_translations.sql`
   - `migrations/004_rls_policies.sql`
3. **Edge Function deployen** (Supabase-CLI installieren via npm):
   ```bash
   npm install -g supabase
   supabase login
   supabase link --project-ref <dein-projekt-ref>
   supabase functions deploy submit-antrag --no-verify-jwt
   ```
   (`--no-verify-jwt` weil wir nur den anon-Key als API-Key nutzen, nicht für Auth.)
4. **CORS-Origins** in den Edge-Function-Settings im Studio:
   - https://swrobuts.github.io
   - http://localhost:5173
5. **URL + Anon-Key** im Supabase-Studio unter Settings → API ablesen
6. In `ue1/webformular/.env.local` eintragen:
   ```
   VITE_SUPABASE_URL=https://<projekt-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<ablesen>
   ```
7. `cd ue1/webformular && npm install && npm run dev`

## Schema-Übersicht

- `apl2.antraege` — Hauptantrag (UUID-PK, Antragsnummer-Trigger)
- `apl2.anlagen` — Belege (1:n zu antraege, CASCADE bei delete)
- `apl2.form_translations` — Übersetzungen DE/IT/TR/ES
- Storage-Bucket `antragsbelege` — privat, 10 MB, PDF/JPEG/PNG

## RLS-Kurzüberblick

- `anon`: SELECT auf `form_translations`, sonst nichts
- `service_role`: alles (für Edge Function)
- `authenticated`: kommt in UE2 (Sachbearbeiter-Rolle)
```

- [ ] **Step 2: Commit**

```bash
git -C "$REPO" add supabase/README.md
git -C "$REPO" commit -m "docs(supabase): README mit VPS- und Cloud-Setup-Anleitung"
```

### Task 6.3: Roadmap-Spec aktualisieren

**Files:** Modify `docs/superpowers/specs/2026-05-17-roadmap-5-ue-digitalisierung-verwaltung.md`.

- [ ] **Step 1: UE1+UE2-Tabelle (Sektion 3) anpassen**

In der Tabelle „Reifegradmodell — 5 Stufen" die Zeilen für UE1 und UE2 anpassen:

| UE | Stufe | Inhalt |
|----|-------|--------|
| **1** | Intelligentes Webformular mit Persistenz | + atomare Submission via Edge Function → Schema `apl2` + Storage-Bucket. Mehrsprachig DE/IT/TR/ES. |
| **2** | Sachbearbeiter-Workflow | Magic-Link-Auth, Inbox-View, Status-Update, Eingangsbestätigung per n8n-Mail. Liest aus `apl2.antraege`. |

UE3-5 bleiben unverändert.

- [ ] **Step 2: Sektion 4 (Repo-Struktur) ergänzen**

Top-Level `supabase/`-Ordner in die Struktur einfügen.

- [ ] **Step 3: Sektion „Bewusst eigenständig" auf „Wachsender Showcase" umformulieren**

Da Schema, Storage, Edge Function geteilt werden, ist die ursprüngliche „5 eigenständige Demos"-These nicht mehr exakt. Sektion 3-Hinweis am Ende:
> *Spec-Update 2026-05-18*: Ursprünglich als 5 eigenständige Demos geplant; seit Einführung der
> geteilten Supabase-Instanz (Schema `apl2` Top-Level) entwickeln sich UE1-5 zu einem
> wachsenden Showcase. Konzeptionelle Eigenständigkeit bleibt — Code-Eigenständigkeit nicht mehr
> in allen Aspekten.

- [ ] **Step 4: Commit**

```bash
git -C "$REPO" add docs/superpowers/specs/2026-05-17-roadmap-5-ue-digitalisierung-verwaltung.md
git -C "$REPO" commit -m "docs(roadmap): UE1 wird Webform+Persistenz, UE2 wird Sachbearbeiter; supabase/ Top-Level"
```

---

## Phase 7 — Final-Check

### Task 7.1: End-to-End-Test live

- [ ] **Step 1: Browser auf Demo-URL**

`https://swrobuts.github.io/DigitalisierungVerwaltung/ue1/webformular/`

- [ ] **Step 2: 3 Sprachen testen**

Pro Sprache (DE/IT/TR): einen Test-Antrag mit Pflicht-PDFs absenden. Bestätigungsseite zeigt jeweils eine Antragsnummer.

- [ ] **Step 3: DB-Cross-Check**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec supabase-db psql -U postgres -c \"select antragsnummer, submitted_language, ip_address, submitted_at from apl2.antraege order by submitted_at desc limit 5;\""
```
Expected: 3 neue Anträge mit korrekten Sprachen und sinnvoller IP (Robert's IP).

### Task 7.2: Cleanup

- [ ] **Step 1: Test-Anträge wieder löschen**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec supabase-db psql -U postgres -c \"delete from apl2.antraege where name like 'Test%';\""
```
(CASCADE löscht auch die anlagen-Rows. Storage-Files müssen separat aufgeräumt werden — siehe Step 2.)

- [ ] **Step 2: Storage-Cleanup**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker exec supabase-storage sh -c 'find /var/lib/storage/antragsbelege -type d -mtime -1 | head -10'"
```
Falls Test-Pfade auftauchen: manuell löschen oder im Studio.

- [ ] **Step 3: Working tree clean check**

```bash
git -C "$REPO" status
git -C "$REPO" log --oneline -20
```
Expected: Working tree clean, alle Commits dieser Phase im Verlauf.

---

## Self-Review-Notiz

Spec-Abdeckung geprüft:
- [x] DB-Schema (Spec §5) — Migration 001, Task 1.1
- [x] Storage-Bucket (Spec §6) — Migration 002, Task 1.2
- [x] Translations-Seed (Spec §4 Mehrsprachigkeit) — Migration 003, Task 1.3
- [x] RLS-Policies (Spec §6) — Migration 004, Task 1.4
- [x] Edge Function mit Rollback (Spec §7) — Task 2.1 + 2.2
- [x] Traefik-Routing (Spec §9) — Task 3.1
- [x] CORS (Spec §7) — Edge Function hat es eingebaut, Kong-Doku in Task 3.2
- [x] Frontend submitAntrag (Spec §8) — Task 4.3
- [x] Tests (Spec §8) — Task 4.6
- [x] Setup-Pfade (Spec §9) — supabase/README.md in Task 6.2
- [x] RLS-Audit-Gate (Spec O6) — Phase 0 Task 0.1
- [x] Backup (Spec O6) — Phase 0 Task 0.2
- [x] UE1-Doku-Update (Spec O4) — Task 6.1
- [x] Roadmap-Spec-Update (Spec O5) — Task 6.3

Nicht im Plan (gehört zu UE2 oder später):
- Sachbearbeiter-Auth + Inbox
- Mail-Versand via n8n
- Status-Tracking-UI
- Live-Reload der Translations aus DB

Type-Konsistenz: Spalten-Namen (snake_case in DB, camelCase im Frontend) konsistent zwischen Migration 001 und `toSnakeCase()` in Task 4.3. Storage-Pfad-Schema (`<antrag-uuid>/<typ>__<filename>`) konsistent zwischen Edge Function (Task 2.1) und DB-Schema (Migration 001 anlagen.storage_path).
