-- 007_workflow_state_machine.sql — Workflow als Datenmodell

create table apl2.workflow_transition (
  von_status  text not null,
  nach_status text not null,
  primary key (von_status, nach_status)
);

insert into apl2.workflow_transition (von_status, nach_status) values
  ('eingegangen', 'in_pruefung'),
  ('in_pruefung', 'rueckfrage'),
  ('in_pruefung', 'bewilligt'),
  ('in_pruefung', 'abgelehnt'),
  ('rueckfrage', 'in_pruefung');

alter table apl2.workflow_transition enable row level security;

drop policy if exists "everyone reads transitions" on apl2.workflow_transition;
create policy "everyone reads transitions" on apl2.workflow_transition
  for select to authenticated, anon using (true);

grant select on apl2.workflow_transition to authenticated, anon;

-- Trigger: validiert Status-Übergänge gegen workflow_transition
create or replace function apl2.validate_status_transition() returns trigger language plpgsql as $$
begin
  if old.status is distinct from new.status then
    if not exists (
      select 1 from apl2.workflow_transition
      where von_status = old.status and nach_status = new.status
    ) then
      raise exception 'Verbotener Status-Übergang: % → %', old.status, new.status
        using errcode = 'P0001', hint = 'Erlaubte Übergänge: select * from apl2.workflow_transition';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_validate_status_transition on apl2.antraege;
create trigger trg_validate_status_transition
  before update of status on apl2.antraege
  for each row execute function apl2.validate_status_transition();

notify pgrst, 'reload schema';
