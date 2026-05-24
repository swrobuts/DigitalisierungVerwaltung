-- 045_telefon_bankname_optional.sql
--
-- P0-Bug, vom Pre-Mortem entdeckt:
-- - UE1-Formular (Step 2) markiert telefon + bankverbindung als required=false.
-- - submit.ts sendet bei leerem Wert explizit null.
-- - DB-Spalten waren bis hierher NOT NULL → Submit crasht mit
--   „null value in column ... violates not-null constraint".
--
-- Code/UI-Intent: optional. DB folgt dem nach. Bestehende Anträge mit
-- gefüllten Werten bleiben unverändert.

begin;

alter table apl2.antraege
  alter column telefon drop not null,
  alter column bankverbindung drop not null;

comment on column apl2.antraege.telefon is
  'NULL erlaubt seit Migration 045: UE1-Antragsformular markiert das Feld als optional (Email reicht für Korrespondenz, AHP 3.6).';
comment on column apl2.antraege.bankverbindung is
  'NULL erlaubt seit Migration 045: Bankname ist aus IBAN ableitbar, AHP 3.6 verlangt nur das Konto = IBAN.';

commit;

notify pgrst, 'reload schema';
