-- 021_pruefprotokoll_und_storage.sql
-- Audit-Trail aller Prüfungs-Läufe + Storage-Bucket für PDF-Protokolle.
create table apl2.pruefprotokoll (
  id uuid primary key default gen_random_uuid(),
  antrag_id uuid not null references apl2.antraege(id) on delete cascade,
  geprueft_am timestamptz not null default now(),
  geprueft_von text,
  doctree_version text,
  ergebnis_jsonb jsonb not null,
  pdf_storage_path text,
  duration_ms integer
);

create index idx_pruefprotokoll_antrag on apl2.pruefprotokoll(antrag_id, geprueft_am desc);

insert into storage.buckets (id, name, public) values
  ('pruefprotokolle', 'pruefprotokolle', false)
on conflict (id) do nothing;

drop policy if exists "sachbearbeiter_select_pruefprotokoll" on storage.objects;
create policy "sachbearbeiter_select_pruefprotokoll" on storage.objects
  for select to authenticated
  using (bucket_id = 'pruefprotokolle' and apl2.current_user_role() is not null);

alter table apl2.pruefprotokoll enable row level security;
drop policy if exists "sachbearbeiter_select_pruefprotokoll_table" on apl2.pruefprotokoll;
create policy "sachbearbeiter_select_pruefprotokoll_table" on apl2.pruefprotokoll
  for select to authenticated using (apl2.current_user_role() is not null);

grant insert, select, update on apl2.pruefprotokoll to service_role;
grant select on apl2.pruefprotokoll to authenticated;
notify pgrst, 'reload schema';
