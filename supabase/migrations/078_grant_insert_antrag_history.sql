-- 078_grant_insert_antrag_history.sql
--
-- Bug 9: Frontend changeStatus() macht UPDATE auf apl.antraege + INSERT
-- in apl.antrag_history (siehe packages/data-layer/src/antraege.ts).
-- Die authenticated-Rolle hat in Migration 064 zwar SELECT auf
-- antrag_history bekommen, aber kein INSERT — und auch keine RLS-Policy
-- erlaubt INSERT. Folge: "permission denied for table antrag_history"
-- beim "Empfehlung umsetzen"-Klick in UE3 und beim Workflow-Status-
-- Wechsel in UE2.
--
-- Fix: GRANT INSERT plus RLS-Policy fuer authenticated mit gueltiger
-- apl.current_user_role() — gleiche Logik wie SELECT.

begin;

grant insert on apl.antrag_history to authenticated;

create policy "sachbearbeiter_insert" on apl.antrag_history
  for insert to authenticated
  with check (apl.current_user_role() is not null);

commit;
