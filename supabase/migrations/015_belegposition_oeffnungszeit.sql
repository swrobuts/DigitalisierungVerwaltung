-- 015_belegposition_oeffnungszeit.sql
-- Additive Migration für UE1-v2 (belegezentriertes Stepper-Formular).
-- - apl2.belegposition: einzelne Belegzeilen mit Betrag + Bezeichnung + ggf. Anlage-Referenz
-- - apl2.oeffnungszeit: Wochenplan-Tabelle (Anlage 1 des AHP-PDF strukturiert)

create table apl2.belegposition (
  id              uuid primary key default gen_random_uuid(),
  antrag_id       uuid not null references apl2.antraege(id) on delete cascade,
  belegtyp        text not null check (belegtyp in ('betriebskosten','personalkosten','miete')),
  bezeichnung     text not null,
  betrag_euro     numeric(12,2) not null check (betrag_euro >= 0),
  anlage_id       uuid references apl2.anlagen(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index idx_belegposition_antrag on apl2.belegposition(antrag_id);
create index idx_belegposition_belegtyp on apl2.belegposition(antrag_id, belegtyp);

create table apl2.oeffnungszeit (
  antrag_id       uuid not null references apl2.antraege(id) on delete cascade,
  wochentag       text not null check (wochentag in ('mo','di','mi','do','fr','sa','so')),
  oeffnungszeit   text,
  angebot         text,
  primary key (antrag_id, wochentag)
);

-- RLS
alter table apl2.belegposition enable row level security;
create policy "sachbearbeiter_select_belegposition" on apl2.belegposition
  for select to authenticated using (apl2.current_user_role() is not null);

alter table apl2.oeffnungszeit enable row level security;
create policy "sachbearbeiter_select_oeffnungszeit" on apl2.oeffnungszeit
  for select to authenticated using (apl2.current_user_role() is not null);

-- Grants: service_role schreibt (Edge Function), authenticated liest (Sachbearbeiter)
grant insert, select on apl2.belegposition to service_role;
grant insert, select on apl2.oeffnungszeit to service_role;
grant select on apl2.belegposition to authenticated;
grant select on apl2.oeffnungszeit to authenticated;

notify pgrst, 'reload schema';
