-- 077_tbd_norm_statements_deaktivieren.sql
--
-- Bug 7: 10 Norm-Statements in apl.ahp_norm_statements haben noch
-- "TBD —"-Placeholder als woertliches_zitat. Solange sie aktiv sind,
-- liefert die LLM-Subsumtion Befunde mit dem TBD-Text als Zitat — das
-- sieht im UI haesslich aus und ist ein Halluzinations-Risiko:
-- das LLM neigt dazu, das fehlende echte Zitat durch erfundene
-- Detail-Aussagen zu kompensieren (Beispiel: § 3.3 lieferte "30. April"
-- statt "1. April", bis wir in Migration 076 das echte Zitat eintrugen).
--
-- Bug 8: AGB.IBAN-Statement verleitet das LLM dazu, IBANs als invalid
-- zu markieren (LLM-Konfidenz 95%, aber tatsaechlich sind die Demo-
-- IBANs alle mod-97-valide). IBAN-Validierung gehoert in Layer A
-- (layer_a_strukturell._is_valid_iban), nicht in Layer B LLM-Subsumtion.
-- Deaktivieren statt loeschen, damit der Halluzinations-Validator den
-- ref ggf. spaeter wieder erkennen kann (Rueckwaerts-Kompat).
--
-- Strategie: aktiv=false statt loeschen. Wenn Robert spaeter echte
-- Zitate aus der AHP nachpflegt, einfach wieder aktiv=true setzen.

begin;

update apl.ahp_norm_statements
   set aktiv = false
 where woertliches_zitat like 'TBD%'
    or woertliches_zitat like '%TBD —%';

-- Sanity-Check: wieviele TBD-Statements wurden deaktiviert?
do $$
declare
  cnt int;
begin
  select count(*) into cnt
    from apl.ahp_norm_statements
   where aktiv = false and (woertliches_zitat like 'TBD%' or woertliches_zitat like '%TBD —%');
  raise notice 'Deaktiviert: % Norm-Statements mit TBD-Placeholder', cnt;
end $$;

commit;
