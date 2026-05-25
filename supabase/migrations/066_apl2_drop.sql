-- 066_apl2_drop.sql
--
-- DESTRUKTIV: löscht das alte apl2-Schema komplett.
--
-- Robert hat explizit OK gegeben ("Ja, ALLES durchziehen inkl. Migration 066").
-- Backup vorhanden: /opt/digitalisierung-verwaltung/backups/pre-apl-migration/
--   - full-dump.sql      (199 MB pg_dumpall)
--   - apl2-only.sql      (apl2-Schema isoliert)
--
-- Vorgehen:
--   1) Storage-Policies, die apl2.current_user_role() referenzieren, droppen
--      und für die noch benötigten Buckets neu auf apl.current_user_role()
--      umschreiben.
--   2) drop schema apl2 cascade — räumt Tabellen, Views, Funktionen, Trigger,
--      Enums, Indexes, Sequences in einem Rutsch ab.
--
-- Buckets die im neuen Schema weiter genutzt werden:
--   - 'bescheide'           → apl-Policy bereits aus Migration 065
--   - 'antragseingang-pdf'  → neue apl-Policy für UE0/UE3-Smart-Upload
--   - 'antragsbelege'       → bleibt; neue apl-Policy (Anlagen-Bucket der UE1)
--   - 'pruefprotokolle'     → wird in Phase 4 neu konzipiert; Policy hier erstmal
--                              ohne Verwendung. Storage-Bucket bleibt für späteres
--                              Re-Konfigurieren.

begin;

-- ── 1) Storage-Policies bereinigen + neu auf apl-Schema ──────────────────
drop policy if exists "sachbearbeiter_select_bescheide_objects" on storage.objects;
drop policy if exists "sachbearbeiter_select_antragsbelege"     on storage.objects;
drop policy if exists "sachbearbeiter_select_pruefprotokoll"    on storage.objects;

-- bescheide wurde bereits in 065 als 'apl_sachbearbeiter_select_bescheide_objects' angelegt,
-- daher hier kein create. Nur die anderen beiden Buckets neu auf apl umstellen.

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='storage' and tablename='objects'
       and policyname='apl_sachbearbeiter_select_antragsbelege'
  ) then
    create policy "apl_sachbearbeiter_select_antragsbelege"
      on storage.objects for select to authenticated
      using (bucket_id = 'antragsbelege' and apl.current_user_role() is not null);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='storage' and tablename='objects'
       and policyname='apl_sachbearbeiter_select_pruefprotokoll'
  ) then
    create policy "apl_sachbearbeiter_select_pruefprotokoll"
      on storage.objects for select to authenticated
      using (bucket_id = 'pruefprotokolle' and apl.current_user_role() is not null);
  end if;
end $$;

-- ── 2) apl2 komplett droppen ─────────────────────────────────────────────
drop schema apl2 cascade;

-- ── 3) Verifikation ───────────────────────────────────────────────────────
do $$
declare
  apl2_count int;
  remaining_policies int;
begin
  select count(*) into apl2_count
    from information_schema.schemata where schema_name='apl2';
  if apl2_count <> 0 then
    raise exception 'Migration 066 — apl2-Schema noch da nach drop!';
  end if;

  select count(*) into remaining_policies
    from pg_policies
   where qual like '%apl2%' or with_check like '%apl2%';
  if remaining_policies <> 0 then
    raise exception 'Migration 066 — % Policies referenzieren noch apl2', remaining_policies;
  end if;

  raise notice 'Migration 066 OK — apl2-Schema entsorgt, keine Policy-Leichen.';
end $$;

commit;

notify pgrst, 'reload schema';
