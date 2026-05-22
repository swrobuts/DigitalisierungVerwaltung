-- 027_bescheide.sql
--
-- Tabelle apl2.bescheide + Storage-Bucket 'bescheide' für die
-- ausgehenden Verwaltungsentscheidungen (Bewilligungs-/Ablehnungs-/
-- Rückfrage-Bescheide). Die Begründung wird strukturiert aus dem letzten
-- Prüfprotokoll abgeleitet — siehe pruefung-service /api/bescheid.

create table apl2.bescheide (
  id uuid primary key default gen_random_uuid(),
  antrag_id uuid not null references apl2.antraege(id) on delete cascade,

  -- Welche Entscheidung verkörpert dieser Bescheid?
  -- Werte korrespondieren zu apl2.antraege.status nach dem Übergang.
  entscheidung text not null check (entscheidung in ('bewilligt', 'abgelehnt', 'rueckfrage')),

  -- Nur bei Bewilligung: bewilligte Fördersumme (kann von der geforderten
  -- Summe abweichen, z.B. wegen Cap aus AHP 2.3.2). NULL bei Ablehnung/
  -- Rückfrage.
  bewilligte_summe_euro numeric(12,2) check (bewilligte_summe_euro is null or bewilligte_summe_euro >= 0),

  -- Strukturierte Begründungspunkte aus dem Prüfprotokoll
  -- (Layer A/B/C-Befunde mit AHP-Wortlaut). Wird beim Rendern in das
  -- Bescheid-PDF eingebaut.
  begruendung_jsonb jsonb not null default '{}'::jsonb,

  -- Freitext-Kommentar des Sachbearbeiters (wird im Bescheid sichtbar
  -- mit gerendert).
  bearbeiter_kommentar text,

  -- Audit-Spuren
  ausgestellt_von text,
  ausgestellt_am timestamptz not null default now(),

  -- Verweis auf das gerenderte PDF im Storage-Bucket 'bescheide'
  pdf_storage_path text,

  -- Verweis auf das verwendete Prüfprotokoll für Audit
  pruefprotokoll_id uuid references apl2.pruefprotokoll(id) on delete set null,

  -- Versionierung des AHP-Doctrees zur Reproduzierbarkeit der Begründung
  doctree_version text
);

create index idx_bescheide_antrag on apl2.bescheide(antrag_id, ausgestellt_am desc);

comment on table apl2.bescheide is
  'Ausgehende Verwaltungsentscheidungen (Bewilligung/Ablehnung/Rückfrage). Jeder Bescheid referenziert das Prüfprotokoll, aus dem die Begründung abgeleitet wurde.';

-- RLS: Sachbearbeiter dürfen Bescheide ihres Mandats lesen + erstellen.
-- Service-Role schreibt aus pruefung-service.
alter table apl2.bescheide enable row level security;

create policy "sachbearbeiter_select_bescheide"
  on apl2.bescheide for select
  to authenticated
  using (apl2.current_user_role() is not null);

grant select on apl2.bescheide to authenticated;
grant insert, update on apl2.bescheide to service_role;

-- Storage-Bucket für Bescheid-PDFs (privater Bucket, signed-URLs zum Lesen)
insert into storage.buckets (id, name, public)
values ('bescheide', 'bescheide', false)
on conflict (id) do nothing;

-- Service-Role darf in den Bucket schreiben, authenticated darf lesen
-- (storage.objects-Policy)
create policy "sachbearbeiter_select_bescheide_objects"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'bescheide' and apl2.current_user_role() is not null);

create policy "service_write_bescheide_objects"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'bescheide');

notify pgrst, 'reload schema';
