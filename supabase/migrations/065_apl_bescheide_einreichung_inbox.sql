-- 065_apl_bescheide_einreichung_inbox.sql
--
-- Outbound + Inbound + Inbox-View für das neue apl-Schema:
--   - apl.bescheide                  (analog 027)
--   - apl.antrag_einreichung         (UE0 PDF-Upload-Tracking, analog 047)
--   - apl.antrag_inbox  (View)       (FB-agnostische Inbox mit FB-Detail-Joins)
--
-- Storage-Buckets ('bescheide', 'antragseingang-pdf') existieren bereits aus
-- 027 / 047 — wir legen sie hier idempotent an, falls die alten Migrationen
-- nicht angewendet wurden.

begin;

-- ══════════════════════════════════════════════════════════════════════════
-- 1) apl.bescheide
-- ══════════════════════════════════════════════════════════════════════════
create table apl.bescheide (
  id                     uuid primary key default gen_random_uuid(),
  antrag_id              uuid not null references apl.antraege(id) on delete cascade,
  entscheidung           text not null check (entscheidung in ('bewilligt', 'abgelehnt', 'rueckfrage')),
  bewilligte_summe_euro  numeric(12,2) check (bewilligte_summe_euro is null or bewilligte_summe_euro >= 0),
  begruendung_jsonb      jsonb not null default '{}'::jsonb,
  bearbeiter_kommentar   text,
  ausgestellt_von        text,
  ausgestellt_am         timestamptz not null default now(),
  pdf_storage_path       text,
  doctree_version        text
);

create index bescheide_antrag_idx on apl.bescheide(antrag_id, ausgestellt_am desc);

comment on table apl.bescheide is
  'Ausgehende Verwaltungsentscheidungen pro Antrag (alle 4 Förderbereiche). '
  'begruendung_jsonb wird aus Quellen-validierten AHP-Statements zusammengebaut, '
  'siehe pruefung/quellen_validator.py.';

alter table apl.bescheide enable row level security;

create policy "sachbearbeiter_select_bescheide" on apl.bescheide
  for select to authenticated using (apl.current_user_role() is not null);

grant select on apl.bescheide to authenticated;
grant select, insert, update, delete on apl.bescheide to service_role;

-- Storage-Bucket 'bescheide' (idempotent — existiert evtl. aus Migration 027)
insert into storage.buckets (id, name, public) values ('bescheide', 'bescheide', false)
on conflict (id) do nothing;

-- Storage-Policies für 'bescheide' — idempotent
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='storage' and tablename='objects'
       and policyname='apl_sachbearbeiter_select_bescheide_objects'
  ) then
    create policy "apl_sachbearbeiter_select_bescheide_objects"
      on storage.objects for select to authenticated
      using (bucket_id = 'bescheide' and apl.current_user_role() is not null);
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname='storage' and tablename='objects'
       and policyname='apl_service_write_bescheide_objects'
  ) then
    create policy "apl_service_write_bescheide_objects"
      on storage.objects for insert to service_role
      with check (bucket_id = 'bescheide');
  end if;
end $$;


-- ══════════════════════════════════════════════════════════════════════════
-- 2) apl.antrag_einreichung  (UE0 PDF-Upload-Tracking)
-- ══════════════════════════════════════════════════════════════════════════
create table apl.antrag_einreichung (
  id                uuid primary key default gen_random_uuid(),
  storage_path      text not null,
  dateiname         text,
  groesse_bytes     bigint,
  -- Welcher FB wurde vom Smart-Upload-Klassifizierer erkannt? Optional,
  -- füllt der OCR-Workflow nach. NULL = noch nicht klassifiziert.
  erkannter_fb      apl.foerderbereich_enum,
  eingereicht_am    timestamptz not null default now(),
  status            text not null default 'wartend'
    check (status in ('wartend', 'in_verarbeitung', 'fertig', 'fehler')),
  antrag_id         uuid references apl.antraege(id) on delete set null,
  extrahiert_jsonb  jsonb,
  fehler_text       text,
  verarbeitet_am    timestamptz
);

create index antrag_einreichung_status_idx on apl.antrag_einreichung(status);
create index antrag_einreichung_eingang_idx on apl.antrag_einreichung(eingereicht_am desc);

comment on table apl.antrag_einreichung is
  'Tracking-Liste für UE0 (manuell hochgeladenes PDF) und UE3 (Smart-Upload). '
  'Status: wartend → in_verarbeitung → fertig|fehler. n8n schreibt via service_role.';

alter table apl.antrag_einreichung enable row level security;

-- anon darf eigene Einreichung per Tracking-UUID sehen (Bookmark-Token)
create policy "anon_select_einreichung" on apl.antrag_einreichung
  for select to anon, authenticated using (true);

create policy "service_full_einreichung" on apl.antrag_einreichung
  for all to service_role using (true) with check (true);

grant select on apl.antrag_einreichung to anon, authenticated;
grant all on apl.antrag_einreichung to service_role;

-- Storage-Bucket 'antragseingang-pdf' (idempotent — existiert evtl. aus 047)
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'antragseingang-pdf') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('antragseingang-pdf', 'antragseingang-pdf', false,
            10 * 1024 * 1024, array['application/pdf']);
  end if;
end $$;

-- n8n-Webhook-Trigger analog 047
create or replace function apl.notify_n8n_on_pdf_einreichung() returns trigger
language plpgsql as $$
declare
  webhook_url text;
begin
  webhook_url := current_setting('app.n8n_ue0_webhook', true);
  if webhook_url is null or webhook_url = '' then
    raise warning 'app.n8n_ue0_webhook nicht gesetzt — UE0/UE3-Smart-Upload-Workflow wird nicht angestoßen';
    return new;
  end if;
  perform net.http_post(
    url := webhook_url,
    body := jsonb_build_object(
      'einreichung_id', new.id::text,
      'storage_path', new.storage_path,
      'dateiname', new.dateiname,
      'groesse_bytes', new.groesse_bytes
    ),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  return new;
exception when others then
  update apl.antrag_einreichung
     set status = 'fehler',
         fehler_text = 'n8n-Webhook nicht erreichbar: ' || sqlerrm
   where id = new.id;
  raise warning 'n8n-Webhook fehlgeschlagen für %: %', new.id, sqlerrm;
  return new;
end $$;

create trigger trg_notify_n8n_on_pdf_einreichung
  after insert on apl.antrag_einreichung
  for each row execute function apl.notify_n8n_on_pdf_einreichung();


-- ══════════════════════════════════════════════════════════════════════════
-- 3) View apl.antrag_inbox  (FB-agnostische Inbox + FB-spezifische Aggregate)
-- ══════════════════════════════════════════════════════════════════════════
create view apl.antrag_inbox as
select
  a.id,
  a.antragsnummer,
  a.haushaltsjahr,
  a.foerderbereich,
  a.dachverband,
  a.einrichtung,
  a.ansprechpartner,
  a.strasse,
  a.hausnummer,
  a.plz,
  a.ort,
  a.telefon,
  a.email,
  a.homepage,
  a.bankname,
  a.iban,
  a.bic,
  a.status,
  a.submitted_at,
  a.submitted_language,
  a.user_agent,
  a.ip_address,

  -- FB I: Gesamtkosten aus Personal+Sach
  case when a.foerderbereich = 'I' then
    coalesce(fbi.personalkosten_euro, 0) + coalesce(fbi.sachkosten_euro, 0)
  end as fb_i_gesamtkosten_euro,
  fbi.projekt_titel as fb_i_projekt_titel,

  -- FB II: Pauschalförderung-Indikatoren
  fbii.ehrenamt_titel as fb_ii_ehrenamt_titel,
  fbii.anzahl_helfer_vorjahr as fb_ii_anzahl_helfer,
  fbii.gesamt_helferstunden_vorjahr as fb_ii_helferstunden,

  -- FB III: Variante + abgeleitete Förderhöhe (Treffen-Staffel)
  fbiii.variante as fb_iii_variante,
  case fbiii.c_treffen_schwelle
    when 'GT_10' then 750
    when 'GT_20' then 1250
    when 'GT_40' then 2000
  end as fb_iii_c_betrag_euro,

  -- FB IV: Schwerpunktförderung
  fbiv.vorhaben_titel as fb_iv_vorhaben_titel,
  fbiv.beantragte_summe_euro as fb_iv_beantragte_summe_euro,

  -- Durchlaufzeit (analog 058)
  (select min(h.geaendert_am)
     from apl.antrag_history h
    where h.antrag_id = a.id
      and h.nach_status in ('bewilligt', 'abgelehnt')
  ) as entschieden_am,
  (select h.nach_status
     from apl.antrag_history h
    where h.antrag_id = a.id
      and h.nach_status in ('bewilligt', 'abgelehnt')
    order by h.geaendert_am asc
    limit 1
  ) as entscheidungs_typ,
  case
    when a.status in ('bewilligt', 'abgelehnt') then
      greatest(0, extract(day from
        coalesce(
          (select min(h.geaendert_am)
             from apl.antrag_history h
            where h.antrag_id = a.id
              and h.nach_status in ('bewilligt', 'abgelehnt')),
          now()
        ) - a.submitted_at
      ))::int
    else
      greatest(0, extract(day from now() - a.submitted_at))::int
  end as durchlaufzeit_tage,

  -- Anzahl Anlagen (UI-Indikator)
  (select count(*) from apl.anlagen an where an.antrag_id = a.id) as anlagen_count

from apl.antraege a
left join apl.fb_i_projekt    fbi   on fbi.antrag_id   = a.id
left join apl.fb_ii_ehrenamt  fbii  on fbii.antrag_id  = a.id
left join apl.fb_iii_variante fbiii on fbiii.antrag_id = a.id
left join apl.fb_iv_freitext  fbiv  on fbiv.antrag_id  = a.id;

comment on view apl.antrag_inbox is
  'FB-agnostische Inbox-View: alle 4 Förderbereiche in einer Liste, '
  'FB-spezifische Aggregat-Spalten als NULL wenn nicht-zutreffender FB. '
  'durchlaufzeit_tage analog zu apl2.antrag_mit_summen (Migration 058).';

grant select on apl.antrag_inbox to authenticated, anon, service_role;

commit;

notify pgrst, 'reload schema';
