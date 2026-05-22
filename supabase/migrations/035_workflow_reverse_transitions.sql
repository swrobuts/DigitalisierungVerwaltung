-- 035_workflow_reverse_transitions.sql
--
-- Bisher waren 'bewilligt' und 'abgelehnt' harte Endstatus. Verwaltungs-
-- praktisch braucht es aber Korrektur-Übergänge (Aufhebung einer
-- Bewilligung oder einer Ablehnung), wenn z.B. neue Sachverhalte bekannt
-- werden oder eine Entscheidung im Widerspruchsverfahren aufgehoben wird.
--
-- Wir öffnen drei Reverse-Pfade:
--   bewilligt → in_pruefung   (Aufhebung der Bewilligung)
--   abgelehnt → in_pruefung   (Aufhebung der Ablehnung)
--   in_pruefung → eingegangen (Zurücksetzen vor Bearbeitung)
--
-- Audit bleibt erhalten: Jede dieser Übergänge wird via Trigger
-- log_status_change in apl2.antrag_history mit Sachbearbeiter-Email
-- und Kommentar geloggt.

insert into apl2.workflow_transition (von_status, nach_status) values
  ('bewilligt',   'in_pruefung'),
  ('abgelehnt',   'in_pruefung'),
  ('in_pruefung', 'eingegangen')
on conflict do nothing;

notify pgrst, 'reload schema';
