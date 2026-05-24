-- 057_manuelle_pruefung.sql
--
-- UE2: manuelle Sachbearbeitungs-Notizen pro Antrags-Paragraph.
-- Pendant zur KI-Prüfung in UE3 (apl2.pruefungen) — aber rein
-- menschlich geführt.
--
-- Pro (antrag_id, paragraph) eine Zeile mit:
--   - status: offen | ok | fraglich | fehlt
--   - kommentar: freie Notiz des Sachbearbeitenden
--   - geprueft_von / geprueft_am: wer hat zuletzt gespeichert
--
-- Berechtigung: jede Sachbearbeiter-Rolle (apl2.current_user_role()
-- liefert nicht NULL) darf insert/update/select. Bürger (anon) hat
-- keinen Zugriff — manuelle Prüfvermerke sind interne Verwaltungsakten.

begin;

create type apl2.pruefstatus as enum ('offen', 'ok', 'fraglich', 'fehlt');

create table apl2.manuelle_pruefung (
  id            uuid primary key default gen_random_uuid(),
  antrag_id     uuid not null references apl2.antraege(id) on delete cascade,
  paragraph     text not null,
  status        apl2.pruefstatus not null default 'offen',
  kommentar     text,
  geprueft_von  uuid references auth.users(id) on delete set null,
  geprueft_am   timestamptz not null default now(),
  constraint manuelle_pruefung_unique_per_paragraph unique (antrag_id, paragraph)
);

comment on table apl2.manuelle_pruefung is
  'UE2: manuelle Sachbearbeitungs-Notizen pro Antrags-Paragraph. '
  'Pendant zur KI-Prüfung in apl2.pruefungen aus UE3.';

create index manuelle_pruefung_antrag_idx on apl2.manuelle_pruefung(antrag_id);

-- RLS: nur Sachbearbeiter (auf der Allowlist) darf
alter table apl2.manuelle_pruefung enable row level security;

create policy "sachbearbeiter_select_manuelle_pruefung" on apl2.manuelle_pruefung
  for select to authenticated
  using (apl2.current_user_role() is not null);

create policy "sachbearbeiter_insert_manuelle_pruefung" on apl2.manuelle_pruefung
  for insert to authenticated
  with check (apl2.current_user_role() is not null);

create policy "sachbearbeiter_update_manuelle_pruefung" on apl2.manuelle_pruefung
  for update to authenticated
  using (apl2.current_user_role() is not null)
  with check (apl2.current_user_role() is not null);

create policy "sachbearbeiter_delete_manuelle_pruefung" on apl2.manuelle_pruefung
  for delete to authenticated
  using (apl2.current_user_role() is not null);

grant select, insert, update, delete on apl2.manuelle_pruefung
  to authenticated, service_role;
-- anon bleibt explizit weg (interne Verwaltungsakten)

-- Auto-Bump von geprueft_am bei Update — Trigger
create or replace function apl2.bump_manuelle_pruefung_timestamp()
returns trigger language plpgsql as $$
begin
  new.geprueft_am := now();
  return new;
end $$;

create trigger trg_bump_manuelle_pruefung_timestamp
  before update on apl2.manuelle_pruefung
  for each row execute function apl2.bump_manuelle_pruefung_timestamp();

-- Verifikation
do $$
declare
  policy_count int;
begin
  select count(*) into policy_count from pg_policies
   where schemaname = 'apl2' and tablename = 'manuelle_pruefung';
  if policy_count <> 4 then
    raise exception 'Migration 057 — erwartete 4 Policies auf manuelle_pruefung, fand %', policy_count;
  end if;
  raise notice 'Migration 057 OK: manuelle_pruefung mit 4 RLS-Policies + Trigger + Index.';
end $$;

commit;

notify pgrst, 'reload schema';
