-- 012_grant_schema_usage_apl2.sql
-- Bugfix für Migration 009: authenticated und anon brauchen USAGE auf Schema apl2,
-- sonst greifen die Tabellengrants nicht. Symptom war:
--   ERROR: permission denied for schema apl2
-- beim Frontend-SELECT auf apl2.allow_email (Allowlist-Check im useUserRole-Hook).
-- UE1's submit-antrag nutzt SERVICE_ROLE und bypassed RLS — daher fiel das nicht auf.

grant usage on schema apl2 to authenticated, anon;

notify pgrst, 'reload schema';
