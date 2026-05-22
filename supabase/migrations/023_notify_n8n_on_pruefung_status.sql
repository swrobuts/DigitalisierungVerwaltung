-- 023_notify_n8n_on_pruefung_status.sql
-- Wenn Sachbearbeiter Status auf 'in_pruefung' setzt, triggert pg_net
-- einen n8n-Webhook → Workflow läuft im Hintergrund → Prüfprotokoll
-- erscheint später in der UE3-GUI.

create or replace function apl2.notify_n8n_on_pruefung_status() returns trigger language plpgsql as $$
declare
  webhook_url text;
begin
  if old.status is distinct from new.status and new.status = 'in_pruefung' then
    webhook_url := current_setting('app.n8n_pruefung_webhook', true);
    if webhook_url is null or webhook_url = '' then
      raise warning 'app.n8n_pruefung_webhook nicht gesetzt';
      return new;
    end if;
    perform net.http_post(
      url := webhook_url,
      body := jsonb_build_object(
        'antrag_id', new.id::text,
        'geprueft_von', 'system-trigger'
      ),
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  end if;
  return new;
exception when others then
  raise warning 'n8n-Pruefung-Webhook fehlgeschlagen für %: %', new.antragsnummer, sqlerrm;
  return new;
end $$;

drop trigger if exists trg_notify_n8n_on_pruefung_status on apl2.antraege;
create trigger trg_notify_n8n_on_pruefung_status
  after update of status on apl2.antraege
  for each row execute function apl2.notify_n8n_on_pruefung_status();
