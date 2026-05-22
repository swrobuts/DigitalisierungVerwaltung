-- 029_antraege_foerderbereich.sql
--
-- Phase B — Datenmodell-Erweiterung als Voraussetzung für die AHP-konforme
-- Ontologie-Ausweitung (Migration 030).
--
-- Bislang konnte die Cap-Regel nur 'begegnungszentren' prüfen (10.000 €
-- pauschal). Die AHP definiert aber sieben verschiedene Förderbereiche mit
-- eigenen Caps, Staffelungen und Pflichtfeldern. Ohne foerderbereich-Spalte
-- im Antrag kann keine Cap maschinell gegen den richtigen Topf geprüft werden.

begin;

alter table apl2.antraege
  add column foerderbereich text check (foerderbereich is null or foerderbereich in (
    'aufbau_niedrigschwellige_angebote',  -- FB I (2.1)
    'buergerschaftliches_engagement',     -- FB II (2.2)
    'mehrgenerationenhaeuser',            -- FB III.1 (2.3.1)
    'begegnungszentren',                  -- FB III.2 (2.3.2) — APL2 läuft hier
    'bildungstraeger',                    -- FB III.3 (2.3.3)
    'seniorenkreise',                     -- FB III.4 (2.3.4)
    'quartiersmanagement_altenarbeit',    -- FB III.5 (2.3.5)
    'struktur_schwerpunktfoerderung'      -- FB IV (2.4)
  )),
  -- Skalierungs-/Staffelungs-Größen (NULL = unbekannt)
  add column anzahl_treffen_jahr integer
    check (anzahl_treffen_jahr is null or anzahl_treffen_jahr >= 0),
  add column anzahl_teilnehmer integer
    check (anzahl_teilnehmer is null or anzahl_teilnehmer >= 0),
  add column stadtbewohner_anteil numeric(4,3)
    check (stadtbewohner_anteil is null
           or (stadtbewohner_anteil >= 0 and stadtbewohner_anteil <= 1)),
  add column anzahl_ehrenamtliche integer
    check (anzahl_ehrenamtliche is null or anzahl_ehrenamtliche >= 0),
  add column geleistete_stunden_jahr integer
    check (geleistete_stunden_jahr is null or geleistete_stunden_jahr >= 0),
  -- Befristungs-Tracking für FB I (max. 3 Jahre)
  add column foerderbereich_seit_jahren integer
    check (foerderbereich_seit_jahren is null or foerderbereich_seit_jahren >= 0),
  -- Pflichtfeld-Indikatoren (insb. FB IV)
  add column zuwendungszweck text,
  add column finanzplanung_vorhanden boolean,
  add column projektskizze_eingereicht boolean,
  add column logo_verwendet boolean;

comment on column apl2.antraege.foerderbereich is
  'AHP-Förderbereich-Klassifikation (Voraussetzung für alle Cap-Regeln). Vergleiche AHP 2.1 bis 2.4.';
comment on column apl2.antraege.stadtbewohner_anteil is
  'Anteil der Stadt-Würzburg-Bewohner an Gesamt-Teilnehmern (0..1). Skaliert die Förderhöhe bei Begegnungszentren und Bildungsträgern (AHP 2.3.2/2.3.3).';
comment on column apl2.antraege.foerderbereich_seit_jahren is
  'Wie viele Jahre wird dieser Träger bereits in diesem Förderbereich gefördert? AHP 2.1: FB I ist auf max. 3 Jahre befristet.';

-- View neu mit allen Spalten
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
    a.betriebskosten_vorjahr_euro_legacy,
    a.personalkosten_vorjahr_euro_legacy,
    a.monatliche_miete_euro_legacy,
    COALESCE((SELECT sum(b.betrag_euro) FROM apl2.belegposition b
              WHERE b.antrag_id = a.id AND b.belegtyp = 'betriebskosten'), 0::numeric)
      AS betriebskosten_vorjahr_euro,
    COALESCE((SELECT sum(b.betrag_euro) FROM apl2.belegposition b
              WHERE b.antrag_id = a.id AND b.belegtyp = 'personalkosten'), 0::numeric)
      AS personalkosten_vorjahr_euro,
    COALESCE((SELECT sum(b.betrag_euro) FROM apl2.belegposition b
              WHERE b.antrag_id = a.id AND b.belegtyp = 'miete'), 0::numeric)
      AS miete_jahr_euro
   FROM apl2.antraege a;

grant select on apl2.antrag_mit_summen to authenticated, anon, service_role;

commit;

notify pgrst, 'reload schema';
