-- 005_pgrst_apl2_schema.sql — PostgREST muss apl2 in seiner Schema-Liste kennen
--
-- Hintergrund: In self-hosted Supabase (und in supabase.com Cloud Studio)
-- wird die PostgREST-Schema-Liste NICHT primär per ENV gesteuert, sondern als
-- Postgres-GUC am authenticator-Role. Das überschreibt PGRST_DB_SCHEMAS.
-- Lösung: GUC um apl2 erweitern und PostgREST reloaden.
--
-- WICHTIG: Diese Migration muss als POSTGRES-Superuser eingespielt werden.
-- Studi-Variante: im Supabase-Studio → Settings → API → "Exposed schemas" →
-- "apl2" hinzufügen. Das macht intern das gleiche.

-- Aktuelle Schema-Liste auslesen (informativ — nicht idempotent zu setzen,
-- weil hier konkrete Vorhandene Schemas dranhängen können). Nimm den Wert aus:
-- select rolconfig from pg_roles where rolname = 'authenticator';

-- Pragmatischer Ansatz: append "apl2" zur bestehenden Liste.
-- Wenn die Liste bereits "apl2" enthält, ist das ein No-Op.

do $$
declare
  current_schemas text;
  schemas_array text[];
begin
  select replace(unnest(rolconfig)::text, 'pgrst.db_schemas=', '')
  into current_schemas
  from pg_roles
  where rolname = 'authenticator'
    and exists (
      select 1 from unnest(rolconfig) as cfg where cfg like 'pgrst.db_schemas=%'
    );

  if current_schemas is null then
    -- Noch keine GUC gesetzt → mit minimalem Set anlegen
    execute format('alter role authenticator set pgrst.db_schemas = %L', 'public, apl2');
  else
    -- Bereits gesetzt → apl2 anhängen falls nicht enthalten
    schemas_array := string_to_array(current_schemas, ',');
    if not exists (select 1 from unnest(schemas_array) as s where trim(s) = 'apl2') then
      execute format('alter role authenticator set pgrst.db_schemas = %L',
                     current_schemas || ', apl2');
    end if;
  end if;
end $$;

-- PostgREST darüber informieren (re-loaded den Cache)
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
