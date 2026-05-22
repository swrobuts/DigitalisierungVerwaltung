-- 028_ahp_norm_statements.sql
--
-- Layer L2 — Knowledge-Layer: normative Aussagen, die per LLM-Extraktion
-- aus dem AHP-Doctree (L1) gewonnen werden und nach manueller Kuratierung
-- die Grundlage für JSON-Logic-Regeln (L3) bilden.
--
-- Workflow:
--   1. /api/extract-norms iteriert über alle Doctree-Sections und ruft
--      Claude pro Section auf (submit_statements-Tool).
--   2. Statements landen als status='pending' in dieser Tabelle.
--   3. Sachbearbeiter prüft im UI /normen → 'kuratiert' oder 'verworfen'.
--   4. Pro kuratiertem Statement kann (optional, manuell) eine Ontologie-
--      Regel angelegt werden, die per ontologie_rule_id verlinkt wird.
--
-- Vorbereitung für L4: pgvector-Extension; ahp_section_embeddings folgt in
-- Migration 029.

create extension if not exists vector;

create table apl2.ahp_norm_statements (
  id uuid primary key default gen_random_uuid(),

  -- Aus welcher Doctree-Version + Section stammt das Statement?
  doctree_version text not null,
  section_path text not null,
  section_title text,

  -- Die normative Aussage in eigenen, präzisen Worten
  -- (kein Original-Zitat, sondern Claude's Paraphrase).
  statement text not null,

  -- Typ-Taxonomie: erlaubt Filterung + spätere automatische Regel-Generierung
  statement_type text not null check (statement_type in (
    'cap',              -- Geldwert-Obergrenze (z.B. 10.000 €/Jahr)
    'frist',            -- Datum/Periode (z.B. 1. April)
    'verbot',           -- Was nicht erlaubt ist (z.B. Doppelförderung)
    'verpflichtung',    -- Was getan werden muss (z.B. Logo verwenden)
    'pflichtfeld',      -- Was im Antrag enthalten sein muss
    'staffel',          -- Konditionale Förderhöhe (z.B. nach Treffen-Anzahl)
    'qualitativ'        -- Nicht maschinell prüfbar (z.B. "anerkannt und bewährt")
  )),

  -- Worauf bezieht sich das Statement?
  -- Beispiele: {"foerderbereiche": ["begegnungszentren","bildungstraeger"]}
  --           {"alle_traeger": true}
  applicable_to jsonb not null default '{}'::jsonb,

  -- Ist das Statement maschinell prüfbar (gegen Antragsdaten)?
  -- Wird vom Sachbearbeiter beim Kuratieren bestätigt/revidiert.
  maschinell_pruefbar boolean not null default false,

  -- Verlinkung zu einer existierenden Ontologie-Regel (falls umgesetzt)
  ontologie_rule_id uuid references apl2.ontologie_rules(id) on delete set null,

  -- Lifecycle
  status text not null default 'pending' check (status in (
    'pending',          -- frisch extrahiert, noch nicht geprüft
    'kuratiert',        -- vom Sachbearbeiter freigegeben
    'verworfen'         -- vom Sachbearbeiter abgelehnt
  )),

  -- Audit
  extracted_by text,                                    -- z.B. 'claude-sonnet-4-5'
  extracted_at timestamptz not null default now(),
  kuratiert_von text,
  kuratiert_am timestamptz,
  kuratierungs_kommentar text,

  -- Dedup: pro Doctree-Version soll nicht das gleiche Statement aus
  -- derselben Section doppelt extrahiert werden.
  unique(doctree_version, section_path, statement)
);

create index idx_ahp_norm_status on apl2.ahp_norm_statements(status, statement_type);
create index idx_ahp_norm_version on apl2.ahp_norm_statements(doctree_version);
create index idx_ahp_norm_rule on apl2.ahp_norm_statements(ontologie_rule_id)
  where ontologie_rule_id is not null;

comment on table apl2.ahp_norm_statements is
  'Knowledge-Layer L2: aus der AHP-Förderrichtlinie per LLM extrahierte normative Aussagen, kuratiert vom Sachbearbeiter, Brücke zwischen Volltext (L1) und Ontologie-Regeln (L3).';

-- RLS
alter table apl2.ahp_norm_statements enable row level security;

create policy "sachbearbeiter_select_norms"
  on apl2.ahp_norm_statements for select
  to authenticated
  using (apl2.current_user_role() is not null);

create policy "sachbearbeiter_update_norms"
  on apl2.ahp_norm_statements for update
  to authenticated
  using (apl2.current_user_role() is not null);

-- Service-Role darf neue Statements einsetzen (Extraction-Pipeline)
grant select, insert, update, delete on apl2.ahp_norm_statements to service_role;
grant select, update on apl2.ahp_norm_statements to authenticated;

notify pgrst, 'reload schema';
