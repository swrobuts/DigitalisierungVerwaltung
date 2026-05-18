-- 008_antrag_history.sql — Audit-Trail aller Status-Changes

create table apl2.antrag_history (
  id            uuid primary key default gen_random_uuid(),
  antrag_id     uuid not null references apl2.antraege(id) on delete cascade,
  von_status    text,
  nach_status   text not null,
  geaendert_von text,
  geaendert_am  timestamptz not null default now(),
  kommentar     text
);

create index idx_antrag_history_antrag on apl2.antrag_history(antrag_id, geaendert_am desc);

create or replace function apl2.log_status_change() returns trigger language plpgsql as $$
begin
  insert into apl2.antrag_history (antrag_id, von_status, nach_status, geaendert_von, kommentar)
  values (new.id, old.status, new.status,
          coalesce(current_setting('request.jwt.claim.email', true), 'unknown'),
          current_setting('apl2.transition_kommentar', true));
  return new;
end $$;

drop trigger if exists trg_log_status_change on apl2.antraege;
create trigger trg_log_status_change
  after update of status on apl2.antraege
  for each row when (old.status is distinct from new.status)
  execute function apl2.log_status_change();

create or replace function apl2.log_initial_status() returns trigger language plpgsql as $$
begin
  insert into apl2.antrag_history (antrag_id, von_status, nach_status, geaendert_von)
  values (new.id, null, new.status, 'system (submit-antrag)');
  return new;
end $$;

drop trigger if exists trg_log_initial_status on apl2.antraege;
create trigger trg_log_initial_status
  after insert on apl2.antraege
  for each row execute function apl2.log_initial_status();

notify pgrst, 'reload schema';
