-- 004_rls_policies.sql — RLS für apl2-Schema + GRANTs

-- RLS aktivieren
alter table apl2.antraege          enable row level security;
alter table apl2.anlagen           enable row level security;
alter table apl2.form_translations enable row level security;

-- form_translations: anon darf SELECT (für künftiges Live-Reload)
drop policy if exists "anon select translations" on apl2.form_translations;
create policy "anon select translations" on apl2.form_translations
  for select to anon using (true);

-- antraege + anlagen: KEINE Policy für anon → default-deny
-- service_role hat Supabase-Default-Bypass auf RLS, braucht keine explicite Policy

-- GRANTs: Schema-USAGE und SELECT auf translations für anon
grant usage on schema apl2 to anon;
grant select on apl2.form_translations to anon;

-- service_role: voller Zugriff (Edge Function nutzt service_role)
grant usage on schema apl2 to service_role;
grant all privileges on all tables in schema apl2 to service_role;
grant all privileges on all sequences in schema apl2 to service_role;
alter default privileges in schema apl2 grant all on tables to service_role;
alter default privileges in schema apl2 grant all on sequences to service_role;
