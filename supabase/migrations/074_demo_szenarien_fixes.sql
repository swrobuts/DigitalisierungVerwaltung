-- 074_demo_szenarien_fixes.sql
--
-- Zwei Fixes nach dem ersten Smoketest von Migration 073:
--
-- Bug 2 (IBANs): 4 der 6 Demo-IBANs hatten ungueltige mod-97-Pruefziffern
--   und loesten dadurch Layer-A-Pseudo-Verstoesse aus ("IBAN ungueltig").
--   Die 4 IBANs werden auf neu generierte, mod-97-valide IBANs gesetzt.
--
-- Bug 3 (Doppelfoerderung-Hinweis prominenter): Bei Case 5 stand der
--   Quartiersbuero-Hinweis nur im d_ehrenamt_personen_jsonb. Das LLM hat
--   ihn nicht aufgegriffen. Wir verlagern ihn zusaetzlich ins
--   d_hauptamt_name-Feld, das im Antrag prominenter steht.
--
-- UPDATE statt TRUNCATE — keine Bescheide/Pruefungen werden verworfen
-- (Robert kann bei Bedarf 073 nochmal apply'n um komplett zu reseten).

begin;

-- ── Bug 2: IBANs reparieren ─────────────────────────────────────────────────

-- Case 3: DEMO-Senioren-Stammtisch Sanderau (VR-Bank Wuerzburg)
update apl.antraege
   set iban = 'DE87790900003456789012'
 where einrichtung like 'DEMO-Senioren-Stammtisch%';

-- Case 4: DEMO-Seniorenkreis St. Adalbero (LIGA Bank)
update apl.antraege
   set iban = 'DE19750903004567890123'
 where einrichtung = 'DEMO-Seniorenkreis St. Adalbero';

-- Case 5: DEMO-Quartiersmanagement Grombuehl (Evangelische Bank)
update apl.antraege
   set iban = 'DE62520604105678901234'
 where einrichtung = 'DEMO-Quartiersmanagement Grombühl';

-- Case 6: DEMO-Tuerk-Deutscher Seniorenbund (Sparkasse Mainfranken)
update apl.antraege
   set iban = 'DE51790500006789012345'
 where einrichtung = 'DEMO-Türkisch-Deutscher Seniorenbund Würzburg';


-- ── Bug 3: Doppelfoerderungs-Hinweis fuer Case 5 prominent setzen ───────────
-- Hauptamt-Name war "Sarah Weber" pur. Wir ergaenzen den
-- Doppelfoerderungs-Hinweis direkt im Feldwert. Das LLM sieht ihn dann
-- garantiert (steht im Plugin-Prompt direkt unter "Antrag: ..."),
-- und im UI faellt es dem Sachbearbeiter sofort auf.
update apl.fb_iii_variante
   set d_hauptamt_name = 'Sarah Weber (50% Stelle; weitere 50% finanziert ueber Bayer. Quartiersbuero-Programm 2025/2026 — bitte Doppelfoerderung pruefen)'
 where antrag_id = (
   select id from apl.antraege
    where einrichtung = 'DEMO-Quartiersmanagement Grombühl'
 );


commit;
