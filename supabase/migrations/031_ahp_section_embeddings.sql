-- 031_ahp_section_embeddings.sql
--
-- L4 — Embeddings-Layer: Vektor-Darstellung jeder AHP-Section für
-- semantische Suche (RAG). Voyage AI 'voyage-3' liefert 1024-dim
-- Embeddings, optimiert für deutschsprachigen Verwaltungstext.
--
-- Index: HNSW für cosine-Distanz (Voyage normalisiert, also cosine ≈ dot).
-- HNSW > IVFFlat bei kleinen Korpora (wir haben ~19 Sections), kein
-- Trainings-Schritt nötig.
--
-- pgvector-Extension wurde bereits in Migration 028 aktiviert.

create table apl2.ahp_section_embeddings (
  id uuid primary key default gen_random_uuid(),
  doctree_version text not null,
  section_path text not null,    -- z.B. "3.3" oder "" für unbenannt
  section_title text not null,
  section_content text not null, -- der embedde-te Volltext (Audit)
  embedding vector(1024) not null,
  embedding_model text not null default 'voyage-3',
  built_at timestamptz not null default now(),

  -- Pro Section nur ein aktuelles Embedding pro Doctree-Version
  unique(doctree_version, section_path, section_title)
);

-- HNSW-Index für cosine-Similarity-Search.
-- pgvector unterstützt vector_cosine_ops mit HNSW.
create index idx_ahp_embeddings_cosine on apl2.ahp_section_embeddings
  using hnsw (embedding vector_cosine_ops);

create index idx_ahp_embeddings_version on apl2.ahp_section_embeddings(doctree_version);

comment on table apl2.ahp_section_embeddings is
  'L4 Embeddings-Layer: 1024-dim voyage-3-Vektoren pro AHP-Section für semantische Suche durch Layer C (RAG).';

-- RLS / Grants
alter table apl2.ahp_section_embeddings enable row level security;

create policy "sachbearbeiter_select_embeddings"
  on apl2.ahp_section_embeddings for select
  to authenticated
  using (apl2.current_user_role() is not null);

grant select on apl2.ahp_section_embeddings to authenticated;
grant all on apl2.ahp_section_embeddings to service_role;

notify pgrst, 'reload schema';
