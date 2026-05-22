-- 019_ahp_plaene_und_doctree.sql
-- UE3-Vorbereitung: Master-Tabelle der AHP-Pläne + Doc-Tree-Persistenz (PageIndex-Stil).
create table apl2.ahp_plaene (
  id text primary key,
  bezeichnung text not null,
  paragraph_in_richtlinie text,
  aktiv boolean not null default true,
  created_at timestamptz default now()
);

insert into apl2.ahp_plaene (id, bezeichnung, paragraph_in_richtlinie) values
  ('APL2', 'Altentagesstätten — Betriebs- und Personalkostenzuschüsse', '§ 4');

create table apl2.ahp_doctree (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  built_at timestamptz not null default now(),
  tree_jsonb jsonb not null,
  source_file text,
  unique (version)
);

create index idx_doctree_version on apl2.ahp_doctree(version desc);
grant select on apl2.ahp_plaene, apl2.ahp_doctree to authenticated, anon, service_role;
grant insert, update, delete on apl2.ahp_doctree to service_role;
notify pgrst, 'reload schema';
