-- 026_ontologie_foerderhoechstgrenze.sql
--
-- Ergänzt die AHP-konforme Ontologie um die Förderhöchstgrenze für
-- Begegnungszentren (in die APL2 inhaltlich fällt).
--
-- AHP Kap. 2.3.2 Begegnungszentren: "Begegnungszentren für Senioren
-- erhalten in Anlehnung zur Förderung der Mehrgenerationenhäuser einen
-- Zuschuss von bis zu 10.000 € pro Jahr."
--
-- Zwei Regeln, beide gegen geforderte_foerdersumme_euro:
-- (a) Cap-Verstoss wenn Forderung > 10.000 €
-- (b) Hinweis wenn keine Forderungssumme angegeben (NULL) — dann nicht
--     maschinell prüfbar, Sachbearbeiter muss manuell

insert into apl2.ontologie_rules (plan_id, rule_name, beschreibung, condition_jsonb, fehler_msg_de, schwere, paragraph_ref) values

-- Förderhöchstgrenze 10.000 €/Jahr (AHP 2.3.2)
-- json-logic: <= 10000 prüft den geforderten Wert. NULL wird vom Lib zu 0
-- konvertiert → false-positive-frei (0 <= 10000 ist true, Regel nicht verletzt).
('APL2', 'foerderhoechstgrenze_begegnungszentren',
  'AHP Kap. 2.3.2: Begegnungszentren erhalten einen Zuschuss von bis zu 10.000 € pro Jahr.',
  '{"<=":[{"var":"geforderte_foerdersumme_euro"},10000]}',
  'Geforderte Fördersumme übersteigt die AHP-Obergrenze von 10.000 €/Jahr für Begegnungszentren.',
  'verstoss',
  'AHP 2.3.2 Begegnungszentren'
),

-- Hinweis bei fehlender Forderungssumme
('APL2', 'foerdersumme_angegeben',
  'Förderhöchstgrenze nur prüfbar wenn der Antragsteller die Forderungssumme angibt.',
  '{"!=":[{"var":"geforderte_foerdersumme_euro"},null]}',
  'Keine geforderte Fördersumme angegeben — Förderhöchstgrenze (10.000 € nach AHP 2.3.2) nicht maschinell prüfbar.',
  'hinweis',
  'AHP 2.3.2 Begegnungszentren'
);

notify pgrst, 'reload schema';
