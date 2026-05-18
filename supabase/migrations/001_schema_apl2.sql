-- 001_schema_apl2.sql — APL-2-Antrag-Schema für UE1 (Webformular-Persistenz)

create schema if not exists apl2;

-- Hauptantrag
create table apl2.antraege (
  id                          uuid primary key default gen_random_uuid(),
  antragsnummer               text unique not null,
  haushaltsjahr               int not null,
  name                        text not null,
  anschrift                   text not null,
  traeger                     text not null,
  bankverbindung              text not null,
  iban                        text not null,
  bic                         text,
  ansprechpartner             text not null,
  telefon                     text not null,
  email                       text not null,
  betriebskosten_vorjahr_euro numeric(12,2) not null,
  personalkosten_vorjahr_euro numeric(12,2) not null,
  raeume_vorhanden            text not null check (raeume_vorhanden in ('ja','nein')),
  raeume_unentgeltlich        text not null check (raeume_unentgeltlich in ('ja','nein')),
  monatliche_miete_euro       numeric(12,2) not null default 0,
  antragsdatum                date not null,
  submitted_language          text not null check (submitted_language in ('de','it','tr','es')),
  submitted_at                timestamptz not null default now(),
  user_agent                  text,
  ip_address                  inet,
  status                      text not null default 'eingegangen'
);

-- Anlagen (1:n)
create table apl2.anlagen (
  id            uuid primary key default gen_random_uuid(),
  antrag_id     uuid not null references apl2.antraege(id) on delete cascade,
  typ           text not null check (typ in
                  ('mietvertrag','programm-altentagesstaette',
                   'anlage-1-kostennachweis','personalkostenbelege')),
  dateiname     text not null,
  groesse_bytes bigint not null,
  mime_type     text not null,
  storage_path  text not null,
  uploaded_at   timestamptz not null default now()
);

-- Translations (Source of Truth, anon read in Migration 004)
create table apl2.form_translations (
  key         text not null,
  language    text not null check (language in ('de','it','tr','es')),
  value       text not null,
  updated_at  timestamptz not null default now(),
  primary key (key, language)
);

-- Antragsnummer-Generator (analog Frontend-Format APL2-<jahr>-<KUE>-<random6>)
create or replace function apl2.set_antragsnummer() returns trigger language plpgsql as $$
declare
  kuerzel text;
begin
  kuerzel := upper(rpad(regexp_replace(coalesce(new.traeger,'XXX'),
                       '[^A-Za-zÄÖÜäöüß]','','g'), 3, 'X'));
  kuerzel := substr(kuerzel, 1, 3);
  new.antragsnummer := format('APL2-%s-%s-%s', new.haushaltsjahr, kuerzel,
                               upper(substr(md5(random()::text), 1, 6)));
  return new;
end;
$$;

create trigger trg_set_antragsnummer
  before insert on apl2.antraege
  for each row when (new.antragsnummer is null)
  execute function apl2.set_antragsnummer();

-- Indexe (UE2-Sachbearbeiter nutzt sie)
create index idx_antraege_status on apl2.antraege(status);
create index idx_antraege_submitted_at on apl2.antraege(submitted_at desc);
create index idx_anlagen_antrag on apl2.anlagen(antrag_id);
