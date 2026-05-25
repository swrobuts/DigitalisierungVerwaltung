-- 061_apl_fb_details_und_anlagen.sql
-- FB-spezifische Detail-Tabellen (1:1 zu apl.antraege) + Helferliste (1:n FB II) + Anlagen.

create type apl.fb_iii_variante_enum as enum ('A', 'B', 'C', 'D');

create type apl.treffen_schwelle_enum as enum ('GT_10', 'GT_20', 'GT_40');

create type apl.anlagentyp_enum as enum (
  'projektskizze',         -- FB I Pflicht
  'helferliste',           -- FB II Pflicht
  'foerderbestaetigung_bund',  -- FB III Variante A
  'programm_flyer',        -- FB III Variante B, C
  'stundenzettel',         -- FB III Variante D
  'sonstige'               -- FB IV / Generisch
);

create table apl.fb_i_projekt (
  antrag_id              uuid primary key references apl.antraege(id) on delete cascade,
  projekt_titel          text not null,
  laufzeit               text,
  stadtteil              text,
  personalkosten_euro    numeric(10,2) check (personalkosten_euro >= 0),
  sachkosten_euro        numeric(10,2) check (sachkosten_euro >= 0),
  drittmittel_jsonb      jsonb default '[]'::jsonb,
  andere_mittel_jsonb    jsonb default '[]'::jsonb
);

create table apl.fb_ii_ehrenamt (
  antrag_id                    uuid primary key references apl.antraege(id) on delete cascade,
  ehrenamt_titel               text not null,
  anzahl_helfer_vorjahr        int check (anzahl_helfer_vorjahr >= 0),
  gesamt_helferstunden_vorjahr int check (gesamt_helferstunden_vorjahr >= 0),
  direkter_kontakt_senioren    boolean not null default false
);

create table apl.fb_ii_helfer (
  id              uuid primary key default gen_random_uuid(),
  antrag_id       uuid not null references apl.antraege(id) on delete cascade,
  position        int not null check (position >= 1),
  name            text not null,
  vorname         text not null,
  einsatzbereich  text,
  eintritt        date,
  austritt        date,
  stunden_monat   numeric(6,2) check (stunden_monat >= 0),
  stunden_jahr    numeric(6,2) check (stunden_jahr >= 0),
  unique (antrag_id, position)
);
create index fb_ii_helfer_antrag_idx on apl.fb_ii_helfer(antrag_id);

create table apl.fb_iii_variante (
  antrag_id        uuid primary key references apl.antraege(id) on delete cascade,
  variante         apl.fb_iii_variante_enum not null,

  -- Variante A — Mehrgenerationenhaus
  a_anmerkung      text,

  -- Variante B — Begegnungszentrum/Bildungsträger
  b_anzahl_veranstaltungen      int check (b_anzahl_veranstaltungen >= 0),
  b_teilnehmer_senioren         int check (b_teilnehmer_senioren >= 0),
  b_teilnehmer_generationen     int check (b_teilnehmer_generationen >= 0),
  b_stadtbewohner_anteil        numeric(4,3) check (b_stadtbewohner_anteil between 0 and 1),
  b_quartierstreffen_teilnahme  boolean,
  b_quartiere                   text,
  b_quartier_person_name        text,

  -- Variante C — Seniorenkreis
  c_treffen_schwelle            apl.treffen_schwelle_enum,
  c_teilnehmer_durchschnitt     int check (c_teilnehmer_durchschnitt >= 0),
  c_quartierstreffen_anzahl     int check (c_quartierstreffen_anzahl >= 0),
  c_quartier_kooperation        text,
  c_quartier_person_name        text,

  -- Variante D — Quartiersmanagement
  d_hauptamt_name               text,
  d_hauptamt_stunden_woche      numeric(5,2) check (d_hauptamt_stunden_woche >= 0),
  d_hauptamt_stunden_monat      numeric(5,2) check (d_hauptamt_stunden_monat >= 0),
  d_ehrenamt_personen_jsonb     jsonb default '[]'::jsonb
);

create table apl.fb_iv_freitext (
  antrag_id              uuid primary key references apl.antraege(id) on delete cascade,
  vorhaben_titel         text not null,
  kurzbeschreibung       text not null check (length(kurzbeschreibung) <= 1000),
  geplante_massnahmen    text not null,
  beantragte_summe_euro  numeric(10,2) check (beantragte_summe_euro >= 0),
  laufzeit               text
);

create table apl.anlagen (
  id              uuid primary key default gen_random_uuid(),
  antrag_id       uuid not null references apl.antraege(id) on delete cascade,
  anlagentyp      apl.anlagentyp_enum not null,
  dateiname       text not null,
  storage_path    text not null,
  groesse_bytes   int check (groesse_bytes >= 0),
  hochgeladen_am  timestamptz not null default now()
);
create index anlagen_antrag_idx on apl.anlagen(antrag_id);
