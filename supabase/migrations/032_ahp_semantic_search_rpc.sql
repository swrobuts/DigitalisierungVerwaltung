-- 032_ahp_semantic_search_rpc.sql
--
-- RPC-Funktion für semantische Suche über apl2.ahp_section_embeddings.
-- Wird von pruefung-service voyage_embed.semantic_search aufgerufen.

create or replace function apl2.ahp_semantic_search(
  query_embedding vector(1024),
  top_k int default 5
)
returns table (
  section_path text,
  section_title text,
  section_content text,
  similarity float
)
language sql
stable
security definer
set search_path = apl2, public
as $$
  select
    section_path,
    section_title,
    section_content,
    1 - (embedding <=> query_embedding) as similarity
  from apl2.ahp_section_embeddings
  order by embedding <=> query_embedding
  limit top_k
$$;

comment on function apl2.ahp_semantic_search is
  'L4 Semantic Search: cosine-Similarity-Search über alle AHP-Section-Embeddings (voyage-3, 1024d). similarity = 1 - cosine_distance.';

grant execute on function apl2.ahp_semantic_search(vector(1024), int)
  to authenticated, anon, service_role;

notify pgrst, 'reload schema';
