-- 036_workflow_querweg.sql
--
-- Quer-Übergänge zwischen Entscheidungs-Status, damit der Sachbearbeiter
-- die KI-Empfehlung direkt umsetzen kann — ohne Zwangs-Umweg über
-- in_pruefung. Beispiel: KI empfiehlt BEWILLIGEN, aktueller Status
-- ist ABGELEHNT → bisher zwei Schritte (Korrektur zurück + Bewilligen),
-- jetzt ein Klick.
--
-- Verwaltungs-Audit bleibt intakt: jeder Übergang wird via
-- log_status_change-Trigger mit Sachbearbeiter-Email + Pflicht-Kommentar
-- in apl2.antrag_history protokolliert.

insert into apl2.workflow_transition (von_status, nach_status) values
  ('bewilligt', 'abgelehnt'),
  ('bewilligt', 'rueckfrage'),
  ('abgelehnt', 'bewilligt'),
  ('abgelehnt', 'rueckfrage'),
  ('rueckfrage', 'bewilligt'),
  ('rueckfrage', 'abgelehnt')
on conflict do nothing;

notify pgrst, 'reload schema';
