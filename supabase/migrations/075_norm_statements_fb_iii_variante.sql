-- 075_norm_statements_fb_iii_variante.sql
--
-- Bug 4 (nach 074): Die 4 FB-III-Statements (§ 2.3.1–2.3.5) hatten
-- fb_iii_variante = NULL. Mein Filter in fb_iii.baue_subsumtions_prompt
--   if s.get("fb_iii_variante") in (variante, None)
-- liess deshalb alle Variante-Statements (A/B/C/D) durch, weil None
-- immer matched. Folge: bei Variante-D-Antraegen rendert das LLM 3
-- Pseudo-Verstoesse "Variante D, nicht Variante A/B/C".
--
-- Fix: Mapping ref → Variante setzen.
--   § 2.3.1 → A (Mehrgenerationenhaus)
--   § 2.3.2 → B (Begegnungszentrum/Bildungstraeger)
--   § 2.3.4 → C (Seniorenkreis Treffen-Staffel)
--   § 2.3.5 → D (Quartiersmanagement)

begin;

update apl.ahp_norm_statements
   set fb_iii_variante = 'A'
 where foerderbereich = 'III' and ref = '§ 2.3.1';

update apl.ahp_norm_statements
   set fb_iii_variante = 'B'
 where foerderbereich = 'III' and ref = '§ 2.3.2';

update apl.ahp_norm_statements
   set fb_iii_variante = 'C'
 where foerderbereich = 'III' and ref = '§ 2.3.4';

update apl.ahp_norm_statements
   set fb_iii_variante = 'D'
 where foerderbereich = 'III' and ref = '§ 2.3.5';

commit;
