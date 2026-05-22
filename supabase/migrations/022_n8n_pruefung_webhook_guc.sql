-- 022_n8n_pruefung_webhook_guc.sql
-- Setzt App-GUC für n8n-Prüfungs-Webhook.
-- WICHTIG: muss mit User supabase_admin angewendet werden (postgres-User
-- hat seit dem Security-Hardening keine SUPERUSER-Rechte und kann keine
-- app.*-GUCs setzen).
alter database postgres set app.n8n_pruefung_webhook = 'https://n8n.butscher.cloud/webhook/apl2-pruefung';
