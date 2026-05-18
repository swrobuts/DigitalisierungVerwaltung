-- 010_database_webhook_n8n.sql — pg_net Trigger → n8n bei antraege-Insert

create extension if not exists pg_net with schema extensions;

create or replace function apl2.notify_n8n_on_antrag_insert() returns trigger language plpgsql as $$
declare
  webhook_url text;
begin
  webhook_url := current_setting('app.n8n_eingang_webhook', true);
  if webhook_url is null or webhook_url = '' then
    raise warning 'app.n8n_eingang_webhook nicht gesetzt — Webhook übersprungen für Antrag %', new.antragsnummer;
    return new;
  end if;
  perform extensions.http_post(
    url := webhook_url,
    body := jsonb_build_object(
      'antragsnummer', new.antragsnummer,
      'name', new.name,
      'email', new.email,
      'submitted_language', new.submitted_language,
      'submitted_at', new.submitted_at
    )::text,
    headers := '{"content-type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  raise warning 'n8n-Webhook fehlgeschlagen für Antrag %: %', new.antragsnummer, sqlerrm;
  return new;
end $$;

drop trigger if exists trg_notify_n8n_on_antrag_insert on apl2.antraege;
create trigger trg_notify_n8n_on_antrag_insert
  after insert on apl2.antraege
  for each row execute function apl2.notify_n8n_on_antrag_insert();
