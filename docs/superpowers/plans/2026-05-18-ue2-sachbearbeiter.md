# UE2 Sachbearbeiter-Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sachbearbeiter-App auf `amt.butscher.cloud` (React+Tailwind+shadcn) + Workflow-State-Machine in Postgres (`apl2.workflow_transition` mit Trigger-Validierung) + Audit-Trail + Eingangsbestätigungs-Mail via n8n.

**Architecture:** Browser→Magic-Link-Auth (GoTrue)→Realtime-Inbox aus `apl2.antraege`→Status-Übergänge per UPDATE (Postgres-Trigger validiert gegen `apl2.workflow_transition`, schreibt `apl2.antrag_history`). Eingangsbestätigung: Insert in `antraege` triggert `pg_net.http_post` an `n8n.butscher.cloud/webhook/apl2-eingang` → SMTP-Send (Sprache via Switch).

**Tech Stack:** Postgres 15.8 + pg_net, Supabase GoTrue (Magic-Link), n8n v.aktuell, React 19 + Tailwind 4 + shadcn/ui + react-router-dom 7 + @supabase/supabase-js 2.45, Vite 6, Vitest 2, Docker Multi-Stage → Nginx-Unprivileged, Traefik v3.6 mit Let's-Encrypt TLS-Challenge.

**Konventionen:**
```bash
REPO="/Users/robert/Library/CloudStorage/OneDrive-Persönlich/Vorlesungen/Übergreifend/Fallstudien/DigitalisierungVerwaltung"
SSH="ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud"
# git-User: swrobuts <swrobuts@googlemail.com> (lokal im Repo gesetzt)
# NIEMALS Auswertungen-csv-Repo anfassen, ist ein anderes Projekt
```

---

## File Structure

```
DigitalisierungVerwaltung/
├─ supabase/                                       # (bestehend, geteilt)
│  ├─ migrations/
│  │  ├─ 001…006_…                                 # (bestehend)
│  │  ├─ 007_workflow_state_machine.sql            # NEU
│  │  ├─ 008_antrag_history.sql                    # NEU
│  │  ├─ 009_sachbearbeiter_auth.sql               # NEU
│  │  └─ 010_database_webhook_n8n.sql              # NEU
│  └─ webhooks/
│     └─ n8n-apl2-eingangsbestaetigung.json        # NEU — n8n-Workflow-Export
└─ ue2/
   ├─ folien/                                      # (leer für UE2 — PPT später)
   └─ sachbearbeiter/                              # React-App, NEU
      ├─ package.json
      ├─ tsconfig.json
      ├─ tsconfig.node.json
      ├─ vite.config.ts
      ├─ vitest.config.ts
      ├─ tailwind.config.ts
      ├─ postcss.config.cjs
      ├─ components.json                           # shadcn-Config
      ├─ index.html
      ├─ .env.example
      ├─ Dockerfile
      ├─ docker/
      │  ├─ docker-compose.yml
      │  ├─ nginx.conf
      │  └─ .env.example
      ├─ src/
      │  ├─ main.tsx
      │  ├─ App.tsx
      │  ├─ index.css                              # Tailwind-Direktiven
      │  ├─ pages/
      │  │  ├─ Login.tsx
      │  │  ├─ AuthCallback.tsx
      │  │  ├─ Inbox.tsx
      │  │  └─ AntragDetail.tsx
      │  ├─ components/
      │  │  ├─ ui/                                 # shadcn-CLI-generated: button, table, card, dialog, badge, input, label, select, textarea, separator
      │  │  ├─ StatusBadge.tsx
      │  │  ├─ AnlageDownload.tsx
      │  │  ├─ HistoryTimeline.tsx
      │  │  └─ AuthGuard.tsx
      │  ├─ hooks/
      │  │  ├─ useSession.ts
      │  │  ├─ useUserRole.ts
      │  │  ├─ useAntraege.ts                      # Realtime-Subscription
      │  │  ├─ useAntrag.ts
      │  │  └─ useTransitions.ts
      │  └─ lib/
      │     ├─ supabase.ts
      │     ├─ workflow.ts
      │     └─ format.ts                           # Date, Euro, Adresse-zusammensetzen
      ├─ tests/
      │  ├─ workflow.test.ts
      │  ├─ format.test.ts
      │  └─ StatusBadge.test.tsx
      └─ README.md
```

---

## Phase 0 — VPS-Vorbereitung

### Task 0.1: Backup vor Migrations

**Files:** keine (nur VPS).

- [ ] **Step 1: Backup-Verzeichnis + pg_dumpall**

```bash
TS=$(date +%Y-%m-%d-%H%M)
BACKUP="/root/backups/${TS}-pre-ue2"
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "mkdir -p ${BACKUP} && docker exec supabase-db pg_dumpall -U postgres > ${BACKUP}/full-dump.sql && ls -lh ${BACKUP}/full-dump.sql"
```

Expected: `~3.2 GB`. Notiere `BACKUP_DIR` für Rollback-Referenz.

### Task 0.2: GoTrue Redirect-URLs erweitern

**Files:** `/root/supabase/docker/.env` auf VPS.

- [ ] **Step 1: Aktuelle `ADDITIONAL_REDIRECT_URLS` lesen**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "grep '^ADDITIONAL_REDIRECT_URLS' /root/supabase/docker/.env"
```

Notiere den Wert (z.B. `ADDITIONAL_REDIRECT_URLS=https://lve.butscher.cloud`).

- [ ] **Step 2: Backup + `amt.butscher.cloud` ergänzen**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "cp /root/supabase/docker/.env /root/backups/${TS}-pre-ue2/env.before-amt-redirect.bak"

# Wenn ADDITIONAL_REDIRECT_URLS bereits existiert und amt.butscher.cloud NICHT enthält:
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "grep -q 'amt.butscher.cloud' /root/supabase/docker/.env || sed -i 's|^ADDITIONAL_REDIRECT_URLS=.*|&,https://amt.butscher.cloud,https://amt.butscher.cloud/auth/callback|' /root/supabase/docker/.env"

# Verify
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "grep '^ADDITIONAL_REDIRECT_URLS' /root/supabase/docker/.env"
```

Expected: enthält jetzt `amt.butscher.cloud` und `amt.butscher.cloud/auth/callback`.

- [ ] **Step 3: GoTrue-Container restart**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "cd /root/supabase/docker && docker compose up -d auth"
sleep 4
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker logs --tail 10 supabase-auth 2>&1 | tail -5"
```

Expected: Auth-Service ist „Up" und logs zeigen keine Fehler. LVE-Login darf nicht brechen — kurzer Smoke:

```bash
curl -sI -m 5 https://lve.butscher.cloud/ | head -1
```
Expected: `HTTP/2 200`.

### Task 0.3: Disk + RAM-Check

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "df -h / && echo --- && free -h"
```

Expected: ausreichend frei (≥ 5 GB Disk, ≥ 1 GB RAM). Container-Build der React-App + nginx braucht ~500 MB Disk.

---

## Phase 1 — DB-Migrations

### Task 1.1: Migration 007 — Workflow-State-Machine

**Files:** Create `supabase/migrations/007_workflow_state_machine.sql`.

- [ ] **Step 1: Migrationsdatei schreiben**

```sql
-- 007_workflow_state_machine.sql — Workflow als Datenmodell

create table apl2.workflow_transition (
  von_status  text not null,
  nach_status text not null,
  primary key (von_status, nach_status)
);

insert into apl2.workflow_transition (von_status, nach_status) values
  ('eingegangen', 'in_pruefung'),
  ('in_pruefung', 'rueckfrage'),
  ('in_pruefung', 'bewilligt'),
  ('in_pruefung', 'abgelehnt'),
  ('rueckfrage', 'in_pruefung');

alter table apl2.workflow_transition enable row level security;

drop policy if exists "everyone reads transitions" on apl2.workflow_transition;
create policy "everyone reads transitions" on apl2.workflow_transition
  for select to authenticated, anon using (true);

grant select on apl2.workflow_transition to authenticated, anon;

-- Trigger: validiert Status-Übergänge gegen workflow_transition
create or replace function apl2.validate_status_transition() returns trigger language plpgsql as $$
begin
  if old.status is distinct from new.status then
    if not exists (
      select 1 from apl2.workflow_transition
      where von_status = old.status and nach_status = new.status
    ) then
      raise exception 'Verbotener Status-Übergang: % → %', old.status, new.status
        using errcode = 'P0001', hint = 'Erlaubte Übergänge: select * from apl2.workflow_transition';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_validate_status_transition on apl2.antraege;
create trigger trg_validate_status_transition
  before update of status on apl2.antraege
  for each row execute function apl2.validate_status_transition();

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Hochladen + einspielen**

```bash
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/007_workflow_state_machine.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 < /tmp/007_workflow_state_machine.sql"
```
Expected: keine ERROR-Meldungen, `INSERT 0 5`.

- [ ] **Step 3: Verifizieren**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c \"select * from apl2.workflow_transition order by von_status, nach_status;\""
```
Expected: 5 Zeilen.

- [ ] **Step 4: Trigger-Test (positiv + negativ)**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c \"
-- Test-Antrag anlegen
insert into apl2.antraege (haushaltsjahr, name, strasse, hausnummer, plz, ort, traeger,
  bankverbindung, iban, ansprechpartner, telefon, email,
  betriebskosten_vorjahr_euro, personalkosten_vorjahr_euro,
  raeume_vorhanden, raeume_unentgeltlich, antragsdatum, submitted_language)
values (2026, 'TriggerTest', 'Teststr', '1', '97070', 'Würzburg', 'X',
  'Y', 'DE89370400440532013000', 'A', '0931', 't@x.de',
  1, 1, 'ja', 'nein', '2026-05-18', 'de')
returning id, status;\""
```

Notiere die UUID. Dann:

```bash
# Positiv: eingegangen → in_pruefung (erlaubt)
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c \"update apl2.antraege set status='in_pruefung' where name='TriggerTest';\""
# Expected: UPDATE 1

# Negativ: in_pruefung → eingegangen (verboten)
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c \"update apl2.antraege set status='eingegangen' where name='TriggerTest';\"" 2>&1 | head -3
# Expected: ERROR: Verbotener Status-Übergang: in_pruefung → eingegangen

# Cleanup
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c \"delete from apl2.antraege where name='TriggerTest';\""
```

- [ ] **Step 5: Commit**

```bash
git -C "$REPO" add supabase/migrations/007_workflow_state_machine.sql
git -C "$REPO" commit -m "feat(supabase): Migration 007 — Workflow-State-Machine (5 Status, 5 Übergänge, Trigger-Validierung)"
```

### Task 1.2: Migration 008 — Audit-Trail

**Files:** Create `supabase/migrations/008_antrag_history.sql`.

- [ ] **Step 1: Migrationsdatei**

```sql
-- 008_antrag_history.sql — Audit-Trail aller Status-Changes

create table apl2.antrag_history (
  id            uuid primary key default gen_random_uuid(),
  antrag_id     uuid not null references apl2.antraege(id) on delete cascade,
  von_status    text,
  nach_status   text not null,
  geaendert_von text,
  geaendert_am  timestamptz not null default now(),
  kommentar     text
);

create index idx_antrag_history_antrag on apl2.antrag_history(antrag_id, geaendert_am desc);

-- Trigger: bei jedem Status-Change einen History-Eintrag
create or replace function apl2.log_status_change() returns trigger language plpgsql as $$
begin
  insert into apl2.antrag_history (antrag_id, von_status, nach_status, geaendert_von, kommentar)
  values (new.id, old.status, new.status,
          coalesce(current_setting('request.jwt.claim.email', true), 'unknown'),
          current_setting('apl2.transition_kommentar', true));
  return new;
end $$;

drop trigger if exists trg_log_status_change on apl2.antraege;
create trigger trg_log_status_change
  after update of status on apl2.antraege
  for each row when (old.status is distinct from new.status)
  execute function apl2.log_status_change();

-- Initial-Eintrag bei jedem neuen Antrag
create or replace function apl2.log_initial_status() returns trigger language plpgsql as $$
begin
  insert into apl2.antrag_history (antrag_id, von_status, nach_status, geaendert_von)
  values (new.id, null, new.status, 'system (submit-antrag)');
  return new;
end $$;

drop trigger if exists trg_log_initial_status on apl2.antraege;
create trigger trg_log_initial_status
  after insert on apl2.antraege
  for each row execute function apl2.log_initial_status();

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Einspielen + verifizieren**

```bash
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/008_antrag_history.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 < /tmp/008_antrag_history.sql"
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c \"\\d apl2.antrag_history\""
```
Expected: Tabelle mit 7 Spalten, Index, 2 Trigger.

- [ ] **Step 3: Smoke**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c \"
insert into apl2.antraege (haushaltsjahr, name, strasse, hausnummer, plz, ort, traeger,
  bankverbindung, iban, ansprechpartner, telefon, email,
  betriebskosten_vorjahr_euro, personalkosten_vorjahr_euro,
  raeume_vorhanden, raeume_unentgeltlich, antragsdatum, submitted_language)
values (2026, 'HistoryTest', 'X', '1', '97070', 'W', 'X', 'Y', 'DE89370400440532013000',
  'A', '0931', 't@x.de', 1, 1, 'ja', 'nein', '2026-05-18', 'de');
update apl2.antraege set status='in_pruefung' where name='HistoryTest';
update apl2.antraege set status='bewilligt' where name='HistoryTest';
select von_status, nach_status, geaendert_von from apl2.antrag_history
where antrag_id = (select id from apl2.antraege where name='HistoryTest')
order by geaendert_am;
delete from apl2.antraege where name='HistoryTest';\""
```
Expected: 3 History-Zeilen (`null→eingegangen, eingegangen→in_pruefung, in_pruefung→bewilligt`).

- [ ] **Step 4: Commit**

```bash
git -C "$REPO" add supabase/migrations/008_antrag_history.sql
git -C "$REPO" commit -m "feat(supabase): Migration 008 — Audit-Trail antrag_history mit Auto-Trigger"
```

### Task 1.3: Migration 009 — Auth + RLS

**Files:** Create `supabase/migrations/009_sachbearbeiter_auth.sql`.

- [ ] **Step 1: Migrationsdatei**

```sql
-- 009_sachbearbeiter_auth.sql — Allowlist + RLS für Sachbearbeiter

create table apl2.allow_email (
  email      text primary key,
  rolle      text not null check (rolle in ('bearbeiter','vorgesetzter','admin')),
  notiz      text,
  created_at timestamptz not null default now()
);

-- SECURITY DEFINER, damit RLS-Policy via Function-Call die allow_email-Tabelle prüfen kann
-- ohne dass authenticated direkt SELECT auf allow_email braucht
create or replace function apl2.current_user_role() returns text language sql security definer
set search_path = apl2, public as $$
  select rolle from apl2.allow_email
  where email = current_setting('request.jwt.claim.email', true)
  limit 1
$$;

grant execute on function apl2.current_user_role() to authenticated;

-- antraege: alte UE1-Policy ersetzen
drop policy if exists "authenticated_select_all" on apl2.antraege;
drop policy if exists "sachbearbeiter_select" on apl2.antraege;
create policy "sachbearbeiter_select" on apl2.antraege
  for select to authenticated using (apl2.current_user_role() is not null);

drop policy if exists "sachbearbeiter_update_status" on apl2.antraege;
create policy "sachbearbeiter_update_status" on apl2.antraege
  for update to authenticated
  using (apl2.current_user_role() is not null)
  with check (apl2.current_user_role() is not null);

-- anlagen
drop policy if exists "authenticated_select_all" on apl2.anlagen;
drop policy if exists "sachbearbeiter_select" on apl2.anlagen;
create policy "sachbearbeiter_select" on apl2.anlagen
  for select to authenticated using (apl2.current_user_role() is not null);

-- antrag_history: read-only für Sachbearbeiter
alter table apl2.antrag_history enable row level security;
drop policy if exists "sachbearbeiter_select_history" on apl2.antrag_history;
create policy "sachbearbeiter_select_history" on apl2.antrag_history
  for select to authenticated using (apl2.current_user_role() is not null);

-- allow_email: Sachbearbeiter darf sehen wer Zugang hat
alter table apl2.allow_email enable row level security;
drop policy if exists "authenticated_select" on apl2.allow_email;
create policy "authenticated_select" on apl2.allow_email
  for select to authenticated using (apl2.current_user_role() is not null);

-- Storage: signed URLs für anlagen-Bucket
-- (Bucket-Policy für Lese-Zugriff via signed URL ist bereits richtig konfiguriert in UE1)

-- GRANTs für authenticated auf alle apl2-Tabellen
grant select on apl2.antraege, apl2.anlagen, apl2.antrag_history,
                apl2.allow_email, apl2.form_translations, apl2.workflow_transition
  to authenticated;
grant update on apl2.antraege to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Einspielen + Negativ-Test**

```bash
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/009_sachbearbeiter_auth.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 < /tmp/009_sachbearbeiter_auth.sql"

# Anon darf nichts sehen
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c \"
set role anon;
select count(*) from apl2.antraege;
reset role;\""
# Expected: 0 oder permission denied

# Authenticated ohne Allowlist-Eintrag: 0 (current_user_role gibt null)
# Wird mit echtem JWT erst getestet in Phase 4 E2E
```

- [ ] **Step 3: Allowlist-Seed für Robert**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c \"
insert into apl2.allow_email (email, rolle, notiz) values
  ('robert.butscher@thws.de', 'admin', 'Owner UE2-Sachbearbeiter')
on conflict (email) do nothing;
select email, rolle from apl2.allow_email;\""
```
Expected: 1 Zeile.

- [ ] **Step 4: Commit**

```bash
git -C "$REPO" add supabase/migrations/009_sachbearbeiter_auth.sql
git -C "$REPO" commit -m "feat(supabase): Migration 009 — Sachbearbeiter-Allowlist + RLS-Policies"
```

### Task 1.4: Migration 010 — n8n-Webhook-Trigger

**Files:** Create `supabase/migrations/010_database_webhook_n8n.sql`.

- [ ] **Step 1: Migrationsdatei**

```sql
-- 010_database_webhook_n8n.sql — pg_net Trigger → n8n bei antraege-Insert

create extension if not exists pg_net with schema extensions;

create or replace function apl2.notify_n8n_on_antrag_insert() returns trigger language plpgsql as $$
declare
  webhook_url text;
begin
  webhook_url := current_setting('app.n8n_eingang_webhook', true);
  if webhook_url is null or webhook_url = '' then
    raise warning 'app.n8n_eingang_webhook nicht gesetzt — Webhook übersprungen für Antrag %', new.antragsnummer;
    return new;
  end if;
  perform extensions.http_post(
    url := webhook_url,
    body := jsonb_build_object(
      'antragsnummer', new.antragsnummer,
      'name', new.name,
      'email', new.email,
      'submitted_language', new.submitted_language,
      'submitted_at', new.submitted_at
    )::text,
    headers := '{"content-type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  raise warning 'n8n-Webhook fehlgeschlagen für Antrag %: %', new.antragsnummer, sqlerrm;
  return new;
end $$;

drop trigger if exists trg_notify_n8n_on_antrag_insert on apl2.antraege;
create trigger trg_notify_n8n_on_antrag_insert
  after insert on apl2.antraege
  for each row execute function apl2.notify_n8n_on_antrag_insert();
```

- [ ] **Step 2: Einspielen (Webhook-URL noch nicht gesetzt → Warning erwartet)**

```bash
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/010_database_webhook_n8n.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 < /tmp/010_database_webhook_n8n.sql"
```
Expected: keine ERROR. pg_net-Extension wird angelegt (falls noch nicht da), Trigger wird angelegt.

- [ ] **Step 3: Commit**

```bash
git -C "$REPO" add supabase/migrations/010_database_webhook_n8n.sql
git -C "$REPO" commit -m "feat(supabase): Migration 010 — pg_net-Trigger für n8n-Eingangsbestätigung"
```

Hinweis: die Webhook-URL wird in Phase 2 nach n8n-Workflow-Setup per `ALTER DATABASE` gesetzt.

---

## Phase 2 — n8n-Workflow „APL2-Eingangsbestätigung"

### Task 2.1: n8n-Workflow erstellen

**Files:** Create `supabase/webhooks/n8n-apl2-eingangsbestaetigung.json`.

- [ ] **Step 1: Workflow-Struktur als JSON anlegen**

Die JSON entspricht dem n8n-Export-Format. Schreibe folgende Datei:

```json
{
  "name": "APL2 — Eingangsbestätigung",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "apl2-eingang",
        "responseMode": "lastNode",
        "options": {}
      },
      "id": "webhook-trigger",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1.1,
      "position": [240, 300],
      "webhookId": "apl2-eingang"
    },
    {
      "parameters": {
        "rules": {
          "values": [
            { "conditions": { "string": [{ "value1": "={{ $json.body.submitted_language }}", "value2": "de" }] }, "renameOutput": true, "outputKey": "de" },
            { "conditions": { "string": [{ "value1": "={{ $json.body.submitted_language }}", "value2": "it" }] }, "renameOutput": true, "outputKey": "it" },
            { "conditions": { "string": [{ "value1": "={{ $json.body.submitted_language }}", "value2": "tr" }] }, "renameOutput": true, "outputKey": "tr" },
            { "conditions": { "string": [{ "value1": "={{ $json.body.submitted_language }}", "value2": "es" }] }, "renameOutput": true, "outputKey": "es" }
          ]
        }
      },
      "id": "language-switch",
      "name": "Switch by Language",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 2,
      "position": [460, 300]
    },
    {
      "parameters": {
        "fromEmail": "no-reply@butscher.cloud",
        "toEmail": "={{ $json.body.email }}",
        "subject": "Ihr Antrag {{ $json.body.antragsnummer }} ist eingegangen",
        "emailFormat": "html",
        "html": "<p>Sehr geehrte Antragstellerin, sehr geehrter Antragsteller,</p><p>Ihr Antrag auf Gewährung eines Zuschusses nach dem ALTENHILFEPLAN Nr. 2 ist bei der Beratungsstelle für Senioren der Stadt Würzburg eingegangen.</p><p><strong>Antragsnummer:</strong> {{ $json.body.antragsnummer }}<br><strong>Eingegangen am:</strong> {{ $json.body.submitted_at }}</p><p>Wir prüfen Ihren Antrag und melden uns bei Rückfragen.</p><p>Mit freundlichen Grüßen<br>Beratungsstelle für Senioren · Stadt Würzburg</p><hr><p style=\"font-size:11px;color:#888\">Lehr-Demo der THWS — kein offizielles Angebot der Stadt Würzburg.</p>"
      },
      "id": "send-de",
      "name": "Send DE",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2.1,
      "position": [680, 200],
      "credentials": { "smtp": { "id": "CfjGjVrPcVvoNuWy", "name": "SMTP account" } }
    },
    {
      "parameters": {
        "fromEmail": "no-reply@butscher.cloud",
        "toEmail": "={{ $json.body.email }}",
        "subject": "La sua domanda {{ $json.body.antragsnummer }} è stata ricevuta",
        "emailFormat": "html",
        "html": "<p>Gentile richiedente,</p><p>la sua domanda di sovvenzione secondo il Piano di assistenza agli anziani n. 2 è stata ricevuta dal Centro di consulenza per anziani della Città di Würzburg.</p><p><strong>Numero domanda:</strong> {{ $json.body.antragsnummer }}<br><strong>Ricevuta il:</strong> {{ $json.body.submitted_at }}</p><p>Esamineremo la sua domanda e la contatteremo in caso di domande.</p><p>Cordiali saluti<br>Centro di consulenza per anziani · Città di Würzburg</p><hr><p style=\"font-size:11px;color:#888\">Demo didattica della THWS — non un'offerta ufficiale della Città di Würzburg.</p>"
      },
      "id": "send-it",
      "name": "Send IT",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2.1,
      "position": [680, 300],
      "credentials": { "smtp": { "id": "CfjGjVrPcVvoNuWy", "name": "SMTP account" } }
    },
    {
      "parameters": {
        "fromEmail": "no-reply@butscher.cloud",
        "toEmail": "={{ $json.body.email }}",
        "subject": "Başvurunuz {{ $json.body.antragsnummer }} alındı",
        "emailFormat": "html",
        "html": "<p>Sayın Başvuru Sahibi,</p><p>Würzburg Şehri Yaşlılar Danışma Merkezi'ne 2 numaralı Yaşlılara Yardım Planı kapsamındaki hibe başvurunuz alınmıştır.</p><p><strong>Başvuru numarası:</strong> {{ $json.body.antragsnummer }}<br><strong>Alındığı tarih:</strong> {{ $json.body.submitted_at }}</p><p>Başvurunuzu inceleyip soru durumunda sizinle iletişime geçeceğiz.</p><p>Saygılarımla<br>Yaşlılar Danışma Merkezi · Würzburg Şehri</p><hr><p style=\"font-size:11px;color:#888\">THWS eğitim demosu — Würzburg Şehri'nin resmi bir teklifi değildir.</p>"
      },
      "id": "send-tr",
      "name": "Send TR",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2.1,
      "position": [680, 400],
      "credentials": { "smtp": { "id": "CfjGjVrPcVvoNuWy", "name": "SMTP account" } }
    },
    {
      "parameters": {
        "fromEmail": "no-reply@butscher.cloud",
        "toEmail": "={{ $json.body.email }}",
        "subject": "Su solicitud {{ $json.body.antragsnummer }} ha sido recibida",
        "emailFormat": "html",
        "html": "<p>Estimada/o solicitante,</p><p>su solicitud de subvención según el Plan de ayuda a personas mayores n.º 2 ha sido recibida por el Centro de asesoramiento para personas mayores de la Ciudad de Würzburg.</p><p><strong>Número de solicitud:</strong> {{ $json.body.antragsnummer }}<br><strong>Recibida el:</strong> {{ $json.body.submitted_at }}</p><p>Examinaremos su solicitud y nos pondremos en contacto con usted si tenemos preguntas.</p><p>Atentamente<br>Centro de asesoramiento para personas mayores · Ciudad de Würzburg</p><hr><p style=\"font-size:11px;color:#888\">Demo didáctica de la THWS — no es una oferta oficial de la Ciudad de Würzburg.</p>"
      },
      "id": "send-es",
      "name": "Send ES",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2.1,
      "position": [680, 500],
      "credentials": { "smtp": { "id": "CfjGjVrPcVvoNuWy", "name": "SMTP account" } }
    }
  ],
  "connections": {
    "Webhook": { "main": [[{ "node": "Switch by Language", "type": "main", "index": 0 }]] },
    "Switch by Language": {
      "main": [
        [{ "node": "Send DE", "type": "main", "index": 0 }],
        [{ "node": "Send IT", "type": "main", "index": 0 }],
        [{ "node": "Send TR", "type": "main", "index": 0 }],
        [{ "node": "Send ES", "type": "main", "index": 0 }]
      ]
    }
  },
  "active": true,
  "settings": { "executionOrder": "v1" }
}
```

Commit:
```bash
git -C "$REPO" add supabase/webhooks/n8n-apl2-eingangsbestaetigung.json
git -C "$REPO" commit -m "feat(supabase): n8n-Workflow Eingangsbestätigung (4 Sprachen via Switch)"
```

### Task 2.2: n8n-Workflow importieren + Webhook-URL setzen

**Files:** keine (n8n-UI + Postgres).

- [ ] **Step 1: n8n-UI öffnen + Import**

Robert: öffne `https://n8n.butscher.cloud`, logge dich ein, **Workflows → Import from File** → wähle `supabase/webhooks/n8n-apl2-eingangsbestaetigung.json`. Aktiviere den Workflow (Toggle oben rechts).

- [ ] **Step 2: Webhook-URL aus n8n ablesen**

In der UI: Klick auf den Webhook-Node → unten steht „Production URL" wie `https://n8n.butscher.cloud/webhook/<id>/apl2-eingang`. Notiere die volle URL.

Wenn keine UI-Aktion möglich (Subagent-Run), per CLI/DB:

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "sqlite3 /var/lib/docker/volumes/root_n8n_data/_data/database.sqlite \"select webhookId, path from webhook_entity where path like '%apl2%';\""
```

Konstruiere URL: `https://n8n.butscher.cloud/webhook/<webhookId>/apl2-eingang` (oder direkt `https://n8n.butscher.cloud/webhook/apl2-eingang` falls Path-only).

- [ ] **Step 3: Webhook-URL in Postgres setzen**

```bash
WEBHOOK_URL="https://n8n.butscher.cloud/webhook/apl2-eingang"  # genaue URL einsetzen
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c \"alter database postgres set app.n8n_eingang_webhook = '${WEBHOOK_URL}';\""
# Pooler restart, damit neue Connections die GUC sehen
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "cd /root/supabase/docker && docker compose restart rest"
sleep 3
```

- [ ] **Step 4: E2E-Smoke der gesamten Phase 2**

```bash
TS=$(date +%s)
cat > /tmp/test-mail.json <<EOF
{ "haushaltsjahr": 2026, "name": "MailTest-${TS}", "strasse": "Test", "hausnummer": "1",
  "plz": "97070", "ort": "Würzburg", "traeger": "X", "bankverbindung": "Y",
  "iban": "DE89370400440532013000", "bic": null, "ansprechpartner": "A",
  "telefon": "0", "email": "robert.butscher@thws.de",
  "betriebskosten_vorjahr_euro": 1, "personalkosten_vorjahr_euro": 1,
  "raeume_vorhanden": "ja", "raeume_unentgeltlich": "nein",
  "monatliche_miete_euro": 0, "antragsdatum": "2026-05-18", "submitted_language": "de" }
EOF
curl -ks -X POST "https://verwaltung.butscher.cloud/functions/v1/submit-antrag" \
  -H "Origin: https://amt.butscher.cloud" \
  -H "apikey: $(ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud 'grep ^ANON_KEY /root/supabase/docker/.env | cut -d= -f2')" \
  -F "antrag=</tmp/test-mail.json;type=application/json" -m 15
```

Erwartet: `{"antragsnummer":"…","id":"…"}`. Robert sollte innerhalb 1–2 Min eine Mail im Posteingang von `robert.butscher@thws.de` haben.

DB-Cleanup:
```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c \"delete from apl2.antraege where name like 'MailTest%';\""
```

---

## Phase 3 — React-App `ue2/sachbearbeiter/`

### Task 3.1: Vite + React + TypeScript scaffolden

**Files:** new directory `ue2/sachbearbeiter/`.

- [ ] **Step 1: Verzeichnis + Vite-Init**

```bash
mkdir -p "$REPO/ue2/sachbearbeiter"
cd "$REPO/ue2/sachbearbeiter"
npm create vite@latest . -- --template react-ts
# Bei Prompts: Yes (overwrite), defaults
```

Resultat: package.json, tsconfig.json, vite.config.ts, index.html, src/main.tsx, src/App.tsx, src/index.css.

- [ ] **Step 2: Dependencies installieren**

```bash
cd "$REPO/ue2/sachbearbeiter"
npm install @supabase/supabase-js@^2.45 react-router-dom@^7 lucide-react@^0.400
npm install -D vitest@^2 @testing-library/react @testing-library/jest-dom jsdom \
  tailwindcss@^4 @tailwindcss/vite@^4 postcss autoprefixer
```

- [ ] **Step 3: Tailwind v4 konfigurieren**

`vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  build: { outDir: "dist", emptyOutDir: true },
});
```

`src/index.css`:
```css
@import "tailwindcss";

@theme {
  --color-amt-blau: #1e3a8a;
  --color-amt-grau: #475569;
}

body {
  font-family: "Inter", system-ui, -apple-system, sans-serif;
}
```

- [ ] **Step 4: shadcn/ui init**

```bash
cd "$REPO/ue2/sachbearbeiter"
npx shadcn@latest init -y --base-color slate
npx shadcn@latest add button table card dialog badge input label select textarea separator alert toast
```

Resultat: `components.json`, `src/components/ui/*`, `src/lib/utils.ts`.

- [ ] **Step 5: Smoke-Build**

```bash
cd "$REPO/ue2/sachbearbeiter" && npm run build
```
Expected: dist/ erzeugt, keine Errors.

- [ ] **Step 6: Commit**

```bash
git -C "$REPO" add ue2/sachbearbeiter/
git -C "$REPO" commit -m "feat(ue2): Vite+React+TS+Tailwind+shadcn-Skeleton in ue2/sachbearbeiter/"
```

### Task 3.2: vitest-Config + Smoke-Test

**Files:**
- Create: `ue2/sachbearbeiter/vitest.config.ts`
- Create: `ue2/sachbearbeiter/tests/smoke.test.ts`

- [ ] **Step 1: vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
  },
});
```

- [ ] **Step 2: tests/setup.ts**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Smoke-Test**

`tests/smoke.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("1+1=2", () => {
    expect(1 + 1).toBe(2);
  });
});
```

```bash
cd "$REPO/ue2/sachbearbeiter" && npm test
```
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git -C "$REPO" add ue2/sachbearbeiter/vitest.config.ts ue2/sachbearbeiter/tests/setup.ts ue2/sachbearbeiter/tests/smoke.test.ts ue2/sachbearbeiter/package.json
git -C "$REPO" commit -m "test(ue2): Vitest+jsdom-Setup + Smoke-Test"
```

### Task 3.3: Supabase-Client + .env

**Files:** `src/lib/supabase.ts`, `.env.example`.

- [ ] **Step 1: `.env.example`**

```bash
# Frontend ENV — Vite kompiliert sie zur Build-Zeit ins Bundle.
# Für Self-Host: zeigt auf die existierende butscher.cloud-Supabase
VITE_SUPABASE_URL=https://supabase.butscher.cloud
VITE_SUPABASE_ANON_KEY=<aus /root/supabase/docker/.env ablesen>
VITE_AUTH_REDIRECT=https://amt.butscher.cloud/auth/callback
```

- [ ] **Step 2: `src/lib/supabase.ts`**

```typescript
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  throw new Error("VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY müssen in .env stehen");
}

export const supabase: SupabaseClient = createClient(URL, KEY, {
  db: { schema: "apl2" },
  auth: {
    persistSession: true,
    storageKey: "amt.auth",
    autoRefreshToken: true,
  },
});

export const AUTH_REDIRECT = import.meta.env.VITE_AUTH_REDIRECT ?? `${window.location.origin}/auth/callback`;
```

- [ ] **Step 3: Commit**

```bash
git -C "$REPO" add ue2/sachbearbeiter/.env.example ue2/sachbearbeiter/src/lib/supabase.ts
git -C "$REPO" commit -m "feat(ue2): Supabase-Client mit Session-Persist + ENV-Vorlage"
```

### Task 3.4: workflow.ts + Tests

**Files:** `src/lib/workflow.ts`, `tests/workflow.test.ts`.

- [ ] **Step 1: Failing Tests**

`tests/workflow.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { allowedTransitions, canTransition, STATUS_ORDER, STATUS_LABELS } from "../src/lib/workflow";

describe("workflow", () => {
  it("eingegangen kann nur zu in_pruefung", () => {
    expect(allowedTransitions("eingegangen")).toEqual(["in_pruefung"]);
  });

  it("in_pruefung kann zu rueckfrage, bewilligt, abgelehnt", () => {
    expect(allowedTransitions("in_pruefung").sort()).toEqual(["abgelehnt", "bewilligt", "rueckfrage"]);
  });

  it("rueckfrage kann zurück zu in_pruefung", () => {
    expect(allowedTransitions("rueckfrage")).toEqual(["in_pruefung"]);
  });

  it("bewilligt ist Endstatus", () => {
    expect(allowedTransitions("bewilligt")).toEqual([]);
  });

  it("abgelehnt ist Endstatus", () => {
    expect(allowedTransitions("abgelehnt")).toEqual([]);
  });

  it("canTransition akzeptiert erlaubten Übergang", () => {
    expect(canTransition("eingegangen", "in_pruefung")).toBe(true);
  });

  it("canTransition lehnt verbotenen Übergang ab", () => {
    expect(canTransition("bewilligt", "in_pruefung")).toBe(false);
  });

  it("STATUS_LABELS hat deutsche Labels für alle 5 Status", () => {
    expect(STATUS_LABELS.eingegangen).toBe("Eingegangen");
    expect(STATUS_LABELS.in_pruefung).toBe("In Prüfung");
    expect(STATUS_LABELS.rueckfrage).toBe("Rückfrage");
    expect(STATUS_LABELS.bewilligt).toBe("Bewilligt");
    expect(STATUS_LABELS.abgelehnt).toBe("Abgelehnt");
  });
});
```

```bash
cd "$REPO/ue2/sachbearbeiter" && npm test
```
Expected: FAIL — workflow.ts nicht definiert.

- [ ] **Step 2: Implementation**

`src/lib/workflow.ts`:
```typescript
export type Status =
  | "eingegangen"
  | "in_pruefung"
  | "rueckfrage"
  | "bewilligt"
  | "abgelehnt";

export const STATUS_ORDER: Status[] = [
  "eingegangen",
  "in_pruefung",
  "rueckfrage",
  "bewilligt",
  "abgelehnt",
];

export const STATUS_LABELS: Record<Status, string> = {
  eingegangen: "Eingegangen",
  in_pruefung: "In Prüfung",
  rueckfrage: "Rückfrage",
  bewilligt: "Bewilligt",
  abgelehnt: "Abgelehnt",
};

// Spiegel der DB-Tabelle apl2.workflow_transition.
// Frontend benutzt diesen Cache; bei DB-Änderung muss Frontend nachgezogen werden.
const TRANSITIONS: Record<Status, Status[]> = {
  eingegangen: ["in_pruefung"],
  in_pruefung: ["rueckfrage", "bewilligt", "abgelehnt"],
  rueckfrage: ["in_pruefung"],
  bewilligt: [],
  abgelehnt: [],
};

export function allowedTransitions(from: Status): Status[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
```

```bash
cd "$REPO/ue2/sachbearbeiter" && npm test
```
Expected: alle 8 passed.

- [ ] **Step 3: Commit**

```bash
git -C "$REPO" add ue2/sachbearbeiter/src/lib/workflow.ts ue2/sachbearbeiter/tests/workflow.test.ts
git -C "$REPO" commit -m "feat(ue2): workflow.ts mit Status-Konstanten + Übergangs-Logik (TDD, 8 Tests)"
```

### Task 3.5: format.ts + Tests

**Files:** `src/lib/format.ts`, `tests/format.test.ts`.

- [ ] **Step 1: Failing Tests**

`tests/format.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { formatEuro, formatDateTime, formatAdresse } from "../src/lib/format";

describe("formatEuro", () => {
  it("formatiert positive Beträge", () => {
    expect(formatEuro(1234.56)).toBe("1.234,56 €");
  });
  it("formatiert Null", () => {
    expect(formatEuro(0)).toBe("0,00 €");
  });
});

describe("formatDateTime", () => {
  it("formatiert ISO-Datetime in deutsches Format", () => {
    // 2026-05-18T14:32:00 — UTC
    expect(formatDateTime("2026-05-18T14:32:00Z")).toMatch(/18\.05\.2026/);
  });
});

describe("formatAdresse", () => {
  it("setzt 4 atomare Adressfelder zusammen", () => {
    expect(formatAdresse("Karmelitenstraße", "43", "97070", "Würzburg"))
      .toBe("Karmelitenstraße 43, 97070 Würzburg");
  });
});
```

- [ ] **Step 2: Implementation**

`src/lib/format.ts`:
```typescript
const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

export function formatEuro(value: number): string {
  return EUR.format(value);
}

const DT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(iso: string): string {
  return DT.format(new Date(iso));
}

export function formatAdresse(strasse: string, hausnummer: string, plz: string, ort: string): string {
  return `${strasse} ${hausnummer}, ${plz} ${ort}`;
}
```

```bash
cd "$REPO/ue2/sachbearbeiter" && npm test
```
Expected: alle passed.

- [ ] **Step 3: Commit**

```bash
git -C "$REPO" add ue2/sachbearbeiter/src/lib/format.ts ue2/sachbearbeiter/tests/format.test.ts
git -C "$REPO" commit -m "feat(ue2): format.ts (Euro, Datetime, Adresse) mit TDD"
```

### Task 3.6: useSession + useUserRole Hooks

**Files:** `src/hooks/useSession.ts`, `src/hooks/useUserRole.ts`.

- [ ] **Step 1: useSession.ts**

```typescript
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";

export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  return { session, loading };
}
```

- [ ] **Step 2: useUserRole.ts**

```typescript
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useSession } from "./useSession";

export function useUserRole(): { rolle: string | null; loading: boolean; allowed: boolean } {
  const { session, loading: sessionLoading } = useSession();
  const [rolle, setRolle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.email) {
      setRolle(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("allow_email")
      .select("rolle")
      .eq("email", session.user.email)
      .maybeSingle()
      .then(({ data }) => {
        setRolle(data?.rolle ?? null);
        setLoading(false);
      });
  }, [session?.user?.email]);

  return { rolle, loading: sessionLoading || loading, allowed: rolle !== null };
}
```

- [ ] **Step 3: Commit**

```bash
git -C "$REPO" add ue2/sachbearbeiter/src/hooks/useSession.ts ue2/sachbearbeiter/src/hooks/useUserRole.ts
git -C "$REPO" commit -m "feat(ue2): useSession + useUserRole-Hooks (Supabase Auth + Allowlist)"
```

### Task 3.7: useAntraege + useAntrag Hooks

**Files:** `src/hooks/useAntraege.ts`, `src/hooks/useAntrag.ts`.

- [ ] **Step 1: useAntraege.ts** (Liste mit Realtime)

```typescript
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Status } from "../lib/workflow";

export interface AntragRow {
  id: string;
  antragsnummer: string;
  name: string;
  traeger: string;
  submitted_at: string;
  status: Status;
  submitted_language: string;
}

export function useAntraege(): { antraege: AntragRow[]; loading: boolean; error: string | null } {
  const [antraege, setAntraege] = useState<AntragRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data, error } = await supabase
        .from("antraege")
        .select("id, antragsnummer, name, traeger, submitted_at, status, submitted_language")
        .order("submitted_at", { ascending: false });
      if (!mounted) return;
      if (error) setError(error.message);
      else setAntraege(data as AntragRow[]);
      setLoading(false);
    }
    load();

    // Realtime-Subscription
    const channel = supabase
      .channel("antraege-changes")
      .on("postgres_changes", { event: "*", schema: "apl2", table: "antraege" }, () => {
        load();
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { antraege, loading, error };
}
```

- [ ] **Step 2: useAntrag.ts** (Einzelantrag + History + Anlagen)

```typescript
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Status } from "../lib/workflow";

export interface AntragFull {
  id: string;
  antragsnummer: string;
  haushaltsjahr: number;
  name: string;
  traeger: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  bankverbindung: string;
  iban: string;
  bic: string | null;
  ansprechpartner: string;
  telefon: string;
  email: string;
  betriebskosten_vorjahr_euro: number;
  personalkosten_vorjahr_euro: number;
  raeume_vorhanden: "ja" | "nein";
  raeume_unentgeltlich: "ja" | "nein";
  monatliche_miete_euro: number;
  antragsdatum: string;
  submitted_language: string;
  submitted_at: string;
  user_agent: string | null;
  ip_address: string | null;
  status: Status;
}

export interface AnlageRow {
  id: string;
  typ: string;
  dateiname: string;
  groesse_bytes: number;
  mime_type: string;
  storage_path: string;
  uploaded_at: string;
}

export interface HistoryRow {
  id: string;
  von_status: Status | null;
  nach_status: Status;
  geaendert_von: string;
  geaendert_am: string;
  kommentar: string | null;
}

export function useAntrag(id: string | undefined) {
  const [antrag, setAntrag] = useState<AntragFull | null>(null);
  const [anlagen, setAnlagen] = useState<AnlageRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!id) return;
    setLoading(true);
    const [a, an, h] = await Promise.all([
      supabase.from("antraege").select("*").eq("id", id).single(),
      supabase.from("anlagen").select("*").eq("antrag_id", id).order("uploaded_at"),
      supabase.from("antrag_history").select("*").eq("antrag_id", id).order("geaendert_am", { ascending: false }),
    ]);
    if (a.error) setError(a.error.message);
    else setAntrag(a.data as AntragFull);
    setAnlagen((an.data as AnlageRow[]) ?? []);
    setHistory((h.data as HistoryRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function changeStatus(neuerStatus: Status, kommentar: string): Promise<{ error: string | null }> {
    if (!antrag) return { error: "Kein Antrag geladen" };
    // Kommentar wird via GUC weitergegeben (PostgREST: set local apl2.transition_kommentar = ...)
    // Pragmatisch: Kommentar in History später als separater UPDATE schreiben, weil GUC nicht via PostgREST setzbar
    const { error } = await supabase
      .from("antraege")
      .update({ status: neuerStatus })
      .eq("id", antrag.id);
    if (error) return { error: error.message };

    // Kommentar nachträglich in den frischen History-Eintrag schreiben
    if (kommentar.trim().length > 0) {
      await supabase
        .from("antrag_history")
        .update({ kommentar })
        .eq("antrag_id", antrag.id)
        .eq("nach_status", neuerStatus)
        .order("geaendert_am", { ascending: false })
        .limit(1);
    }
    await reload();
    return { error: null };
  }

  return { antrag, anlagen, history, loading, error, changeStatus, reload };
}
```

- [ ] **Step 3: Commit**

```bash
git -C "$REPO" add ue2/sachbearbeiter/src/hooks/useAntraege.ts ue2/sachbearbeiter/src/hooks/useAntrag.ts
git -C "$REPO" commit -m "feat(ue2): useAntraege + useAntrag-Hooks mit Realtime + Status-Update"
```

### Task 3.8: StatusBadge + HistoryTimeline + AnlageDownload Komponenten

**Files:** `src/components/StatusBadge.tsx`, `src/components/HistoryTimeline.tsx`, `src/components/AnlageDownload.tsx`, `tests/StatusBadge.test.tsx`.

- [ ] **Step 1: StatusBadge.tsx**

```tsx
import { Badge } from "./ui/badge";
import { STATUS_LABELS, type Status } from "../lib/workflow";

const COLORS: Record<Status, string> = {
  eingegangen: "bg-blue-100 text-blue-800 border-blue-300",
  in_pruefung: "bg-amber-100 text-amber-800 border-amber-300",
  rueckfrage: "bg-orange-100 text-orange-800 border-orange-300",
  bewilligt: "bg-emerald-100 text-emerald-800 border-emerald-300",
  abgelehnt: "bg-rose-100 text-rose-800 border-rose-300",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge variant="outline" className={COLORS[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
```

- [ ] **Step 2: tests/StatusBadge.test.tsx**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "../src/components/StatusBadge";

describe("StatusBadge", () => {
  it("zeigt deutschsprachiges Label für jeden Status", () => {
    render(<StatusBadge status="eingegangen" />);
    expect(screen.getByText("Eingegangen")).toBeInTheDocument();
  });

  it("zeigt 'In Prüfung' für in_pruefung", () => {
    render(<StatusBadge status="in_pruefung" />);
    expect(screen.getByText("In Prüfung")).toBeInTheDocument();
  });
});
```

```bash
cd "$REPO/ue2/sachbearbeiter" && npm test
```
Expected: alle passed.

- [ ] **Step 3: HistoryTimeline.tsx**

```tsx
import { formatDateTime } from "../lib/format";
import { STATUS_LABELS, type Status } from "../lib/workflow";
import type { HistoryRow } from "../hooks/useAntrag";

export function HistoryTimeline({ history }: { history: HistoryRow[] }) {
  if (history.length === 0) return <p className="text-slate-500 text-sm">Keine History-Einträge.</p>;
  return (
    <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
      {history.map((h) => (
        <li key={h.id} className="relative">
          <span className="absolute -left-[1.4rem] top-1.5 h-3 w-3 rounded-full bg-slate-400" />
          <p className="text-sm">
            <span className="font-semibold">
              {h.von_status ? STATUS_LABELS[h.von_status as Status] : "Eingang"} → {STATUS_LABELS[h.nach_status as Status]}
            </span>
          </p>
          <p className="text-xs text-slate-500">
            {formatDateTime(h.geaendert_am)} · {h.geaendert_von}
          </p>
          {h.kommentar && <p className="text-sm text-slate-700 mt-1 italic">„{h.kommentar}"</p>}
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 4: AnlageDownload.tsx**

```tsx
import { useState } from "react";
import { Button } from "./ui/button";
import { Download } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { AnlageRow } from "../hooks/useAntrag";

const TYP_LABELS: Record<string, string> = {
  "programm-altentagesstaette": "Programm der Altentagesstätte",
  "anlage-1-kostennachweis": "Anlage 1 — Kostennachweis",
  "personalkostenbelege": "Personalkostenbelege",
  "mietvertrag": "Kopie Mietvertrag",
};

export function AnlageDownload({ anlage }: { anlage: AnlageRow }) {
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    const { data, error } = await supabase.storage
      .from("antragsbelege")
      .createSignedUrl(anlage.storage_path, 3600);
    setLoading(false);
    if (error || !data?.signedUrl) {
      alert("Download fehlgeschlagen: " + error?.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const groesseMB = (anlage.groesse_bytes / 1024 / 1024).toFixed(2);

  return (
    <div className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
      <div>
        <p className="font-medium text-sm">{TYP_LABELS[anlage.typ] ?? anlage.typ}</p>
        <p className="text-xs text-slate-500">{anlage.dateiname} · {groesseMB} MB · {anlage.mime_type}</p>
      </div>
      <Button size="sm" variant="outline" disabled={loading} onClick={download}>
        <Download className="h-4 w-4" /> Download
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git -C "$REPO" add ue2/sachbearbeiter/src/components/StatusBadge.tsx ue2/sachbearbeiter/src/components/HistoryTimeline.tsx ue2/sachbearbeiter/src/components/AnlageDownload.tsx ue2/sachbearbeiter/tests/StatusBadge.test.tsx
git -C "$REPO" commit -m "feat(ue2): StatusBadge + HistoryTimeline + AnlageDownload-Komponenten (+Tests)"
```

### Task 3.9: AuthGuard + Router + main.tsx + App.tsx

**Files:** `src/components/AuthGuard.tsx`, `src/main.tsx`, `src/App.tsx`.

- [ ] **Step 1: AuthGuard.tsx**

```tsx
import { Navigate, useLocation } from "react-router-dom";
import { useUserRole } from "../hooks/useUserRole";
import type { ReactNode } from "react";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { allowed, loading } = useUserRole();
  const location = useLocation();
  if (loading) return <div className="p-8 text-slate-500">Lade …</div>;
  if (!allowed) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}
```

- [ ] **Step 2: main.tsx (Replace generated)**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 3: App.tsx (Replace generated)**

```tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { Login } from "./pages/Login";
import { AuthCallback } from "./pages/AuthCallback";
import { Inbox } from "./pages/Inbox";
import { AntragDetail } from "./pages/AntragDetail";
import { AuthGuard } from "./components/AuthGuard";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/inbox" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/inbox" element={<AuthGuard><Inbox /></AuthGuard>} />
      <Route path="/antrag/:id" element={<AuthGuard><AntragDetail /></AuthGuard>} />
      <Route path="*" element={<Navigate to="/inbox" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git -C "$REPO" add ue2/sachbearbeiter/src/components/AuthGuard.tsx ue2/sachbearbeiter/src/main.tsx ue2/sachbearbeiter/src/App.tsx
git -C "$REPO" commit -m "feat(ue2): AuthGuard + Router-Setup (5 Routen)"
```

### Task 3.10: Login + AuthCallback Pages

**Files:** `src/pages/Login.tsx`, `src/pages/AuthCallback.tsx`.

- [ ] **Step 1: Login.tsx**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, AUTH_REDIRECT } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { useUserRole } from "../hooks/useUserRole";

export function Login() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { allowed } = useUserRole();
  const navigate = useNavigate();

  if (allowed) navigate("/inbox", { replace: true });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null); setErr(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: AUTH_REDIRECT },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setMsg("Magic-Link verschickt. Bitte E-Mail-Posteingang prüfen.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sachbearbeiter-Login</CardTitle>
          <p className="text-sm text-slate-500">Stadt Würzburg · APL 2</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Dienst-E-Mail (@thws.de)</Label>
              <Input id="email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Wird gesendet …" : "Magic-Link anfordern"}
            </Button>
            {msg && <p className="text-sm text-emerald-700">{msg}</p>}
            {err && <p className="text-sm text-rose-700">{err}</p>}
          </form>
          <p className="mt-6 text-xs text-slate-500">
            Nur freigeschaltete E-Mail-Adressen können einloggen. Kontakt: robert.butscher@thws.de.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: AuthCallback.tsx**

```tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase JS-SDK liest Tokens automatisch aus URL-Hash
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate("/inbox", { replace: true });
      } else {
        navigate("/login?error=auth_failed", { replace: true });
      }
    });
  }, [navigate]);

  return <div className="p-8 text-slate-500">Logge ein …</div>;
}
```

- [ ] **Step 3: Commit**

```bash
git -C "$REPO" add ue2/sachbearbeiter/src/pages/Login.tsx ue2/sachbearbeiter/src/pages/AuthCallback.tsx
git -C "$REPO" commit -m "feat(ue2): Login + AuthCallback-Pages (Magic-Link-Flow)"
```

### Task 3.11: Inbox-Page mit Tabelle + Filter

**Files:** `src/pages/Inbox.tsx`.

```tsx
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAntraege } from "../hooks/useAntraege";
import { useUserRole } from "../hooks/useUserRole";
import { supabase } from "../lib/supabase";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../lib/format";
import { STATUS_ORDER, STATUS_LABELS, type Status } from "../lib/workflow";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

export function Inbox() {
  const { antraege, loading, error } = useAntraege();
  const { rolle } = useUserRole();
  const [filter, setFilter] = useState<Set<Status>>(new Set());
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return antraege.filter((a) => {
      if (filter.size > 0 && !filter.has(a.status)) return false;
      if (s && !`${a.antragsnummer} ${a.name} ${a.traeger}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [antraege, filter, search]);

  function toggleStatus(s: Status) {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Sachbearbeitung — APL 2</h1>
            <p className="text-sm text-slate-500">Stadt Würzburg · Beratungsstelle für Senioren</p>
          </div>
          <div className="text-sm text-slate-500">
            Rolle: <span className="font-medium">{rolle ?? "—"}</span>
            <Button variant="ghost" size="sm" className="ml-3" onClick={() => supabase.auth.signOut()}>Abmelden</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-white border border-slate-200 rounded p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input placeholder="Suche (Name, Träger, Antragsnummer) …"
              className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {STATUS_ORDER.map((s) => (
                <button key={s} onClick={() => toggleStatus(s)}
                  className={`text-xs px-2 py-1 rounded border ${filter.has(s) ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"}`}>
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            <div className="ml-auto text-sm text-slate-500">{filtered.length} von {antraege.length}</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          {loading && <div className="p-8 text-slate-500">Lade …</div>}
          {error && <div className="p-4 text-rose-700">{error}</div>}
          {!loading && !error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Antragsnummer</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Träger</TableHead>
                  <TableHead>Eingegangen</TableHead>
                  <TableHead>Sprache</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.antragsnummer}</TableCell>
                    <TableCell>{a.name}</TableCell>
                    <TableCell>{a.traeger}</TableCell>
                    <TableCell className="text-sm">{formatDateTime(a.submitted_at)}</TableCell>
                    <TableCell><Badge variant="secondary">{a.submitted_language.toUpperCase()}</Badge></TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell><Link to={`/antrag/${a.id}`} className="text-blue-600 underline text-sm">Öffnen</Link></TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                      Keine Anträge gefunden.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
}
```

Commit:
```bash
git -C "$REPO" add ue2/sachbearbeiter/src/pages/Inbox.tsx
git -C "$REPO" commit -m "feat(ue2): Inbox-Page mit Tabelle, Status-Filter, Suche, Realtime"
```

### Task 3.12: AntragDetail-Page

**Files:** `src/pages/AntragDetail.tsx`.

```tsx
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAntrag } from "../hooks/useAntrag";
import { StatusBadge } from "../components/StatusBadge";
import { HistoryTimeline } from "../components/HistoryTimeline";
import { AnlageDownload } from "../components/AnlageDownload";
import { allowedTransitions, STATUS_LABELS, type Status } from "../lib/workflow";
import { formatEuro, formatDateTime, formatAdresse } from "../lib/format";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { ArrowLeft } from "lucide-react";

export function AntragDetail() {
  const { id } = useParams<{ id: string }>();
  const { antrag, anlagen, history, loading, error, changeStatus } = useAntrag(id);
  const [confirmTo, setConfirmTo] = useState<Status | null>(null);
  const [kommentar, setKommentar] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="p-8 text-slate-500">Lade …</div>;
  if (error || !antrag) return <div className="p-8 text-rose-700">Fehler: {error ?? "Antrag nicht gefunden"}</div>;

  const folgeStatus = allowedTransitions(antrag.status);

  async function handleStatusChange() {
    if (!confirmTo) return;
    setBusy(true);
    const { error } = await changeStatus(confirmTo, kommentar);
    setBusy(false);
    if (error) alert("Fehler: " + error);
    setConfirmTo(null);
    setKommentar("");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link to="/inbox" className="text-sm text-slate-500 flex items-center gap-1 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Inbox
          </Link>
          <span className="text-slate-300">·</span>
          <h1 className="text-lg font-bold font-mono">{antrag.antragsnummer}</h1>
          <StatusBadge status={antrag.status} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Linke Spalte: Antragsdaten */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Antragsdaten</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label="Einrichtung">{antrag.name}</Field>
            <Field label="Träger">{antrag.traeger}</Field>
            <Field label="Anschrift">{formatAdresse(antrag.strasse, antrag.hausnummer, antrag.plz, antrag.ort)}</Field>
            <Field label="Bankverbindung">{antrag.bankverbindung} · IBAN <span className="font-mono">{antrag.iban}</span>{antrag.bic && <> · BIC <span className="font-mono">{antrag.bic}</span></>}</Field>
            <Field label="Ansprechpartner/in">{antrag.ansprechpartner} · {antrag.telefon} · <a className="text-blue-600 underline" href={`mailto:${antrag.email}`}>{antrag.email}</a></Field>
            <Field label="Haushaltsjahr">{antrag.haushaltsjahr}</Field>
            <Field label="Betriebskosten Vorjahr">{formatEuro(antrag.betriebskosten_vorjahr_euro)}</Field>
            <Field label="Personalkosten Vorjahr">{formatEuro(antrag.personalkosten_vorjahr_euro)}</Field>
            <Field label="Räume vorhanden / unentgeltlich">{antrag.raeume_vorhanden} / {antrag.raeume_unentgeltlich}{antrag.monatliche_miete_euro > 0 && <> · Miete {formatEuro(antrag.monatliche_miete_euro)}</>}</Field>
            <Field label="Eingegangen am">{formatDateTime(antrag.submitted_at)} · Sprache {antrag.submitted_language.toUpperCase()}</Field>
            <Field label="IP / User-Agent">{antrag.ip_address ?? "—"} · <span className="text-xs text-slate-500">{antrag.user_agent ?? "—"}</span></Field>
          </CardContent>
        </Card>

        {/* Rechte Spalte: Aktion + History */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Aktionen</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {folgeStatus.length === 0 ? (
                <p className="text-sm text-slate-500">Status ist ein Endstatus — keine weiteren Übergänge.</p>
              ) : (
                folgeStatus.map((s) => (
                  <Dialog key={s} open={confirmTo === s} onOpenChange={(open) => !open && setConfirmTo(null)}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full justify-start" onClick={() => setConfirmTo(s)}>
                        → {STATUS_LABELS[s]}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Status auf „{STATUS_LABELS[s]}" setzen?</DialogTitle>
                        <DialogDescription>Optional kannst du einen Kommentar hinterlassen (im Audit-Trail sichtbar).</DialogDescription>
                      </DialogHeader>
                      <Textarea placeholder="Kommentar (optional) …" value={kommentar} onChange={(e) => setKommentar(e.target.value)} />
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmTo(null)} disabled={busy}>Abbrechen</Button>
                        <Button onClick={handleStatusChange} disabled={busy}>
                          {busy ? "Wird gespeichert …" : `Auf "${STATUS_LABELS[s]}" setzen`}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Anlagen</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {anlagen.length === 0 ? (
                <p className="text-sm text-slate-500">Keine Anlagen.</p>
              ) : (
                anlagen.map((a) => <AnlageDownload key={a.id} anlage={a} />)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Verlauf</CardTitle></CardHeader>
            <CardContent><HistoryTimeline history={history} /></CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-2">
      <div className="text-slate-500">{label}</div>
      <div>{children}</div>
    </div>
  );
}
```

Commit:
```bash
git -C "$REPO" add ue2/sachbearbeiter/src/pages/AntragDetail.tsx
git -C "$REPO" commit -m "feat(ue2): AntragDetail-Page mit Aktions-Dialog, Anlagen-Download, History"
```

### Task 3.13: Lokaler Smoke-Test

- [ ] **Step 1: `.env.local` befüllen**

```bash
ANON_KEY=$(ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "grep ^ANON_KEY /root/supabase/docker/.env | cut -d= -f2")
cat > "$REPO/ue2/sachbearbeiter/.env.local" <<EOF
VITE_SUPABASE_URL=https://supabase.butscher.cloud
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
VITE_AUTH_REDIRECT=http://localhost:5173/auth/callback
EOF
```

- [ ] **Step 2: Dev-Server starten + Browser-Smoke**

```bash
cd "$REPO/ue2/sachbearbeiter" && npm run dev
```
Robert: öffne `http://localhost:5173/`, sollte zur `/login` redirecten, Magic-Link anfordern mit `robert.butscher@thws.de`, Link klicken (er kommt nicht zurück auf localhost — das ist OK für jetzt; einfach `/auth/callback` auf localhost mit dem Token aus der Mail-URL aufrufen), Inbox sehen.

Im Plan-Subagent-Run: dieser Schritt erfordert manuelle Interaktion → markieren als „Robert testet". Subagent macht hier Halt und reportet.

- [ ] **Step 3: Tests + Build final**

```bash
cd "$REPO/ue2/sachbearbeiter" && npm test && npm run build
```
Expected: alle Tests grün, dist/ gebaut.

- [ ] **Step 4: Commit**

```bash
git -C "$REPO" add ue2/sachbearbeiter/package-lock.json
git -C "$REPO" commit -m "test(ue2): lokaler Smoke erfolgreich (Login + Inbox + Detail)"
```

---

## Phase 4 — Docker + Traefik-Deploy

### Task 4.1: Dockerfile

**Files:** `ue2/sachbearbeiter/Dockerfile`.

```dockerfile
# Multi-Stage Build (analog lve-frontend-Pattern)
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci --include=dev

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_AUTH_REDIRECT
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_AUTH_REDIRECT=$VITE_AUTH_REDIRECT

RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
```

### Task 4.2: nginx.conf

**Files:** `ue2/sachbearbeiter/docker/nginx.conf`.

```nginx
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA: alle Routen auf index.html (React-Router)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security-Header
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header Referrer-Policy strict-origin-when-cross-origin;

    # Cache statische Assets aggressiv
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Task 4.3: docker-compose.yml

**Files:** `ue2/sachbearbeiter/docker/docker-compose.yml`.

```yaml
services:
  amt-frontend:
    container_name: amt-frontend
    build:
      context: ..
      dockerfile: Dockerfile
      args:
        VITE_SUPABASE_URL: ${VITE_SUPABASE_URL:-https://supabase.butscher.cloud}
        VITE_SUPABASE_ANON_KEY: ${VITE_SUPABASE_ANON_KEY}
        VITE_AUTH_REDIRECT: ${VITE_AUTH_REDIRECT:-https://amt.butscher.cloud/auth/callback}
    image: amt-frontend:latest
    restart: unless-stopped
    networks:
      - root_default
    labels:
      - traefik.enable=true
      - traefik.docker.network=root_default

      # HTTP → HTTPS Redirect
      - traefik.http.routers.amt-http.rule=Host(`amt.butscher.cloud`)
      - traefik.http.routers.amt-http.entrypoints=web
      - traefik.http.routers.amt-http.middlewares=amt-https-redirect
      - traefik.http.middlewares.amt-https-redirect.redirectscheme.scheme=https

      # HTTPS-Router
      - traefik.http.routers.amt.rule=Host(`amt.butscher.cloud`)
      - traefik.http.routers.amt.entrypoints=websecure
      - traefik.http.routers.amt.tls=true
      - traefik.http.routers.amt.tls.certresolver=mytlschallenge
      - traefik.http.routers.amt.service=amt

      - traefik.http.services.amt.loadbalancer.server.port=8080

      # Security-Header-Middleware
      - traefik.http.routers.amt.middlewares=amt-secheaders
      - traefik.http.middlewares.amt-secheaders.headers.stsSeconds=31536000
      - traefik.http.middlewares.amt-secheaders.headers.stsIncludeSubdomains=true
      - traefik.http.middlewares.amt-secheaders.headers.framedeny=true

networks:
  root_default:
    external: true
```

### Task 4.4: docker/.env.example

**Files:** `ue2/sachbearbeiter/docker/.env.example`.

```bash
VITE_SUPABASE_URL=https://supabase.butscher.cloud
VITE_SUPABASE_ANON_KEY=<aus Supabase Studio>
VITE_AUTH_REDIRECT=https://amt.butscher.cloud/auth/callback
```

Commit (Dateien 4.1-4.4):
```bash
git -C "$REPO" add ue2/sachbearbeiter/Dockerfile ue2/sachbearbeiter/docker/
git -C "$REPO" commit -m "feat(ue2): Dockerfile + nginx.conf + docker-compose mit Traefik-Labels für amt.butscher.cloud"
```

### Task 4.5: Push auf GitHub

```bash
git -C "$REPO" push origin main
```

### Task 4.6: VPS-Deployment

- [ ] **Step 1: Repo unter `/opt/amt-frontend` klonen**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "
  mkdir -p /opt/amt-frontend
  cd /opt/amt-frontend
  git clone https://github.com/swrobuts/DigitalisierungVerwaltung.git .
"
```

- [ ] **Step 2: `.env` für Docker-Build befüllen**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "
  cd /opt/amt-frontend/ue2/sachbearbeiter/docker
  cp .env.example .env
  ANON=\$(grep ^ANON_KEY /root/supabase/docker/.env | cut -d= -f2)
  sed -i \"s|VITE_SUPABASE_ANON_KEY=.*|VITE_SUPABASE_ANON_KEY=\${ANON}|\" .env
  grep VITE_SUPABASE_ANON_KEY .env | head -c 50
"
```

- [ ] **Step 3: Build + Run**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "
  cd /opt/amt-frontend/ue2/sachbearbeiter/docker
  docker compose build amt-frontend 2>&1 | tail -10
  docker compose up -d amt-frontend
"
sleep 30
```

- [ ] **Step 4: TLS + Smoke**

```bash
curl -ksI -m 10 https://amt.butscher.cloud/ | head -3
```
Expected: HTTP/2 200, content-type text/html. TLS-Handshake klappt (TLS-Challenge ist durch).

- [ ] **Step 5: GoTrue-Redirect-URL noch mal verifizieren**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "grep ADDITIONAL_REDIRECT_URLS /root/supabase/docker/.env"
```
Expected: enthält `https://amt.butscher.cloud/auth/callback`. Falls nicht: ergänzen und `docker compose up -d auth` (Task 0.2 nochmal).

---

## Phase 5 — End-to-End + Doku

### Task 5.1: End-to-End-Test mit Robert

- [ ] **Step 1: Bürger-Pfad: Antrag absenden**

Robert: öffne `https://swrobuts.github.io/DigitalisierungVerwaltung/ue1/webformular/`, fülle Testantrag aus mit eigener E-Mail (`robert.butscher@thws.de`), submitte. Notiere Antragsnummer aus Bestätigungsseite.

- [ ] **Step 2: Eingangsbestätigungs-Mail in eigenem Posteingang prüfen**

Robert: Mail im Posteingang `robert.butscher@thws.de` aufmachen. Inhalt: Antragsnummer + Datum + Demo-Hinweis. Wenn nicht angekommen: Logs prüfen:

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker logs --since 5m supabase-db 2>&1 | grep -i webhook"
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker logs --since 5m n8n 2>&1 | tail -20"
```

- [ ] **Step 3: Sachbearbeiter-Pfad: Login + Antrag in Inbox sehen**

Robert: öffne `https://amt.butscher.cloud/`, Login mit `robert.butscher@thws.de` Magic-Link, klick Link aus Mail, Inbox geöffnet, neuer Antrag sichtbar.

- [ ] **Step 4: Status-Übergang testen**

Robert: klick Antrag, „→ In Prüfung", Kommentar „E2E-Test", absenden. History zeigt neuen Eintrag mit deiner E-Mail. Inbox-Status hat sich aktualisiert (Realtime).

- [ ] **Step 5: Trigger-Validierung im Browser sichtbar**

Robert: setze auf „Bewilligt". Erfolg. Versuche dann Realtime-Test in zwei Browser-Tabs gleichzeitig — beide aktualisieren sich live.

### Task 5.2: README.md für ue2/sachbearbeiter

**Files:** `ue2/sachbearbeiter/README.md`.

```markdown
# UE2 — Sachbearbeiter-App (`amt.butscher.cloud`)

> **Reifegradstufe 2**: Sachbearbeiter sehen alle eingegangenen Anträge, ändern Status, sehen den vollen Audit-Trail. Bürger bekommt automatische Eingangsbestätigung per Mail.

## Was diese Stufe gewinnt

- **Bürger erfährt: Antrag ist angekommen** — automatische Mail (4 Sprachen)
- **Amt hat eine Inbox** — alle Anträge an einer Stelle, in Echtzeit aktualisiert
- **Workflow als Datenmodell** — erlaubte Übergänge in `apl2.workflow_transition`, validiert vom Postgres-Trigger
- **Audit-Trail** in `apl2.antrag_history` — wer hat wann was geändert, optional mit Kommentar

## Schnellstart (Studi-Variante mit eigener Supabase Cloud)

```bash
git clone https://github.com/swrobuts/DigitalisierungVerwaltung.git
cd DigitalisierungVerwaltung/ue2/sachbearbeiter
cp .env.example .env.local  # mit eigenen Werten füllen
npm install
npm run dev
```

## Doku

- Spec: [`docs/superpowers/specs/2026-05-18-ue2-sachbearbeiter-workflow.md`](../../docs/superpowers/specs/2026-05-18-ue2-sachbearbeiter-workflow.md)
- DB-Migrations: [`supabase/migrations/007–010_*.sql`](../../supabase/migrations/)
- n8n-Workflow: [`supabase/webhooks/n8n-apl2-eingangsbestaetigung.json`](../../supabase/webhooks/n8n-apl2-eingangsbestaetigung.json)

## Demo

https://amt.butscher.cloud · Login mit freigeschalteter `@thws.de`-Adresse (Allowlist in `apl2.allow_email`)

## Hands-on-Aufgabe für Studierende

Erweitert den Workflow um einen 6. Status **„eskaliert"**:

1. SQL: `insert into apl2.workflow_transition values ('in_pruefung','eskaliert'), ('eskaliert','bewilligt'), ('eskaliert','abgelehnt');`
2. `src/lib/workflow.ts`: `Status` um `"eskaliert"` erweitern, `TRANSITIONS` ergänzen, `STATUS_LABELS` ergänzen
3. `src/components/StatusBadge.tsx`: Farbe für „eskaliert"
4. Build + Test
5. Diskussion: Wer darf eskalieren? Wer darf Eskalation aufheben?

Bonus: 5. Sprache im n8n-Workflow ergänzen.
```

Commit:
```bash
git -C "$REPO" add ue2/sachbearbeiter/README.md
git -C "$REPO" commit -m "docs(ue2): README mit Quickstart + Hands-on-Aufgabe"
```

### Task 5.3: Roadmap-Spec-Update

In `docs/superpowers/specs/2026-05-17-roadmap-5-ue-digitalisierung-verwaltung.md` die UE2-Zeile in §3 (Reifegradmodell-Tabelle) finalisieren auf:

```markdown
| **2** | Sachbearbeiter-Workflow | Magic-Link-Auth via GoTrue, Inbox-View, Status-Update (Workflow als Datenmodell mit Postgres-Trigger-Validierung), Audit-Trail, Eingangsbestätigung an Bürger per n8n-Mail (4 Sprachen). Eigene Subdomain amt.butscher.cloud. | React 19 + Tailwind 4 + shadcn/ui + Vite 6 + Supabase Auth + n8n | Demo + Mini-Hands-on (6. Status ergänzen) |
```

Und am Ende von §3 ergänzen:

```markdown
**Spec-Update 2026-05-18 (abends)**: UE2 implementiert in Stufe M (Workflow als Datenmodell). Detail-Spec: `docs/superpowers/specs/2026-05-18-ue2-sachbearbeiter-workflow.md`.
```

Commit:
```bash
git -C "$REPO" add docs/superpowers/specs/2026-05-17-roadmap-5-ue-digitalisierung-verwaltung.md
git -C "$REPO" commit -m "docs(roadmap): UE2 implementiert, Stack + Subdomain final"
```

### Task 5.4: Final-Push + Memory-Update

```bash
git -C "$REPO" push origin main
```

Memory-Update für Folge-Sessions:

In `~/.claude/projects/.../memory/projekt_digitalisierung_verwaltung.md` am Ende ergänzen:

```markdown
**UE2-Sachbearbeiter (2026-05-18 abends):** Live auf `amt.butscher.cloud` (Docker+Traefik via /opt/amt-frontend). Stack: React 19 + Tailwind 4 + shadcn/ui + react-router 7. Auth via Supabase GoTrue Magic-Link, Allowlist in `apl2.allow_email`. State-Machine in `apl2.workflow_transition` mit Postgres-Trigger-Validierung. Audit-Trail in `apl2.antrag_history`. Eingangsbestätigung an Bürger via Database-Webhook (pg_net) → n8n-Workflow (4 Sprachen-Switch) → SMTP (existierende Credential CfjGjVrPcVvoNuWy). Hands-on-Aufgabe: 6. Status „eskaliert" ergänzen.
```

---

## Self-Review

Spec-Abdeckung geprüft:
- [x] Subdomain `amt.butscher.cloud` (Spec §3, §8) — Task 0.2 + 4.3 + 4.6
- [x] 5 Status, 5 Übergänge (§5 Migration 007) — Task 1.1
- [x] Audit-Trail (§5 Migration 008) — Task 1.2
- [x] Allowlist + RLS (§5 Migration 009) — Task 1.3
- [x] n8n-Webhook-Trigger (§5 Migration 010 + §7) — Task 1.4 + 2.1 + 2.2
- [x] React+Tailwind+shadcn (§6) — Task 3.1–3.12
- [x] Magic-Link-Auth (§6) — Task 3.10
- [x] Inbox mit Realtime (§6) — Task 3.7 + 3.11
- [x] AntragDetail mit History + Anlagen (§6) — Task 3.8 + 3.12
- [x] Docker+Traefik (§8) — Task 4.1–4.6
- [x] Hands-on-Aufgabe (§9) — Task 5.2 README
- [x] Roadmap-Update (§10 O3) — Task 5.3

Type-Konsistenz: `Status`-Type konsistent zwischen `workflow.ts`, Hooks, Pages, Komponenten. `AntragRow` (Inbox-Liste) und `AntragFull` (Detail) klar getrennt.

Placeholder-Scan: keine TODOs, keine „add appropriate error handling", alle Code-Snippets vollständig.
