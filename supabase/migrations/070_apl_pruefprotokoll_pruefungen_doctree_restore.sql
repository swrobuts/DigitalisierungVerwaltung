-- 070_apl_pruefprotokoll_pruefungen_doctree_restore.sql
--
-- KRITISCHER POST-HARDCUT-RESTORE:
-- Beim apl2 → apl Hard-Cut (Migrationen 060–067) wurden VIER Tabellen
-- vergessen, die das pruefung-Backend zwingend braucht:
--
--   • apl.ahp_plaene           — Master-Tabelle der AHP-Pläne
--   • apl.ahp_doctree          — versionierter Doc-Tree (PageIndex-Stil)
--   • apl.pruefprotokoll       — Audit-Trail aller Prüfungs-Läufe
--   • apl.pruefungen           — Vier-Augen-Prinzip Erst-/Zweitprüfung
--
-- Symptom vor diesem Fix: UE3 "KI-Bescheid erzeugen"-Button schlug fehl,
-- weil das Backend POST /api/pruefen → INSERT INTO apl.pruefprotokoll
-- ausführen will, die Tabelle aber nicht existiert. Sachbearbeiter sahen
-- nur die Workflow-Buttons — keine Konformitäts-Empfehlung, keine Hinweise,
-- keine Bescheid-Historie mit Versions-Linkage.
--
-- Die Definitionen sind 1:1-Ports aus 019_ahp_plaene_und_doctree.sql,
-- 021_pruefprotokoll_und_storage.sql und 037_pruefungen.sql (jeweils
-- apl2-Schema), nur mit `apl2.` → `apl.` und der `current_user_role()`-
-- Funktion aus Migration 069 (auth.jwt()->>'email'-basiert).

begin;

-- ── Enums für apl.pruefungen ─────────────────────────────────────────────
do $$ begin
  create type apl.pruefer_rolle as enum ('erstpruefung', 'zweitpruefung');
exception when duplicate_object then null; end $$;

do $$ begin
  create type apl.pruefer_typ as enum ('mensch', 'ki');
exception when duplicate_object then null; end $$;

do $$ begin
  create type apl.pruefer_modus as enum ('standard', 'adversariell');
exception when duplicate_object then null; end $$;

do $$ begin
  create type apl.entscheidungsvorschlag as enum ('bewilligen', 'ablehnen', 'rueckfragen');
exception when duplicate_object then null; end $$;

-- ── Master-Tabelle AHP-Pläne (statische Lookup-Tabelle) ──────────────────
create table if not exists apl.ahp_plaene (
  id                       text primary key,
  bezeichnung              text not null,
  paragraph_in_richtlinie  text,
  aktiv                    boolean not null default true,
  created_at               timestamptz not null default now()
);

insert into apl.ahp_plaene (id, bezeichnung, paragraph_in_richtlinie) values
  ('AHP-I',   'Aufbau von niedrigschwelligen Angeboten bzw. bürgerschaftlichem Engagement', '§ 2'),
  ('AHP-II',  'Förderung von bürgerschaftlichem Engagement',                                '§ 3'),
  ('AHP-III', 'Förderung bewährter Strukturen',                                              '§ 4'),
  ('AHP-IV',  'Struktur- und Schwerpunktförderung der Seniorenarbeit',                      '§ 5')
on conflict (id) do nothing;

-- ── Versionierter Doc-Tree (Förderrichtlinie → Norm-Knoten) ──────────────
create table if not exists apl.ahp_doctree (
  id           uuid primary key default gen_random_uuid(),
  version      text not null,
  built_at     timestamptz not null default now(),
  tree_jsonb   jsonb not null,
  source_file  text,
  unique (version)
);

create index if not exists idx_apl_doctree_version
  on apl.ahp_doctree (version desc);

-- ── Audit-Trail aller Prüfungs-Läufe ─────────────────────────────────────
create table if not exists apl.pruefprotokoll (
  id                uuid primary key default gen_random_uuid(),
  antrag_id         uuid not null references apl.antraege(id) on delete cascade,
  geprueft_am       timestamptz not null default now(),
  geprueft_von      text,
  doctree_version   text,
  ergebnis_jsonb    jsonb not null,
  pdf_storage_path  text,
  duration_ms       integer
);

create index if not exists idx_apl_pruefprotokoll_antrag
  on apl.pruefprotokoll (antrag_id, geprueft_am desc);

-- ── Vier-Augen-Prinzip: Erst-/Zweitprüfung (Mensch oder KI) ──────────────
create table if not exists apl.pruefungen (
  id                       uuid primary key default gen_random_uuid(),
  antrag_id                uuid not null references apl.antraege(id) on delete cascade,
  rolle                    apl.pruefer_rolle not null,
  pruefer_typ              apl.pruefer_typ not null,
  pruefer_id               text not null,
  pruefer_modus            apl.pruefer_modus,
  pruefprotokoll_id        uuid references apl.pruefprotokoll(id) on delete set null,
  abhakungen_jsonb         jsonb not null default '{}'::jsonb,
  gesamt_kommentar         text,
  entscheidungs_vorschlag  apl.entscheidungsvorschlag,
  abgeschlossen_am         timestamptz,
  angelegt_am              timestamptz not null default now(),

  -- Max 1 Erstprüfung + 1 Zweitprüfung pro Antrag
  unique (antrag_id, rolle)
);

comment on table apl.pruefungen is
  'Bewertungs-Vorgänge pro Antrag (Erst-/Zweitprüfung, Mensch oder KI). '
  'Quelle für Vier-Augen-Prinzip und Abhakungs-Checkliste.';

create index if not exists idx_apl_pruefungen_antrag
  on apl.pruefungen (antrag_id, rolle);
create index if not exists idx_apl_pruefungen_offen
  on apl.pruefungen (antrag_id) where abgeschlossen_am is null;

-- ── bescheide → optional an pruefprotokoll koppeln ───────────────────────
-- Für die Audit-Spur "welcher Bescheid stammt aus welcher Prüfung".
-- Wird vom pruefung-service beim Bescheid-Render gesetzt.
alter table apl.bescheide
  add column if not exists pruefprotokoll_id uuid
    references apl.pruefprotokoll(id) on delete set null;

-- ── Storage-Bucket für PDF-Protokolle ────────────────────────────────────
insert into storage.buckets (id, name, public) values
  ('pruefprotokolle', 'pruefprotokolle', false)
on conflict (id) do nothing;

drop policy if exists "sachbearbeiter_select_pruefprotokoll" on storage.objects;
create policy "sachbearbeiter_select_pruefprotokoll" on storage.objects
  for select to authenticated
  using (bucket_id = 'pruefprotokolle' and apl.current_user_role() is not null);

-- ── RLS-Policies ─────────────────────────────────────────────────────────
alter table apl.pruefprotokoll enable row level security;

drop policy if exists "sachbearbeiter_select_pruefprotokoll_table" on apl.pruefprotokoll;
create policy "sachbearbeiter_select_pruefprotokoll_table"
  on apl.pruefprotokoll for select to authenticated
  using (apl.current_user_role() is not null);

alter table apl.pruefungen enable row level security;

drop policy if exists "sachbearbeiter_select_pruefungen" on apl.pruefungen;
create policy "sachbearbeiter_select_pruefungen"
  on apl.pruefungen for select to authenticated
  using (apl.current_user_role() is not null);

drop policy if exists "sachbearbeiter_insert_pruefungen" on apl.pruefungen;
create policy "sachbearbeiter_insert_pruefungen"
  on apl.pruefungen for insert to authenticated
  with check (apl.current_user_role() is not null);

drop policy if exists "sachbearbeiter_update_pruefungen" on apl.pruefungen;
create policy "sachbearbeiter_update_pruefungen"
  on apl.pruefungen for update to authenticated
  using (apl.current_user_role() is not null);

-- Doctree ist Lookup-Daten — alle authentifizierten Nutzer dürfen lesen.
alter table apl.ahp_doctree   enable row level security;
alter table apl.ahp_plaene    enable row level security;

drop policy if exists "auth_select_doctree" on apl.ahp_doctree;
create policy "auth_select_doctree"
  on apl.ahp_doctree for select to authenticated using (true);

drop policy if exists "auth_select_plaene" on apl.ahp_plaene;
create policy "auth_select_plaene"
  on apl.ahp_plaene for select to authenticated using (true);

-- ── Grants ───────────────────────────────────────────────────────────────
grant select on apl.ahp_plaene, apl.ahp_doctree to authenticated, anon, service_role;
grant insert, update, delete on apl.ahp_doctree to service_role;
grant insert, update, delete on apl.ahp_plaene  to service_role;

grant select on apl.pruefprotokoll to authenticated;
grant insert, select, update, delete on apl.pruefprotokoll to service_role;

grant select, insert, update on apl.pruefungen to authenticated;
grant select, insert, update, delete on apl.pruefungen to service_role;

commit;

notify pgrst, 'reload schema';
