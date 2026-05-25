-- 064_apl_grants_und_rls.sql
-- Schema-Usage + Allowlist + RLS für das neue apl-Schema.
-- Analog zu 009 + 012, aber mit FB-übergreifender Antragstabelle und FB-Detail-Tabellen.

-- ─── Allowlist ─────────────────────────────────────────────────────────────
create table apl.allow_email (
  email      text primary key,
  rolle      text not null check (rolle in ('bearbeiter','vorgesetzter','admin')),
  notiz      text,
  created_at timestamptz not null default now()
);

-- SECURITY DEFINER, damit Policies via Function-Call die allow_email-Tabelle prüfen
-- ohne dass authenticated direkt SELECT-Rechte auf allow_email braucht.
create or replace function apl.current_user_role() returns text language sql security definer
set search_path = apl, public as $$
  select rolle from apl.allow_email
  where email = current_setting('request.jwt.claim.email', true)
  limit 1
$$;

grant execute on function apl.current_user_role() to authenticated;

-- Bestehende Bearbeiter aus apl2 spiegeln (damit nach apl2-Drop niemand ausgesperrt ist).
-- Falls apl2.allow_email nicht existiert, ist das ein NO-OP.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='apl2' and table_name='allow_email') then
    insert into apl.allow_email (email, rolle, notiz, created_at)
    select email, rolle, coalesce(notiz, '') || ' (migriert aus apl2)', created_at
    from apl2.allow_email
    on conflict (email) do nothing;
  end if;
end $$;

-- ─── Schema-Usage ─────────────────────────────────────────────────────────
grant usage on schema apl to authenticated, anon;

-- ─── RLS: Antraege ────────────────────────────────────────────────────────
alter table apl.antraege enable row level security;

create policy "sachbearbeiter_select" on apl.antraege
  for select to authenticated using (apl.current_user_role() is not null);

create policy "sachbearbeiter_update" on apl.antraege
  for update to authenticated
  using (apl.current_user_role() is not null)
  with check (apl.current_user_role() is not null);

-- ─── RLS: FB-Detail-Tabellen ──────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'fb_i_projekt', 'fb_ii_ehrenamt', 'fb_ii_helfer',
    'fb_iii_variante', 'fb_iv_freitext', 'anlagen',
    'antrag_history', 'manuelle_pruefung', 'ahp_norm_statements'
  ]
  loop
    execute format('alter table apl.%I enable row level security', t);
    execute format(
      'create policy "sachbearbeiter_select" on apl.%I
         for select to authenticated using (apl.current_user_role() is not null)', t);
  end loop;
end $$;

-- manuelle_pruefung darf der Sachbearbeiter zusätzlich schreiben (UE2 Prüfvermerke)
create policy "sachbearbeiter_write" on apl.manuelle_pruefung
  for all to authenticated
  using (apl.current_user_role() is not null)
  with check (apl.current_user_role() is not null);

-- allow_email: Bearbeiter darf sehen wer Zugang hat
alter table apl.allow_email enable row level security;
create policy "authenticated_select" on apl.allow_email
  for select to authenticated using (apl.current_user_role() is not null);

-- ─── GRANTs ────────────────────────────────────────────────────────────────
grant select on
  apl.antraege, apl.fb_i_projekt, apl.fb_ii_ehrenamt, apl.fb_ii_helfer,
  apl.fb_iii_variante, apl.fb_iv_freitext, apl.anlagen,
  apl.antrag_history, apl.manuelle_pruefung, apl.ahp_norm_statements,
  apl.allow_email
to authenticated;

grant update on apl.antraege to authenticated;
grant insert, update, delete on apl.manuelle_pruefung to authenticated;

-- anon braucht KEIN select auf antraege (Formular-Submit läuft via service_role
-- in der Edge Function, siehe Migration 065).

notify pgrst, 'reload schema';
