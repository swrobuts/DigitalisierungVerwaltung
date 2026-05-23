-- 038_workflow_zweitpruefung.sql
--
-- Zwei neue Workflow-Status für Vier-Augen-Prinzip:
--   zweitpruefung_offen     — Erstprüfung abgeschlossen, Zweitprüfung erforderlich
--   zweitpruefung_dissens   — Erst- und Zweitprüfer haben unterschiedliche Vorschläge
--
-- Status sind im Datenmodell free-form text (siehe Migration 007), die
-- Validierung läuft über apl2.workflow_transition. Wir müssen also nur
-- die erlaubten Übergänge einfügen.

insert into apl2.workflow_transition (von_status, nach_status) values
  -- Vorwärts in Zweitprüfung
  ('in_pruefung',           'zweitpruefung_offen'),

  -- Zweitprüfung-Endzustände
  ('zweitpruefung_offen',   'zweitpruefung_dissens'),
  ('zweitpruefung_offen',   'bewilligt'),
  ('zweitpruefung_offen',   'abgelehnt'),
  ('zweitpruefung_offen',   'rueckfrage'),

  -- Dissens-Auflösung durch Sachbearbeiter
  ('zweitpruefung_dissens', 'bewilligt'),
  ('zweitpruefung_dissens', 'abgelehnt'),
  ('zweitpruefung_dissens', 'rueckfrage'),
  ('zweitpruefung_dissens', 'in_pruefung'),  -- zurück zur Erstprüfung erzwingen

  -- Reverse: aus Zweitprüfung zurück (z.B. wenn Sachbearbeiter merkt,
  -- dass die Zweitprüfungs-Anforderung ein Fehler war)
  ('zweitpruefung_offen',   'in_pruefung')
on conflict do nothing;

notify pgrst, 'reload schema';
