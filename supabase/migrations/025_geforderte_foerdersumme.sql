-- 025_geforderte_foerdersumme.sql
--
-- Antragsforderung als eigenes Feld: was beantragt der Träger an Zuschuss?
-- Bislang stand im Antrag nur der Aufwand (Vorjahres-Kosten, Belegpositionen).
-- Ohne explizite Forderungssumme kann die AHP-Förderhöchstgrenze 2.3.2
-- (10.000 €/Jahr für Begegnungszentren, in die APL2 fällt) nicht maschinell
-- geprüft werden.
--
-- Zusätzlich: Die ahp_plaene-Tabelle führte für APL2 den Eintrag
-- 'paragraph_in_richtlinie = § 4' — § 4 existiert in der AHP-Richtlinie
-- aber nicht. Gemeint war Förderbereich IV (römisch 4), tatsächlich aber
-- läuft APL2 inhaltlich unter Förderbereich 2.3.2 'Begegnungszentren'.

begin;

-- 1) Spalte hinzufügen — NULL erlaubt für bestehende Anträge
alter table apl2.antraege
  add column geforderte_foerdersumme_euro numeric(12,2)
    check (geforderte_foerdersumme_euro is null or geforderte_foerdersumme_euro >= 0);

comment on column apl2.antraege.geforderte_foerdersumme_euro is
  'Vom Antragsteller geforderter Zuschussbetrag in EUR. Wird gegen die AHP-Förderhöchstgrenze geprüft (2.3.2 Begegnungszentren: 10.000 €/Jahr). NULL = noch nicht beziffert.';

-- 2) ahp_plaene: paragraph_in_richtlinie auf die echte AHP-Stelle setzen
update apl2.ahp_plaene
  set paragraph_in_richtlinie = '2.3.2 Begegnungszentren'
  where id = 'APL2';

-- 3) View antrag_mit_summen mit der neuen Spalte neu erzeugen
drop view if exists apl2.antrag_mit_summen;
create view apl2.antrag_mit_summen as
 SELECT a.id,
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
    a.betriebskosten_vorjahr_euro_legacy,
    a.personalkosten_vorjahr_euro_legacy,
    a.monatliche_miete_euro_legacy,
    COALESCE((SELECT sum(belegposition.betrag_euro) AS sum
                FROM apl2.belegposition
               WHERE belegposition.antrag_id = a.id
                 AND belegposition.belegtyp = 'betriebskosten'::text), 0::numeric) AS betriebskosten_vorjahr_euro,
    COALESCE((SELECT sum(belegposition.betrag_euro) AS sum
                FROM apl2.belegposition
               WHERE belegposition.antrag_id = a.id
                 AND belegposition.belegtyp = 'personalkosten'::text), 0::numeric) AS personalkosten_vorjahr_euro,
    COALESCE((SELECT sum(belegposition.betrag_euro) AS sum
                FROM apl2.belegposition
               WHERE belegposition.antrag_id = a.id
                 AND belegposition.belegtyp = 'miete'::text), 0::numeric) AS miete_jahr_euro
   FROM apl2.antraege a;

-- RLS / Grants spiegeln (drop hat die Berechtigungen entfernt)
grant select on apl2.antrag_mit_summen to authenticated, anon, service_role;

commit;

notify pgrst, 'reload schema';
