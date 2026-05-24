-- 047_ue0_pdf_einreichung.sql
--
-- Reifegradstufe 0: Bürger lädt ausgefülltes Original-PDF hoch,
-- ein n8n-Workflow extrahiert die Felder via Claude Vision OCR
-- (auch Handschrift) und schreibt sie nach apl2.antraege.
--
-- Dieses Migration legt an:
--   1. Storage-Bucket `antragseingang-pdf` (private, nur service_role
--      darf read/write — Frontend lädt via Edge Function hoch, n8n liest
--      via service_role)
--   2. Tabelle `apl2.antrag_einreichung` als Tracking-Liste — Status
--      wartend → fertig | fehler. Anon darf SELECT (per Tracking-UUID
--      bookmarkbare Status-URL), Insert + Update nur service_role.
--   3. DB-Trigger der bei INSERT in antrag_einreichung den n8n-Webhook
--      anstößt (analog Migration 023).

begin;

-- ── 1) Storage-Bucket ───────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'antragseingang-pdf') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'antragseingang-pdf',
      'antragseingang-pdf',
      false,
      10 * 1024 * 1024,  -- 10 MB max
      array['application/pdf']
    );
  end if;
end $$;

-- Storage-Policies: nur service_role darf read/write. Edge Function läuft
-- mit service_role-Key, n8n auch.
do $$
begin
  if pg_has_role(current_user, 'supabase_admin', 'MEMBER')
     or current_user = 'supabase_admin' then
    drop policy if exists "service_role manages antragseingang pdf" on storage.objects;
    create policy "service_role manages antragseingang pdf"
      on storage.objects for all
      to service_role
      using (bucket_id = 'antragseingang-pdf')
      with check (bucket_id = 'antragseingang-pdf');
  else
    raise notice 'Skipping storage-policy — User % hat keine supabase_admin-Rechte.', current_user;
  end if;
end $$;


-- ── 2) Tracking-Tabelle ────────────────────────────────────────────
create table if not exists apl2.antrag_einreichung (
  id              uuid primary key default gen_random_uuid(),
  storage_path    text not null,
  dateiname       text,
  groesse_bytes   bigint,
  eingereicht_am  timestamptz not null default now(),
  status          text not null default 'wartend'
    check (status in ('wartend', 'in_verarbeitung', 'fertig', 'fehler')),
  -- Wenn fertig: Referenz auf den erzeugten Antrag
  antrag_id       uuid references apl2.antraege(id) on delete set null,
  -- Vorschau der extrahierten Daten fürs Frontend (JSON)
  extrahiert_jsonb jsonb,
  -- Bei status='fehler' die Fehler-Meldung
  fehler_text     text,
  -- Zeitstempel der Verarbeitung (für Demo-Anzeige „X Sekunden gedauert")
  verarbeitet_am  timestamptz
);

comment on table apl2.antrag_einreichung is
  'Tracking-Liste für UE0 (PDF-Upload-Reifegradstufe). Bürger lädt PDF, n8n extrahiert via Claude Vision OCR, status wechselt wartend → in_verarbeitung → fertig/fehler.';

create index if not exists idx_antrag_einreichung_status on apl2.antrag_einreichung(status);
create index if not exists idx_antrag_einreichung_eingereicht_am on apl2.antrag_einreichung(eingereicht_am desc);

-- RLS — anon darf SELECT (Tracking-UUID ist Bookmark-Token, quasi
-- unguessable). Insert + Update nur service_role.
alter table apl2.antrag_einreichung enable row level security;

do $$
begin
  drop policy if exists "anon kann eigene einreichung sehen" on apl2.antrag_einreichung;
  create policy "anon kann eigene einreichung sehen"
    on apl2.antrag_einreichung for select
    to anon, authenticated
    using (true);

  drop policy if exists "service_role kann alles" on apl2.antrag_einreichung;
  create policy "service_role kann alles"
    on apl2.antrag_einreichung for all
    to service_role
    using (true) with check (true);
end $$;

grant select on apl2.antrag_einreichung to anon, authenticated;
grant all    on apl2.antrag_einreichung to service_role;


-- ── 3) n8n-Webhook-Trigger ─────────────────────────────────────────
create or replace function apl2.notify_n8n_on_pdf_einreichung() returns trigger
language plpgsql as $$
declare
  webhook_url text;
begin
  webhook_url := current_setting('app.n8n_ue0_webhook', true);
  if webhook_url is null or webhook_url = '' then
    raise warning 'app.n8n_ue0_webhook nicht gesetzt — UE0-Workflow wird nicht angestoßen';
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
  -- Bei Webhook-Fehler den Einreichung-Status auf 'fehler' setzen, damit
  -- der Bürger nicht ewig auf ein „wartend" starrt.
  update apl2.antrag_einreichung
     set status = 'fehler',
         fehler_text = 'n8n-Webhook nicht erreichbar: ' || sqlerrm
   where id = new.id;
  raise warning 'n8n-UE0-Webhook fehlgeschlagen für %: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists trg_notify_n8n_on_pdf_einreichung on apl2.antrag_einreichung;
create trigger trg_notify_n8n_on_pdf_einreichung
  after insert on apl2.antrag_einreichung
  for each row execute function apl2.notify_n8n_on_pdf_einreichung();


commit;

notify pgrst, 'reload schema';
