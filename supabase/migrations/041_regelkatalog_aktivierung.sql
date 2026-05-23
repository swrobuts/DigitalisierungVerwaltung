-- 041_regelkatalog_aktivierung.sql
--
-- Stufe-A-Editierung für den Regelkatalog: aktiv/inaktiv-Toggle pro Regel
-- (Stufe B+C bewusst nicht — Logik-Änderungen sind Rechtsänderungen und
-- gehören in Code/Migration, nicht in eine UI für Sachbearbeiter:innen).
--
-- Audit-Spalten direkt in der Tabelle:
--   geaendert_am   — Zeitstempel der letzten Aktiv-Änderung
--   geaendert_von  — Email des Admins, der zuletzt umgeschaltet hat
--   aenderungsgrund — Free-Text-Begründung (für Audit)

alter table apl2.ontologie_rules
  add column if not exists geaendert_am   timestamptz,
  add column if not exists geaendert_von  text,
  add column if not exists aenderungsgrund text;

-- DDL für RLS-Policy: nur Admins dürfen das aktiv-Feld + Audit-Felder
-- updaten. Andere Spalten bleiben für alle authentifizierten Sachbearbeiter
-- read-only.
do $$
begin
  if pg_has_role(current_user, 'supabase_admin', 'MEMBER')
     or current_user = 'supabase_admin' then
    drop policy if exists "admin_toggle_ontologie_rules" on apl2.ontologie_rules;
    create policy "admin_toggle_ontologie_rules"
      on apl2.ontologie_rules for update
      to authenticated
      using (apl2.current_user_role() = 'admin')
      with check (apl2.current_user_role() = 'admin');
    grant update (aktiv, geaendert_am, geaendert_von, aenderungsgrund)
      on apl2.ontologie_rules to authenticated;
  else
    raise notice 'Skipping RLS — User % hat keine supabase_admin-Rechte.', current_user;
  end if;
end $$;

notify pgrst, 'reload schema';
