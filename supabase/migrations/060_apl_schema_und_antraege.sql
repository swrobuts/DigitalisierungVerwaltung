-- 060_apl_schema_und_antraege.sql
-- Phase 1 Multi-FB-Umzug: neues neutrales Schema `apl` (statt apl2),
-- gemeinsame Antragsteller-Tabelle für alle 4 Förderbereiche.

create schema if not exists apl;

create type apl.foerderbereich_enum as enum ('I', 'II', 'III', 'IV');

create type apl.status_enum as enum (
  'eingegangen', 'in_pruefung', 'rueckfrage', 'bewilligt', 'abgelehnt'
);

create table apl.antraege (
  id                   uuid primary key default gen_random_uuid(),
  antragsnummer        text unique,                       -- gefüllt vom Trigger in Migration 062
  haushaltsjahr        int not null check (haushaltsjahr between 2020 and 2030),
  foerderbereich       apl.foerderbereich_enum not null,

  -- gemeinsamer Antragsteller-Block (alle FBs)
  dachverband          text,
  einrichtung          text not null,
  ansprechpartner      text not null,
  strasse              text not null,
  hausnummer           text,
  plz                  text not null check (plz ~ '^[0-9]{5}$'),
  ort                  text not null,
  telefon              text not null,
  email                text not null check (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  homepage             text,
  bankname             text not null,
  iban                 text not null,
  bic                  text not null,

  -- Workflow
  status               apl.status_enum not null default 'eingegangen',
  submitted_at         timestamptz not null default now(),
  submitted_language   text not null default 'de' check (submitted_language in ('de', 'tr')),
  user_agent           text,
  ip_address           inet
);

create index antraege_foerderbereich_idx on apl.antraege(foerderbereich);
create index antraege_status_idx         on apl.antraege(status);
create index antraege_haushaltsjahr_idx  on apl.antraege(haushaltsjahr);

comment on table apl.antraege is
  'Zentrale Antragstabelle für alle vier AHP-Förderbereiche (Stand 2025). '
  'FB-spezifische Felder liegen in den fb_*-Detail-Tabellen (1:1). '
  'antragsnummer wird vom Trigger in Migration 062 vor INSERT gesetzt.';
