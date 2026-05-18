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

-- GRANTs für authenticated auf alle apl2-Tabellen
grant select on apl2.antraege, apl2.anlagen, apl2.antrag_history,
                apl2.allow_email, apl2.form_translations, apl2.workflow_transition
  to authenticated;
grant update on apl2.antraege to authenticated;

notify pgrst, 'reload schema';
