-- 062_apl_workflow_und_antragsnummer.sql
-- Workflow-Audit-Trail + manuelle Prüfvermerke (UE2) + Antragsnummer-Trigger.

create table apl.antrag_history (
  id              uuid primary key default gen_random_uuid(),
  antrag_id       uuid not null references apl.antraege(id) on delete cascade,
  von_status      text,
  nach_status     text not null,
  geaendert_von   text,
  geaendert_am    timestamptz not null default now(),
  kommentar       text
);
create index antrag_history_antrag_idx on apl.antrag_history(antrag_id);

create type apl.pruefstatus as enum ('offen', 'ok', 'fraglich', 'fehlt');

create table apl.manuelle_pruefung (
  id            uuid primary key default gen_random_uuid(),
  antrag_id     uuid not null references apl.antraege(id) on delete cascade,
  paragraph     text not null,
  status        apl.pruefstatus not null default 'offen',
  kommentar     text,
  geprueft_von  uuid references auth.users(id) on delete set null,
  geprueft_am   timestamptz not null default now(),
  unique (antrag_id, paragraph)
);
create index manuelle_pruefung_antrag_idx on apl.manuelle_pruefung(antrag_id);

create or replace function apl.bump_manuelle_pruefung_timestamp()
returns trigger language plpgsql as $$
begin
  new.geprueft_am := now();
  return new;
end $$;

create trigger trg_bump_manuelle_pruefung_timestamp
  before update on apl.manuelle_pruefung
  for each row execute function apl.bump_manuelle_pruefung_timestamp();

-- Antragsnummer-Generator: APL-<jahr>-FB<FB>-<KUERZEL>-<HEX>
create or replace function apl.generate_antragsnummer()
returns trigger language plpgsql as $$
declare
  fb_code text;
  kuerzel text;
  hex text;
begin
  fb_code := new.foerderbereich::text;
  kuerzel := upper(regexp_replace(split_part(coalesce(new.einrichtung, 'XXXX'), ' ', 1), '[^A-Za-z]', '', 'g'));
  kuerzel := substring(kuerzel from 1 for 4);
  if length(kuerzel) = 0 then kuerzel := 'XXXX'; end if;
  hex := upper(substring(encode(gen_random_bytes(3), 'hex') from 1 for 6));
  new.antragsnummer := format('APL-%s-FB%s-%s-%s', new.haushaltsjahr, fb_code, kuerzel, hex);
  return new;
end $$;

create trigger trg_generate_antragsnummer
  before insert on apl.antraege
  for each row
  when (new.antragsnummer is null or new.antragsnummer = '')
  execute function apl.generate_antragsnummer();
