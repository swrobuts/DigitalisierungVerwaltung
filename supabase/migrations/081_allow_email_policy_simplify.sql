-- Migration 081: apl.allow_email — Policy auf simple authenticated-Read
--
-- Korrigiert Migration 080. Die dortige Policy hat
-- `email = (auth.jwt() ->> 'email')` als USING — funktioniert auf
-- gemanagter Supabase, aber im Self-hosted Setup wirft der
-- auth.jwt()-Aufruf einen 502 „An invalid response was received
-- from the upstream server" (vermutlich JIT-/Plan-Cache-Issue mit
-- den langen Schema-Cache-Reloads). Bürger sahen dadurch nach
-- erfolgreichem Magic-Link-Klick einen sofortigen Redirect zurück
-- auf /login.
--
-- Lösung: simplere Policy `USING (true)` — jeder authenticated
-- darf SELECT. Für eine 5-Personen-Sachbearbeiter-Whitelist ist
-- die Liste der Kollegen-Emails ohnehin nicht geheim. anon bleibt
-- weiterhin ausgesperrt (REVOKE aus Migration 080 bleibt aktiv).
--
-- Idempotent. Räumt zugleich Reste von älteren Policies auf
-- (`authenticated_select` aus früherem RLS-Setup, `allow_email_select_own`
-- aus Migration 080).

BEGIN;

-- Reste aller bekannten Vorgänger entfernen
DROP POLICY IF EXISTS allow_email_select_own ON apl.allow_email;
DROP POLICY IF EXISTS authenticated_select ON apl.allow_email;
DROP POLICY IF EXISTS allow_email_authenticated_read ON apl.allow_email;

-- GRANT sicherstellen (falls Migration 080 nicht durchgelaufen ist)
GRANT SELECT ON apl.allow_email TO authenticated;

-- RLS ON (idempotent)
ALTER TABLE apl.allow_email ENABLE ROW LEVEL SECURITY;

-- Die finale Policy — simpel, robust, im Self-hosted-Setup ohne 502
CREATE POLICY allow_email_authenticated_read
  ON apl.allow_email
  FOR SELECT
  TO authenticated
  USING (true);

-- anon bleibt ausgesperrt (REVOKE aus 080)
REVOKE SELECT ON apl.allow_email FROM anon;

-- WICHTIG: KEIN `NOTIFY pgrst, 'reload schema'` mehr — dieser Trigger
-- hat während des Multi-Schema-Cache-Loads PostgREST mehrfach in den
-- PGRST002-Hänger getrieben. Schema-Cache neu zu laden ist nur dann
-- nötig, wenn Spalten/Tabellen ändern; eine reine RLS-Policy-Änderung
-- ist live aktiv ohne Reload.

COMMIT;
