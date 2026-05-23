-- 039_bescheide_delete_policy.sql
--
-- Bisher konnte der Sachbearbeiter Bescheide im Frontend nicht löschen:
-- es gab nur eine SELECT-Policy (Migration 027), DELETE wurde von RLS
-- still blockiert (kein Error, aber 0 Zeilen betroffen). Das gleiche
-- Problem für die zugehörigen Storage-Objects.
--
-- Fix: DELETE-Policy + GRANT für die Tabelle UND DELETE-Policy für die
-- Storage-Objekte im 'bescheide'-Bucket — beides nur für eingeloggte
-- Sachbearbeiter:innen.

-- ── Tabelle apl2.bescheide ────────────────────────────────────────
drop policy if exists "sachbearbeiter_delete_bescheide" on apl2.bescheide;
create policy "sachbearbeiter_delete_bescheide"
  on apl2.bescheide for delete
  to authenticated
  using (apl2.current_user_role() is not null);

grant delete on apl2.bescheide to authenticated;

-- ── Storage-Bucket 'bescheide' ────────────────────────────────────
-- Analog zur SELECT-Policy: jede:r authentifizierte Sachbearbeiter:in
-- darf Objekte des Buckets löschen (Demo-Setup; in Production sollte
-- man hier auf einen konkreten Mandanten beschränken).
drop policy if exists "sachbearbeiter_delete_bescheide_objects" on storage.objects;
create policy "sachbearbeiter_delete_bescheide_objects"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'bescheide');

-- ── Tabelle apl2.pruefungen ───────────────────────────────────────
-- Reset-Knopf in der ZweitpruefungsCard hatte dasselbe Problem:
-- Migration 037 hatte INSERT + UPDATE freigegeben, aber kein DELETE.
drop policy if exists "sachbearbeiter_delete_pruefungen" on apl2.pruefungen;
create policy "sachbearbeiter_delete_pruefungen"
  on apl2.pruefungen for delete
  to authenticated
  using (apl2.current_user_role() is not null);

grant delete on apl2.pruefungen to authenticated;

notify pgrst, 'reload schema';
