-- 055_bic_not_null_legacy_drop.sql
--
-- Robert-Entscheidung (Final-Konsistenz-Sweep, 2026-05-24):
--   1) BIC strikt NOT NULL — alle bisherigen Anträge haben BIC gesetzt.
--   2) Drei _legacy-Spalten droppen, die in Migration 016 zu
--      Belegpositionen ausgelagert wurden:
--        - betriebskosten_vorjahr_euro_legacy
--        - personalkosten_vorjahr_euro_legacy
--        - monatliche_miete_euro_legacy
--      Diese werden nirgendwo mehr geschrieben oder gelesen — die
--      View `antrag_mit_summen` aggregiert über belegposition.
--
-- View-Vorbehandlung: `antrag_mit_summen` selektiert die _legacy-Spalten
--   noch durch (geprüft mit pg_get_viewdef). Sie muss vor dem DROP
--   COLUMN neu erstellt werden, sonst CASCADE-Fehler.

begin;

-- Sicherheitsgurt 1: BIC-NULL-Check (Audit vor Migration: 0 NULLs).
do $$
declare null_bic int;
begin
  select count(*) into null_bic from apl2.antraege where bic is null;
  if null_bic > 0 then
    raise exception
      'Migration 055 abgebrochen — % BIC-NULL-Werte vorhanden. Bitte zuerst backfillen.',
      null_bic;
  end if;
end $$;

-- 1) BIC → NOT NULL
alter table apl2.antraege alter column bic set not null;

comment on column apl2.antraege.bic is
  'Pflicht seit Migration 055: PDF Feld 7 fragt BIC ab; Verwaltungspraxis '
  'Sozialreferat behandelt BIC als Pflichtangabe für SEPA-Auslandsfälle.';

-- 2) View neu erstellen OHNE _legacy-Spalten
drop view if exists apl2.antrag_mit_summen;

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
  a.anzahl_treffen_jahr,
  a.anzahl_teilnehmer,
  a.stadtbewohner_anteil,
  a.anzahl_ehrenamtliche,
  a.geleistete_stunden_jahr,
  a.foerderbereich_seit_jahren,
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
  ), 0::numeric) as miete_jahr_euro
from apl2.antraege a;

comment on view apl2.antrag_mit_summen is
  'Antrag mit aggregierten Kostenpositionen (Betriebskosten, Personalkosten, '
  'Miete als Jahressumme) aus apl2.belegposition. Neu in 055: ohne die '
  '_legacy-Spalten aus 016 — diese wurden gedroppt.';

-- 3) Jetzt die _legacy-Spalten droppen
alter table apl2.antraege
  drop column betriebskosten_vorjahr_euro_legacy,
  drop column personalkosten_vorjahr_euro_legacy,
  drop column monatliche_miete_euro_legacy;

-- 4) Verifikation
do $$
declare
  legacy_cols int;
  bic_nullable boolean;
begin
  select count(*) into legacy_cols
    from information_schema.columns
   where table_schema = 'apl2'
     and table_name   = 'antraege'
     and column_name like '%_legacy';
  if legacy_cols > 0 then
    raise exception 'Migration 055 — % _legacy-Spalten überlebt den DROP.', legacy_cols;
  end if;

  select is_nullable = 'YES' into bic_nullable
    from information_schema.columns
   where table_schema = 'apl2' and table_name = 'antraege' and column_name = 'bic';
  if bic_nullable then
    raise exception 'Migration 055 — bic ist nach SET NOT NULL immer noch NULL-bar.';
  end if;

  raise notice 'Migration 055 OK: BIC NOT NULL, 3 _legacy-Spalten entfernt, View neu.';
end $$;

commit;

notify pgrst, 'reload schema';
