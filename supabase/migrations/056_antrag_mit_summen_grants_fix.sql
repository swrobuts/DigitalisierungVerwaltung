-- 056_antrag_mit_summen_grants_fix.sql
--
-- P0-Bugfix: Migration 055 hat per `drop view + create view` die View
-- `apl2.antrag_mit_summen` neu erstellt, dabei aber das GRANT-Statement
-- vergessen, das in den vorherigen Migrationen (016, 025, 029) jeweils
-- am Ende mitlief. Folge: nur postgres + service_role haben SELECT —
-- alle eingeloggten Cockpit-User (Rolle authenticated) bekommen
-- "permission denied for view antrag_mit_summen". Inbox ist leer.
--
-- Betroffene Frontends: UE2 (amt.butscher.cloud) UND UE3 (ki.butscher.cloud).
-- Backend (pruefung-API) ist nicht betroffen, weil es als service_role
-- gegen Supabase rüberkommt.
--
-- Fix: GRANT nachziehen, PostgREST-Schema reloaden.

begin;

grant select on apl2.antrag_mit_summen to authenticated, anon, service_role;

-- Verifikation: nach dieser Migration müssen authenticated + anon
-- in role_table_grants stehen.
do $$
declare
  missing_grants int;
begin
  select 2 - count(distinct grantee) into missing_grants
    from information_schema.role_table_grants
   where table_schema   = 'apl2'
     and table_name     = 'antrag_mit_summen'
     and privilege_type = 'SELECT'
     and grantee in ('authenticated', 'anon');
  if missing_grants > 0 then
    raise exception
      'Migration 056 — % von 2 erwarteten Grants (authenticated, anon) fehlen.',
      missing_grants;
  end if;
  raise notice 'Migration 056 OK: SELECT auf antrag_mit_summen für authenticated + anon gesetzt.';
end $$;

commit;

notify pgrst, 'reload schema';
