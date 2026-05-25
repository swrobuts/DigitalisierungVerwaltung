-- 058_durchlaufzeit.sql
--
-- View `antrag_mit_summen` erweitern um Durchlaufzeit-Spalten:
--   - entschieden_am: Zeitstempel des ersten 'bewilligt'- oder 'abgelehnt'-
--     Statuswechsels (aus apl2.antrag_history)
--   - entscheidungs_typ: 'bewilligt' | 'abgelehnt' | NULL (= noch offen)
--   - durchlaufzeit_tage: ganze Tage zwischen submitted_at und entschieden_am;
--     für offene Anträge: ganze Tage zwischen submitted_at und now()
--
-- Anwendung: Inbox-Spalte, AntragDetail-Header, Compliance-Aggregat.
--
-- Pattern aus 055: drop + create view; danach grant select neu setzen,
-- sonst permission denied für authenticated + anon (siehe Migration 056).

begin;

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
  ), 0::numeric) as miete_jahr_euro,
  -- Neu in 058: Durchlaufzeit-Felder
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
      -- Entschiedener Antrag: Tage zwischen Eingang und Entscheidung
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
      -- Offener Antrag: Tage seit Eingang bis jetzt
      greatest(0, extract(day from now() - a.submitted_at))::int
  end as durchlaufzeit_tage
from apl2.antraege a;

comment on view apl2.antrag_mit_summen is
  'Antrag mit aggregierten Kostenpositionen + Durchlaufzeit (Migration 058). '
  'durchlaufzeit_tage zaehlt fuer entschiedene Antraege bis zum ersten '
  'bewilligt/abgelehnt-Statuswechsel; fuer offene Antraege bis now().';

-- GRANTs neu setzen (Lesson aus 055/056: drop view loescht alle ACLs)
grant select on apl2.antrag_mit_summen to authenticated, anon, service_role;

-- Verifikation
do $$
declare
  durchlauf_spalten int;
  fake_001_tage int;
begin
  select count(*) into durchlauf_spalten
    from information_schema.columns
   where table_schema='apl2' and table_name='antrag_mit_summen'
     and column_name in ('entschieden_am', 'entscheidungs_typ', 'durchlaufzeit_tage');
  if durchlauf_spalten <> 3 then
    raise exception 'Migration 058 — erwartete 3 neue Spalten, fand %', durchlauf_spalten;
  end if;
  -- FAKE-001 ist bewilligt; durchlaufzeit_tage muss numerisch lesbar sein
  select durchlaufzeit_tage into fake_001_tage
    from apl2.antrag_mit_summen
   where antragsnummer = 'APL2-2025-FAKE-001';
  raise notice 'Migration 058 OK: 3 Durchlaufzeit-Spalten + GRANTs. FAKE-001 = % Tage.', fake_001_tage;
end $$;

commit;

notify pgrst, 'reload schema';
