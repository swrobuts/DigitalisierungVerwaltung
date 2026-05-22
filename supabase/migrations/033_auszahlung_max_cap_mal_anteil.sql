-- 033_auszahlung_max_cap_mal_anteil.sql
--
-- Neue Layer-B-Regel: AHP 2.3.2 (Begegnungszentren) und 2.3.3 (Bildungs-
-- träger) erlauben die volle Cap NICHT pauschal, sondern skalieren mit
-- dem Stadtbewohner-Anteil:
--   "Je nach prozentualem Anteil der Stadtbewohner:innen an den gesamten
--    Teilnehmer:innen des Vorjahres, erfolgt die Auszahlung des
--    prozentualen Anteils."  (AHP 2.3.2)
--
-- Die Cap-Regeln aus Migration 030 prüfen nur die absolute Cap.
-- Dass die maximale Auszahlung tatsächlich Cap × Stadtbewohner-Anteil
-- ist, wird mit dieser Regel gegen das in derive_facts vorab berechnete
-- max_auszahlung_nach_anteil-Feld geprüft.
--
-- Beispiel:
--   foerderbereich=begegnungszentren, cap=10.000 €, anteil=85%
--   → max_auszahlung_nach_anteil = 8.500 €
--   Forderung 9.800 € (z.B. AWO Heidingsfeld) → Verstoß

insert into apl2.ontologie_rules
  (plan_id, rule_name, beschreibung, condition_jsonb, fehler_msg_de, schwere, paragraph_ref) values

('APL2', 'auszahlung_max_cap_mal_anteil',
  'AHP Kap. 2.3.2 / 2.3.3: Die Auszahlung an Begegnungszentren und Bildungsträger erfolgt anteilig nach dem prozentualen Anteil der Stadtbewohner:innen — die geforderte Summe darf Cap × Stadtbewohner-Anteil nicht überschreiten.',
  '{"or":[
    {"==":[{"var":"max_auszahlung_nach_anteil"},null]},
    {"<=":[{"var":"geforderte_foerdersumme_euro"},{"var":"max_auszahlung_nach_anteil"}]}
  ]}'::jsonb,
  'Geforderte Summe übersteigt die anteilig berechnete Höchstauszahlung (Cap × Stadtbewohner-Anteil) nach AHP 2.3.2/2.3.3.',
  'verstoss',
  'AHP 2.3.2 Begegnungszentren');

notify pgrst, 'reload schema';
