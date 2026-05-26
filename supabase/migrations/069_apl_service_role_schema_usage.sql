-- 068_apl_service_role_schema_usage.sql
-- Schema-USAGE für service_role auf `apl` — vorher nur authenticated + anon
-- hatten USAGE, dadurch konnte der n8n-Workflow (mit service_role-Key)
-- selbst trotz Table-Grants nicht auf apl.* zugreifen (42501).
--
-- Symptom (vor diesem Fix):
--   n8n-Execution: 403 "permission denied for schema apl" auf erstem
--   PATCH apl.antrag_einreichung.
--
-- Auch Default-Privs für künftige Tabellen/Sequences mitnehmen.

begin;

grant usage on schema apl to service_role;

grant all on all tables    in schema apl to service_role;
grant all on all sequences in schema apl to service_role;

alter default privileges in schema apl
  grant all on tables    to service_role;
alter default privileges in schema apl
  grant all on sequences to service_role;

notify pgrst, 'reload schema';

commit;
