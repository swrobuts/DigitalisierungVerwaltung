-- 079_history_backfill.sql
--
-- Bug 10: Die Verlauf-Card in UE2 + UE3 zeigte "Keine History-Eintraege"
-- fuer alle Demo-Antraege. Grund: Migration 073 (TRUNCATE + 6 INSERTs)
-- legt die Antraege direkt in apl.antraege an, schreibt aber NICHT in
-- apl.antrag_history. Status-Wechsel im UI haetten Eintraege erzeugt,
-- aber bis Migration 078 fehlten die Permissions — also keine History.
--
-- Fix: fuer jeden Antrag, der noch keinen History-Eintrag hat, einen
-- initialen "Eingang"-Eintrag nachtragen (von_status=NULL, nach_status=
-- aktueller status, geaendert_am=submitted_at, geaendert_von='system').

begin;

insert into apl.antrag_history
  (antrag_id, von_status, nach_status, kommentar, geaendert_von, geaendert_am)
select
  a.id,
  null,
  a.status,
  'Demo-Einreichung (Migration 079 backfill)',
  'system',
  a.submitted_at
from apl.antraege a
where not exists (
  select 1 from apl.antrag_history h where h.antrag_id = a.id
);

do $$
declare
  cnt int;
begin
  select count(*) into cnt from apl.antrag_history where geaendert_von = 'system';
  raise notice 'History-Backfill: % Initial-Eintraege geschrieben', cnt;
end $$;

commit;
