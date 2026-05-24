-- 046_fake_demo_reset.sql
--
-- Demo-Hygiene vor der Vorlesung. Pre-Mortem entdeckt:
--   - FAKE-001 ist 'bewilligt', hat aber 5 abgelehnte Bescheide aus
--     früheren Demo-Runs (verwirrend, weil Status-Text + Bescheid-Inhalt
--     widersprechen).
--   - FAKE-006 ist 'eingegangen', hat aber 3 Bescheide und eine offene
--     KI-Prüfung ohne abgeschlossen_am (halbfertiger State).
--
-- Diese Migration räumt alle FAKE-2026-Anträge in einen kohärenten
-- Startzustand zurück, damit die Vorlesung am sauberen Workflow zeigen
-- kann, wie Eingang → KI-Prüfung → Bescheid abläuft.
--
-- Nur FAKE-2026 wird angefasst. FAKE-2025 (Vorjahres-Antrag für VJ-
-- Vergleich) bleibt erhalten.

begin;

-- 1) Offene/halbfertige Prüfungen löschen
delete from apl2.pruefungen p
 where p.antrag_id in (
   select id from apl2.antraege where antragsnummer like 'APL2-2026-FAKE-%'
 );

-- 2) Alle Bescheide zu FAKE-2026 löschen. Owner-sicher mit DO-Block,
--    weil bescheide-Tabelle laut Migration 039 supabase_admin gehört.
do $$
begin
  if pg_has_role(current_user, 'supabase_admin', 'MEMBER')
     or current_user = 'supabase_admin' then
    delete from apl2.bescheide b
     where b.antrag_id in (
       select id from apl2.antraege where antragsnummer like 'APL2-2026-FAKE-%'
     );
  else
    raise notice 'Skipping bescheide-delete — User % hat keine supabase_admin-Rechte.', current_user;
  end if;
end $$;

-- 3) Status zurück auf 'eingegangen'. Wir umgehen bewusst den Workflow-
--    Trigger via session_replication_role=replica:
--    a) das direkte 'bewilligt → eingegangen' ist im Workflow nicht
--       erlaubt (nur via 'in_pruefung' möglich), das wäre für einen
--       Demo-Reset ein unnötiger Zweischritt.
--    b) der History-Trigger soll für diesen synthetischen Reset KEINEN
--       Eintrag erzeugen — sonst sähen Studis später eine verwirrende
--       „bewilligt → eingegangen"-Zeile im Audit-Trail. Echte Workflow-
--       Transitions laufen weiterhin durch alle Trigger.
set local session_replication_role = replica;
update apl2.antraege
   set status = 'eingegangen'
 where antragsnummer like 'APL2-2026-FAKE-%'
   and status != 'eingegangen';
set local session_replication_role = origin;

-- 3a) Alle für FAKE-2026 erzeugten History-Einträge löschen, damit der
--     Demo-Antrag wirklich "frisch" wirkt. Ältere Antrag-Edits aus
--     Migration 040/042 würden sonst noch sichtbar bleiben.
delete from apl2.antrag_history h
 where h.antrag_id in (
   select id from apl2.antraege where antragsnummer like 'APL2-2026-FAKE-%'
 );

-- 4) Kontroll-Ausgabe
do $$
declare
  cnt_b int;
  cnt_p int;
begin
  select count(*) into cnt_b from apl2.bescheide b
   where b.antrag_id in (select id from apl2.antraege where antragsnummer like 'APL2-2026-FAKE-%');
  select count(*) into cnt_p from apl2.pruefungen p
   where p.antrag_id in (select id from apl2.antraege where antragsnummer like 'APL2-2026-FAKE-%');
  raise notice 'Migration 046: nach Reset noch % Bescheide und % Prüfungen für FAKE-2026', cnt_b, cnt_p;
end $$;

commit;

notify pgrst, 'reload schema';
