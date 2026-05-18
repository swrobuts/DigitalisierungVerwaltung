-- 013_fix_jwt_claim_path.sql
-- Bugfix für Migrationen 008+009: PostgREST setzt nur `request.jwt.claims`
-- (jsonb-string), NICHT die einzelnen `request.jwt.claim.<key>`-Variablen.
-- Daher gab `current_setting('request.jwt.claim.email', true)` immer NULL
-- zurück → current_user_role() = NULL → RLS-Policy denied → Frontend bekam
-- für alle authenticated-Queries leere Ergebnisse.
--
-- Symptom: Robert konnte einloggen (GoTrue OK), aber `useUserRole`-Hook im
-- Frontend lieferte rolle=null, AuthGuard navigierte zurück zu /login.

-- 1. current_user_role(): lies email aus request.jwt.claims (jsonb)
create or replace function apl2.current_user_role() returns text language sql security definer
set search_path = apl2, public as $$
  select rolle from apl2.allow_email
  where email = (nullif(current_setting('request.jwt.claims', true), ''))::jsonb->>'email'
  limit 1
$$;

-- 2. log_status_change(): geaendert_von kommt auch aus dem JWT
create or replace function apl2.log_status_change() returns trigger language plpgsql as $$
declare
  claims_email text;
begin
  claims_email := (nullif(current_setting('request.jwt.claims', true), ''))::jsonb->>'email';
  insert into apl2.antrag_history (antrag_id, von_status, nach_status, geaendert_von, kommentar)
  values (new.id, old.status, new.status,
          coalesce(claims_email, 'unknown'),
          current_setting('apl2.transition_kommentar', true));
  return new;
end $$;

notify pgrst, 'reload schema';
