-- 037_pruefungen.sql
--
-- Vier-Augen-Prinzip: apl2.pruefungen kapselt die Bewertungs-Vorgänge
-- pro Antrag. Pro Antrag gibt es maximal eine Erstprüfung und eine
-- Zweitprüfung — jeweils von einem Menschen oder einer KI.
--
-- Abgrenzung zu apl2.pruefprotokoll: pruefprotokoll ist das rohe
-- KI-Ergebnis (Befunde + Duration). pruefungen ist die menschliche
-- (oder KI-)Bewertung dieser Befunde mit Abhakungen + Kommentaren.

create type apl2.pruefer_rolle           as enum ('erstpruefung', 'zweitpruefung');
create type apl2.pruefer_typ             as enum ('mensch', 'ki');
create type apl2.pruefer_modus           as enum ('standard', 'adversariell');
create type apl2.entscheidungsvorschlag  as enum ('bewilligen', 'ablehnen', 'rueckfragen');

create table apl2.pruefungen (
  id uuid primary key default gen_random_uuid(),

  antrag_id uuid not null references apl2.antraege(id) on delete cascade,
  rolle apl2.pruefer_rolle not null,

  -- Wer prüft? Bei Mensch ist pruefer_id die Email, bei KI die Modell-ID
  -- (z.B. 'claude-sonnet-4-5'). pruefer_modus nur bei pruefer_typ='ki'.
  pruefer_typ apl2.pruefer_typ not null,
  pruefer_id text not null,
  pruefer_modus apl2.pruefer_modus,

  -- Verweist auf das KI-Prüfprotokoll, das dieser Bewertung zugrunde liegt
  -- (kann null sein bei rein menschlicher Prüfung ohne KI-Vorlauf).
  pruefprotokoll_id uuid references apl2.pruefprotokoll(id) on delete set null,

  -- Strukturierte Abhakungen:
  -- {
  --   "befunde": {
  --     "<index_or_hash>": {"status":"bestaetigt|widerspruch|unklar","kommentar":"…"}
  --   },
  --   "abschnitte": {
  --     "traeger":         {"status":"geprueft|offen","kommentar":"…"},
  --     "raeumlichkeiten": {…},
  --     "foerderbereich":  {…},
  --     "finanzen":        {…}
  --   },
  --   "dissens": [ {"befund_id":"…","erst_schwere":"verstoss","zweit_schwere":"hinweis"} ]
  -- }
  abhakungen_jsonb jsonb not null default '{}'::jsonb,

  gesamt_kommentar text,
  entscheidungs_vorschlag apl2.entscheidungsvorschlag,

  abgeschlossen_am timestamptz,
  angelegt_am timestamptz not null default now(),

  -- Max 1 Erstprüfung + 1 Zweitprüfung pro Antrag
  unique (antrag_id, rolle)
);

comment on table apl2.pruefungen is
  'Bewertungs-Vorgänge pro Antrag (Erst-/Zweitprüfung, Mensch oder KI). Quelle für Vier-Augen-Prinzip und Abhakungs-Checkliste.';

create index idx_pruefungen_antrag on apl2.pruefungen(antrag_id, rolle);
create index idx_pruefungen_offen
  on apl2.pruefungen(antrag_id) where abgeschlossen_am is null;

-- RLS analog zu bescheide: Sachbearbeiter lesen + schreiben für ihren
-- Mandanten. Service-Role schreibt aus pruefung-service (KI-Zweitprüfung).
alter table apl2.pruefungen enable row level security;

create policy "sachbearbeiter_select_pruefungen"
  on apl2.pruefungen for select
  to authenticated
  using (apl2.current_user_role() is not null);

create policy "sachbearbeiter_insert_pruefungen"
  on apl2.pruefungen for insert
  to authenticated
  with check (apl2.current_user_role() is not null);

create policy "sachbearbeiter_update_pruefungen"
  on apl2.pruefungen for update
  to authenticated
  using (apl2.current_user_role() is not null);

grant select, insert, update on apl2.pruefungen to authenticated;
grant select, insert, update, delete on apl2.pruefungen to service_role;

notify pgrst, 'reload schema';
