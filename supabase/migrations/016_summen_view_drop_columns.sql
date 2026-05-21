-- 016_summen_view_drop_columns.sql
-- DESTRUCTIVE Migration: ersetzt die starren Summen-Spalten auf antraege
-- durch eine View, die live aus belegposition aggregiert.
--
-- Reihenfolge:
-- 1. Bestand sichern in *_legacy-Spalten (rollback-fähig)
-- 2. Belegpositionen für Bestandsdaten generieren (1 Sammel-Position pro Belegtyp)
-- 3. Drop Spalten
-- 4. View ersetzen
--
-- WICHTIG: vor Anwendung muss UE2 (useAntraege + useAntrag + AntragDetail)
-- bereits auf die View `apl2.antrag_mit_summen` umgestellt sein, sonst
-- bricht die Sachbearbeiter-App mit „column does not exist".

-- Schritt 1: Legacy sichern
alter table apl2.antraege add column if not exists betriebskosten_vorjahr_euro_legacy numeric(12,2);
alter table apl2.antraege add column if not exists personalkosten_vorjahr_euro_legacy numeric(12,2);
alter table apl2.antraege add column if not exists monatliche_miete_euro_legacy numeric(12,2);

update apl2.antraege set betriebskosten_vorjahr_euro_legacy = betriebskosten_vorjahr_euro;
update apl2.antraege set personalkosten_vorjahr_euro_legacy = personalkosten_vorjahr_euro;
update apl2.antraege set monatliche_miete_euro_legacy = monatliche_miete_euro;

-- Schritt 2: Bestandsdaten in Belegpositionen migrieren
insert into apl2.belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro)
select id, 'betriebskosten', 'Legacy-Summe aus PDF-Import (Migration 016)', betriebskosten_vorjahr_euro
from apl2.antraege
where betriebskosten_vorjahr_euro > 0;

insert into apl2.belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro)
select id, 'personalkosten', 'Legacy-Summe aus PDF-Import (Migration 016)', personalkosten_vorjahr_euro
from apl2.antraege
where personalkosten_vorjahr_euro > 0;

insert into apl2.belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro)
select id, 'miete', 'Legacy-Monatsmiete × 12 (Migration 016)', monatliche_miete_euro * 12
from apl2.antraege
where monatliche_miete_euro > 0;

-- Schritt 3: Drop Spalten
alter table apl2.antraege drop column betriebskosten_vorjahr_euro;
alter table apl2.antraege drop column personalkosten_vorjahr_euro;
alter table apl2.antraege drop column monatliche_miete_euro;

-- Schritt 4: View
create or replace view apl2.antrag_mit_summen as
select
  a.*,
  coalesce((select sum(betrag_euro) from apl2.belegposition
            where antrag_id = a.id and belegtyp = 'betriebskosten'), 0) as betriebskosten_vorjahr_euro,
  coalesce((select sum(betrag_euro) from apl2.belegposition
            where antrag_id = a.id and belegtyp = 'personalkosten'), 0) as personalkosten_vorjahr_euro,
  coalesce((select sum(betrag_euro) from apl2.belegposition
            where antrag_id = a.id and belegtyp = 'miete'), 0) as miete_jahr_euro
from apl2.antraege a;

grant select on apl2.antrag_mit_summen to authenticated, anon, service_role;

notify pgrst, 'reload schema';
