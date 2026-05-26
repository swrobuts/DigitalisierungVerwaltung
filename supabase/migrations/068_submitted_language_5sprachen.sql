-- 068_submitted_language_5sprachen.sql
-- Sprach-Picker im Frontend (UE0 + UE1) wurde von 2 auf 5 Sprachen erweitert:
-- DE/TR sind vollständig übersetzt, IT/RU/FR sind sichtbar im Picker und
-- werden im UI auf DE-Fallback gerendert — die *gewählte* Bürgersprache
-- wird trotzdem als submitted_language gespeichert, damit man später
-- pro Antrag nachvollziehen kann, in welcher Sprache der Bürger das
-- Formular eingereicht hat (relevant für Sprach-Priorisierung der
-- nächsten Übersetzungs-Iterationen, Rückfragen-Schreiben, Statistik).
--
-- Vorher: CHECK (submitted_language in ('de', 'tr'))
-- Jetzt:  CHECK (submitted_language in ('de', 'tr', 'it', 'ru', 'fr'))

alter table apl.antraege
  drop constraint if exists antraege_submitted_language_check;

alter table apl.antraege
  add constraint antraege_submitted_language_check
  check (submitted_language in ('de', 'tr', 'it', 'ru', 'fr'));

comment on column apl.antraege.submitted_language is
  'Vom Bürger im Sprach-Picker gewählte Anzeigesprache zum Submit-Zeitpunkt. '
  'Aktuell vollständig übersetzt: de, tr. Sichtbar (mit DE-Fallback): it, ru, fr. '
  'Dient als Indiz für Priorisierung weiterer Übersetzungs-Roll-outs.';
