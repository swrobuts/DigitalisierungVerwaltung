-- Migration 080: apl.allow_email — RLS-Policy für authenticated-Rolle
--
-- Bug 2026-05-30: Nach Magic-Link-Login schlug der allow_email-Lookup
-- aus dem Frontend mit „permission denied for table allow_email" (42501)
-- fehl → useUserRole returnt rolle=null → AuthGuard wirft den Sach-
-- bearbeiter sofort wieder auf /login → unmöglich einzuloggen.
--
-- Ursache: die Tabelle hatte zwar GRANT SELECT für service_role, aber
-- keine Lese-Rechte für die `authenticated`-Rolle (frische Supabase-
-- Sessions nach Magic-Link). RLS war außerdem nicht konfiguriert.
--
-- Lösung (Defense-in-Depth, datenschutzfreundlich):
--   * GRANT SELECT für authenticated — sonst greift RLS gar nicht
--   * RLS aktivieren + Policy „nur eigene E-Mail-Zeile lesbar"
--     → Sachbearbeiter:in A sieht NICHT, dass Sachbearbeiter:in B
--       freigeschaltet ist
--     → die ganze Allowlist bleibt nur für service_role / admin sichtbar
--   * anon (unauthenticated) bekommt nichts — Allowlist ist nicht
--     öffentlich
--
-- Idempotent: GRANT/POLICY mit DROP IF EXISTS.

BEGIN;

-- GRANT — ohne das greift selbst die RLS-Policy nicht
GRANT SELECT ON apl.allow_email TO authenticated;

-- RLS aktivieren
ALTER TABLE apl.allow_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE apl.allow_email FORCE ROW LEVEL SECURITY;

-- Policy: jeder darf NUR seine eigene Zeile sehen
DROP POLICY IF EXISTS allow_email_select_own ON apl.allow_email;
CREATE POLICY allow_email_select_own
  ON apl.allow_email
  FOR SELECT
  TO authenticated
  USING (email = (auth.jwt() ->> 'email'));

-- Sicherheits-Check: anon hat KEIN Lese-Recht (sonst wäre die Allowlist
-- öffentlich). Wir entziehen explizit, falls eine frühere Migration
-- GRANT vergeben hat.
REVOKE SELECT ON apl.allow_email FROM anon;

-- PostgREST über Schema-Änderung informieren
NOTIFY pgrst, 'reload schema';

COMMIT;
