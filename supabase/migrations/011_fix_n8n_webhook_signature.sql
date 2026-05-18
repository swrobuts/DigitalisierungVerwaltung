-- 011_fix_n8n_webhook_signature.sql
-- Bugfix für Migration 010: pg_net liegt mit Extension in `extensions`,
-- die Funktion `http_post` aber im Schema `net`. Außerdem nimmt sie
-- `body jsonb` (kein TEXT-Cast).

create or replace function apl2.notify_n8n_on_antrag_insert() returns trigger language plpgsql as $$
declare
  webhook_url text;
begin
  webhook_url := current_setting('app.n8n_eingang_webhook', true);
  if webhook_url is null or webhook_url = '' then
    raise warning 'app.n8n_eingang_webhook nicht gesetzt — Webhook übersprungen für Antrag %', new.antragsnummer;
    return new;
  end if;
  perform net.http_post(
    url := webhook_url,
    body := jsonb_build_object(
      'antragsnummer', new.antragsnummer,
      'name', new.name,
      'email', new.email,
      'submitted_language', new.submitted_language,
      'submitted_at', new.submitted_at
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  raise warning 'n8n-Webhook fehlgeschlagen für Antrag %: %', new.antragsnummer, sqlerrm;
  return new;
end $$;
