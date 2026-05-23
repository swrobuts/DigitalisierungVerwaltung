-- 040_terminologie_hoechstgrenze.sql
--
-- Begriffs-Hygiene: 'Cap' war ein selbst-eingeführter Anglizismus, der
-- in der AHP-Rechtsgrundlage nicht vorkommt. Die Richtlinie spricht
-- konsequent von 'Förderhöchstgrenze' bzw. 'bis zu X €'. Ein Tool, das
-- KI-gestützte Verwaltungsentscheidungen unterstützt, muss sich der
-- Rechtssprache anpassen und keine Neologismen einführen.
--
-- Diese Migration räumt zwei DB-seitige Reste auf:
--   1. statement_type 'cap' → 'hoechstgrenze' in apl2.ahp_norm_statements
--      (CHECK-Constraint anpassen, bestehende 7 Rows umschreiben)
--   2. Ontologie-Regel 'auszahlung_max_cap_mal_anteil' →
--      'auszahlung_max_hoechstgrenze_mal_anteil'

-- 1) statement_type ändern
begin;

-- Constraint droppen, Werte umschreiben, Constraint neu setzen
alter table apl2.ahp_norm_statements
  drop constraint if exists ahp_norm_statements_statement_type_check;

update apl2.ahp_norm_statements
  set statement_type = 'hoechstgrenze'
  where statement_type = 'cap';

alter table apl2.ahp_norm_statements
  add constraint ahp_norm_statements_statement_type_check
  check (statement_type = any (array[
    'hoechstgrenze',  -- vormals 'cap'
    'frist',
    'verbot',
    'verpflichtung',
    'pflichtfeld',
    'staffel',
    'qualitativ'
  ]));

commit;

-- 2) Ontologie-Regel umbenennen
update apl2.ontologie_rules
  set rule_name = 'auszahlung_max_hoechstgrenze_mal_anteil'
  where rule_name = 'auszahlung_max_cap_mal_anteil';

notify pgrst, 'reload schema';
