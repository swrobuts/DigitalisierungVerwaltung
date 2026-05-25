-- 059_halbgott_felder_drop.sql
--
-- Halbgott-Felder aus apl2.antraege entfernen — Architektur-Schuld-Cleanup
-- 2026-05-25.
--
-- Hintergrund: Sechs Spalten standen seit Migrationen 029/030 und 042 im
-- Schema, wurden in Backend/Inbox/KI-Bescheid verwendet — aber NIE vom
-- Antragsprozess erhoben:
--
--   - anzahl_teilnehmer
--   - anzahl_treffen_jahr
--   - stadtbewohner_anteil
--   - anzahl_ehrenamtliche
--   - geleistete_stunden_jahr
--   - foerderbereich_seit_jahren
--
-- Weder im amtlichen Antrags-PDF (materialien/antrag-apl2.pdf) noch im
-- UE1-Webformular werden diese Felder abgefragt. FAKE-Werte stammen aus
-- Bauchgefühl-Seed (042). Frontend/Backend wurden parallel bereinigt —
-- diese Migration zieht das DB-Schema nach.
--
-- Reihenfolge:
--   1) View apl2.antrag_mit_summen droppen (selektiert noch 3 der Spalten)
--   2) 6 ALTER TABLE DROP COLUMN
--   3) View neu erstellen ohne die 3 inkludierten Spalten
--   4) GRANTs neu setzen (Lesson aus 055/056)
--   5) PostgREST Schema-Reload
--   6) Verifikation
--
-- WICHTIG: Diese Migration wird NICHT automatisch deployed — Robert (Controller)
-- wendet sie nach Frontend+Backend-Verify selbst an.

begin;

-- 1) View droppen (CASCADE wäre brutal, aber lt. 058 ist es die einzige
--    View auf antraege, die diese Spalten referenziert)
drop view if exists apl2.antrag_mit_summen;

-- 2) Halbgott-Spalten aus apl2.antraege droppen
alter table apl2.antraege drop column if exists anzahl_teilnehmer;
alter table apl2.antraege drop column if exists anzahl_treffen_jahr;
alter table apl2.antraege drop column if exists stadtbewohner_anteil;
alter table apl2.antraege drop column if exists anzahl_ehrenamtliche;
alter table apl2.antraege drop column if exists geleistete_stunden_jahr;
alter table apl2.antraege drop column if exists foerderbereich_seit_jahren;

-- 3) View neu erstellen — Spaltenliste identisch zu 058 minus den drei
--    inkludierten Halbgott-Spalten (stadtbewohner_anteil,
--    anzahl_teilnehmer, anzahl_treffen_jahr). Die anderen drei
--    (anzahl_ehrenamtliche, geleistete_stunden_jahr,
--    foerderbereich_seit_jahren) waren ohnehin nicht in der View.
create view apl2.antrag_mit_summen as
select
  a.id,
  a.antragsnummer,
  a.haushaltsjahr,
  a.name,
  a.traeger,
  a.bankverbindung,
  a.iban,
  a.bic,
  a.ansprechpartner,
  a.telefon,
  a.email,
  a.raeume_vorhanden,
  a.raeume_unentgeltlich,
  a.antragsdatum,
  a.submitted_language,
  a.submitted_at,
  a.user_agent,
  a.ip_address,
  a.status,
  a.strasse,
  a.hausnummer,
  a.plz,
  a.ort,
  a.geforderte_foerdersumme_euro,
  a.foerderbereich,
  a.zuwendungszweck,
  a.finanzplanung_vorhanden,
  a.projektskizze_eingereicht,
  a.logo_verwendet,
  coalesce((
    select sum(b.betrag_euro)
    from apl2.belegposition b
    where b.antrag_id = a.id and b.belegtyp = 'betriebskosten'
  ), 0::numeric) as betriebskosten_vorjahr_euro,
  coalesce((
    select sum(b.betrag_euro)
    from apl2.belegposition b
    where b.antrag_id = a.id and b.belegtyp = 'personalkosten'
  ), 0::numeric) as personalkosten_vorjahr_euro,
  coalesce((
    select sum(b.betrag_euro)
    from apl2.belegposition b
    where b.antrag_id = a.id and b.belegtyp = 'miete'
  ), 0::numeric) as miete_jahr_euro,
  -- Durchlaufzeit-Felder (Migration 058)
  (select min(h.geaendert_am)
     from apl2.antrag_history h
    where h.antrag_id = a.id
      and h.nach_status in ('bewilligt', 'abgelehnt')
  ) as entschieden_am,
  (select h.nach_status
     from apl2.antrag_history h
    where h.antrag_id = a.id
      and h.nach_status in ('bewilligt', 'abgelehnt')
    order by h.geaendert_am asc
    limit 1
  ) as entscheidungs_typ,
  case
    when a.status in ('bewilligt', 'abgelehnt') then
      greatest(0, extract(day from
        coalesce(
          (select min(h.geaendert_am)
             from apl2.antrag_history h
            where h.antrag_id = a.id
              and h.nach_status in ('bewilligt', 'abgelehnt')),
          now()
        ) - a.submitted_at
      ))::int
    else
      greatest(0, extract(day from now() - a.submitted_at))::int
  end as durchlaufzeit_tage
from apl2.antraege a;

comment on view apl2.antrag_mit_summen is
  'Antrag mit aggregierten Kostenpositionen + Durchlaufzeit. '
  'Migration 059: Halbgott-Spalten (anzahl_teilnehmer, '
  'stadtbewohner_anteil, anzahl_treffen_jahr) entfernt — wurden nie '
  'vom Antragsprozess erhoben.';

-- 4) GRANTs neu setzen (Lesson aus 055/056)
grant select on apl2.antrag_mit_summen to authenticated, anon, service_role;

commit;

-- 5) PostgREST muss neuen Schema-Cache laden
notify pgrst, 'reload schema';

-- 6) Verifikation — keine der 6 Halbgott-Spalten darf noch in
--    apl2.antraege existieren.
do $$
declare
  uebrig_spalten int;
begin
  select count(*) into uebrig_spalten
    from information_schema.columns
   where table_schema = 'apl2'
     and table_name   = 'antraege'
     and column_name in (
       'anzahl_teilnehmer',
       'anzahl_treffen_jahr',
       'stadtbewohner_anteil',
       'anzahl_ehrenamtliche',
       'geleistete_stunden_jahr',
       'foerderbereich_seit_jahren'
     );
  if uebrig_spalten <> 0 then
    raise exception
      'Migration 059 — % Halbgott-Spalte(n) noch in apl2.antraege vorhanden',
      uebrig_spalten;
  end if;
  raise notice 'Migration 059 OK: alle 6 Halbgott-Spalten entfernt; View neu erstellt mit GRANTs.';
end $$;
