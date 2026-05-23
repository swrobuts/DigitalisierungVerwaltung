-- 043_bemessung_pflichtfelder.sql
--
-- AHP-Bemessungs-Pflichtfelder als Verstoß-Regeln in der Ontologie:
-- ohne Stadt-Anteil, Teilnehmer:innen und Veranstaltungen kann gem.
-- AHP 2.3 Pkt. 2/3 keine entscheidungsreife Bewilligungsempfehlung
-- gegeben werden.
--
-- Korrigiert außerdem einen Bug in der bestehenden Regel
-- `stadtbewohner_anteil_angegeben` (Migration 030): die JSON-Logic-
-- Bedingung war tautologisch
--   {"or":[
--     {"!=":[{"var":"foerderbereich"},"begegnungszentren"]},
--     {"!=":[{"var":"foerderbereich"},"bildungstraeger"]},
--     {"!=":[{"var":"stadtbewohner_anteil"},null]}
--   ]}
-- weil "fb != A OR fb != B" stets wahr ist (für jeden Wert von fb ist
-- mindestens eine der beiden Ungleichheiten erfüllt). Die Regel ist
-- also nie ausgelöst worden.
--
-- Schwere wird von 'hinweis' auf 'verstoss' angehoben — fehlende
-- Bemessungsdaten sind kein Hinweis, sondern verhindern die Entschei-
-- dungsreife des Antrags. Die Empfehlungs-Logik in pruefung.models
-- behandelt 'verstoss' bereits als 'rueckfrage'-trigger (heilbar:
-- Antragsteller kann die Werte nachreichen).

begin;

-- 1) Bestehende Regel fixen + Schwere anheben
update apl2.ontologie_rules
   set condition_jsonb = '{"or":[
       {"!": [{"in":[
         {"var":"foerderbereich"},
         ["begegnungszentren","bildungstraeger"]
       ]}]},
       {"!=":[{"var":"stadtbewohner_anteil"},null]}
     ]}'::jsonb,
       schwere = 'verstoss',
       fehler_msg_de = 'Stadtbewohner-Anteil ist nicht angegeben — gem. AHP 2.3 Pkt. 2/3 bestimmt dieser Wert direkt den prozentualen Auszahlungsanteil. Ohne ihn ist der Antrag nicht entscheidungsreif. Bitte vom Antragsteller nachreichen lassen.',
       beschreibung = 'AHP 2.3 Pkt. 2/3: Auszahlung erfolgt anteilig nach Stadtbewohner-Anteil — Wert ist Pflichtangabe für Begegnungszentren und Bildungsträger.'
 where plan_id = 'APL2'
   and rule_name = 'stadtbewohner_anteil_angegeben';

-- 2) Neue Regel: anzahl_teilnehmer_angegeben (Gewichtungsgröße)
insert into apl2.ontologie_rules
  (plan_id, rule_name, beschreibung, condition_jsonb, fehler_msg_de, schwere, paragraph_ref)
values
('APL2', 'anzahl_teilnehmer_angegeben',
  'AHP 2.3 Pkt. 2/3: Teilnehmer:innen-Zahl des Vorjahres ist Pflichtangabe — bestimmt die Gewichtung der Zuwendung aus dem Budget und ist Bezugsgröße für den Stadt-Anteil.',
  '{"or":[
     {"!": [{"in":[
       {"var":"foerderbereich"},
       ["begegnungszentren","bildungstraeger"]
     ]}]},
     {"!=":[{"var":"anzahl_teilnehmer"},null]}
   ]}'::jsonb,
  'Anzahl Teilnehmer:innen (Vorjahr) ist nicht angegeben — gem. AHP 2.3 Pkt. 2/3 Pflichtfeld für die Auszahlungs-Gewichtung. Bitte vom Antragsteller nachreichen lassen.',
  'verstoss',
  'AHP 2.3 Pkt. 2/3'
)
on conflict (plan_id, rule_name) do update
   set condition_jsonb = excluded.condition_jsonb,
       fehler_msg_de   = excluded.fehler_msg_de,
       schwere         = excluded.schwere,
       beschreibung    = excluded.beschreibung,
       paragraph_ref   = excluded.paragraph_ref;

-- 3) Neue Regel: anzahl_veranstaltungen_angegeben (Gewichtungsgröße)
insert into apl2.ontologie_rules
  (plan_id, rule_name, beschreibung, condition_jsonb, fehler_msg_de, schwere, paragraph_ref)
values
('APL2', 'anzahl_veranstaltungen_angegeben',
  'AHP 2.3 Pkt. 2/3: Anzahl Veranstaltungen des Vorjahres ist Pflichtangabe — gewichtet die Zuwendung aus dem Budget.',
  '{"or":[
     {"!": [{"in":[
       {"var":"foerderbereich"},
       ["begegnungszentren","bildungstraeger"]
     ]}]},
     {"!=":[{"var":"anzahl_treffen_jahr"},null]}
   ]}'::jsonb,
  'Anzahl Veranstaltungen (Vorjahr) ist nicht angegeben — gem. AHP 2.3 Pkt. 2/3 Pflichtfeld für die Auszahlungs-Gewichtung. Bitte vom Antragsteller nachreichen lassen.',
  'verstoss',
  'AHP 2.3 Pkt. 2/3'
)
on conflict (plan_id, rule_name) do update
   set condition_jsonb = excluded.condition_jsonb,
       fehler_msg_de   = excluded.fehler_msg_de,
       schwere         = excluded.schwere,
       beschreibung    = excluded.beschreibung,
       paragraph_ref   = excluded.paragraph_ref;

commit;

notify pgrst, 'reload schema';
