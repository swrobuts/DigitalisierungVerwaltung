-- 034_fix_antrag_history_security.sql
--
-- Bug-Fix: Status-Wechsel scheitert mit 'permission denied for table
-- antrag_history' weil der Trigger log_status_change als aufrufender User
-- (authenticated) läuft und dieser keine INSERT-Rechte auf antrag_history
-- hat.
--
-- Lösung: Trigger-Funktionen als SECURITY DEFINER deklarieren — sie laufen
-- dann mit den Rechten des Funktions-Owners (supabase_admin). Das ist sicher,
-- weil die Funktionen nur durch die ON-INSERT/UPDATE-Trigger auf
-- apl2.antraege aufgerufen werden, also nur bei legitimen Status-Übergängen.

alter function apl2.log_initial_status() security definer;
alter function apl2.log_status_change() security definer;

-- Sicherheitshalber: search_path explizit setzen, damit kein User die
-- Funktion via Schema-Override hijacken kann (CVE-Vermeidung bei
-- SECURITY DEFINER).
alter function apl2.log_initial_status() set search_path = apl2, public, pg_temp;
alter function apl2.log_status_change() set search_path = apl2, public, pg_temp;

notify pgrst, 'reload schema';
