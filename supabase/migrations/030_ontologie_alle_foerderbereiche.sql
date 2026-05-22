-- 030_ontologie_alle_foerderbereiche.sql
--
-- Phase D — Ontologie-Erweiterung auf Basis der kuratierten Norm-Statements
-- (Migration 028 + Curator-Pass): pro Förderbereich eigene Cap-Regel,
-- Befristung FB I, Mindest-Gruppengröße Seniorenkreise, Doppelförderung,
-- Wirkungsort, Finanzplanung, Logo-Verwendung.
--
-- JSON-Logic-Pattern für Förderbereich-spezifische Caps:
--   {"or": [
--     {"!=":[{"var":"foerderbereich"}, "<bereich>"]},
--     {"<=":[{"var":"geforderte_foerdersumme_euro"}, <cap>]}
--   ]}
-- "Wenn nicht dieser Förderbereich → Regel nicht verletzt.
--  Wenn dieser Förderbereich → prüfe Cap."
--
-- Alle paragraph_ref-Werte verweisen auf real existierende Sections im
-- apl2.ahp_doctree (Version 2025-03-27).

begin;

-- ── 1) Existierende Cap-Regel auf foerderbereich-Bedingung verschärfen ──
-- (vorher griff sie für ALLE Anträge — jetzt nur für Begegnungszentren)
update apl2.ontologie_rules
set condition_jsonb = '{"or":[
    {"!=":[{"var":"foerderbereich"},"begegnungszentren"]},
    {"<=":[{"var":"geforderte_foerdersumme_euro"},10000]}
  ]}'::jsonb,
    beschreibung = 'AHP Kap. 2.3.2: Begegnungszentren erhalten einen Zuschuss von bis zu 10.000 € pro Jahr. Regel feuert nur wenn foerderbereich=begegnungszentren.'
where plan_id='APL2' and rule_name='foerderhoechstgrenze_begegnungszentren';

-- ── 2) Cap-Regeln für die übrigen Förderbereiche ──

insert into apl2.ontologie_rules
  (plan_id, rule_name, beschreibung, condition_jsonb, fehler_msg_de, schwere, paragraph_ref) values

-- AHP 2.1: FB I — Aufbau niedrigschwelliger Angebote, 3.000 €/Jahr
('APL2', 'foerderhoechstgrenze_aufbau_niedrigschwellig',
  'AHP Kap. 2.1: Pauschaler Zuschuss in Höhe von 3.000 € pro Jahr für Aufbau niedrigschwelliger Angebote (FB I).',
  '{"or":[
    {"!=":[{"var":"foerderbereich"},"aufbau_niedrigschwellige_angebote"]},
    {"<=":[{"var":"geforderte_foerdersumme_euro"},3000]}
  ]}'::jsonb,
  'Förderbereich I (Aufbau niedrigschwelliger Angebote): Geforderte Summe übersteigt AHP-Höchstgrenze 3.000 € pro Jahr.',
  'verstoss', 'AHP 2.1 Förderbereich I'),

-- AHP 2.1: FB I auf 3 Jahre befristet
('APL2', 'aufbau_niedrigschwellig_max_3_jahre',
  'AHP Kap. 2.1: Zuschüsse im Aufbau-Förderbereich sind auf maximal drei Jahre befristet.',
  '{"or":[
    {"!=":[{"var":"foerderbereich"},"aufbau_niedrigschwellige_angebote"]},
    {"<=":[{"var":"foerderbereich_seit_jahren"},3]}
  ]}'::jsonb,
  'Förderbereich I ist auf maximal 3 Jahre befristet. Träger wird bereits länger als 3 Jahre in diesem Topf gefördert.',
  'verstoss', 'AHP 2.1 Förderbereich I'),

-- AHP 2.2: FB II — bürgerschaftliches Engagement, 750 € pauschal + Staffel
-- (Cap-Regel: Basis 750 €, aber Staffel bis 5.500 € möglich — wir prüfen
-- nur die Top-Cap. Staffel wird separat als Hinweis evaluiert.)
('APL2', 'foerderhoechstgrenze_buergerschaftliches_engagement',
  'AHP Kap. 2.2: Förderbereich II — pauschal 750 € + gestaffelte Zusatzförderung bis maximal 5.500 € pro Jahr.',
  '{"or":[
    {"!=":[{"var":"foerderbereich"},"buergerschaftliches_engagement"]},
    {"<=":[{"var":"geforderte_foerdersumme_euro"},5500]}
  ]}'::jsonb,
  'Förderbereich II (bürgerschaftliches Engagement): Geforderte Summe übersteigt AHP-Höchstgrenze 5.500 € pro Jahr.',
  'verstoss', 'AHP 2.2 Förderbereich II'),

-- AHP 2.3.1: MGH 10.000 €/Jahr pauschal (kein "bis zu", harte Pauschale)
('APL2', 'foerderhoechstgrenze_mgh',
  'AHP Kap. 2.3 (Mehrgenerationenhäuser): pauschale Förderung von 10.000 € pro Jahr.',
  '{"or":[
    {"!=":[{"var":"foerderbereich"},"mehrgenerationenhaeuser"]},
    {"<=":[{"var":"geforderte_foerdersumme_euro"},10000]}
  ]}'::jsonb,
  'Mehrgenerationenhäuser: pauschale AHP-Förderung beträgt 10.000 € pro Jahr — geforderte Summe übersteigt diesen Wert.',
  'verstoss', 'AHP 2.3 Mehrgenerationenhäuser'),

-- AHP 2.3.3: Bildungsträger 6.000 €/Jahr
('APL2', 'foerderhoechstgrenze_bildungstraeger',
  'AHP Kap. 2.3 (Bildungsträger/Bildungshäuser): pauschale Förderung bis 6.000 € pro Jahr.',
  '{"or":[
    {"!=":[{"var":"foerderbereich"},"bildungstraeger"]},
    {"<=":[{"var":"geforderte_foerdersumme_euro"},6000]}
  ]}'::jsonb,
  'Bildungsträger / Bildungshäuser: geforderte Summe übersteigt AHP-Höchstgrenze 6.000 € pro Jahr.',
  'verstoss', 'AHP 2.3 Bildungsträger'),

-- AHP 2.3.4: Seniorenkreise 2.000 €/Jahr
('APL2', 'foerderhoechstgrenze_seniorenkreise',
  'AHP Kap. 2.3 (Seniorenkreise): pauschale Förderung bis 2.000 € pro Jahr, gestaffelt nach Treffenzahl.',
  '{"or":[
    {"!=":[{"var":"foerderbereich"},"seniorenkreise"]},
    {"<=":[{"var":"geforderte_foerdersumme_euro"},2000]}
  ]}'::jsonb,
  'Seniorenkreise: geforderte Summe übersteigt AHP-Höchstgrenze 2.000 € pro Jahr.',
  'verstoss', 'AHP 2.3 Seniorenkreise'),

-- AHP 2.3.4: Seniorenkreise Mindestgröße 6 Senioren
('APL2', 'seniorenkreise_min_6_teilnehmer',
  'AHP Kap. 2.3 (Seniorenkreise): Gruppengröße soll mindestens 6 Senior:innen umfassen.',
  '{"or":[
    {"!=":[{"var":"foerderbereich"},"seniorenkreise"]},
    {"==":[{"var":"anzahl_teilnehmer"},null]},
    {">=":[{"var":"anzahl_teilnehmer"},6]}
  ]}'::jsonb,
  'Seniorenkreise sollen mindestens 6 Teilnehmer:innen umfassen — angegebene Zahl unterschreitet diese Mindestgröße.',
  'verstoss', 'AHP 2.3 Seniorenkreise'),

-- AHP 2.3.4: Seniorenkreise — Treffen-Staffel-Hinweis
-- (Wenn 12-24 Treffen → max 1.000 €, ab 25 → max 2.000 €.)
('APL2', 'seniorenkreise_treffenstaffel_plausibel',
  'AHP Kap. 2.3 (Seniorenkreise) Staffel: 12-24 Treffen → 1.000 € / ≥ 25 Treffen → 2.000 €.',
  '{"or":[
    {"!=":[{"var":"foerderbereich"},"seniorenkreise"]},
    {"==":[{"var":"anzahl_treffen_jahr"},null]},
    {"and":[
      {">=":[{"var":"anzahl_treffen_jahr"},25]},
      {"<=":[{"var":"geforderte_foerdersumme_euro"},2000]}
    ]},
    {"and":[
      {">=":[{"var":"anzahl_treffen_jahr"},12]},
      {"<":[{"var":"anzahl_treffen_jahr"},25]},
      {"<=":[{"var":"geforderte_foerdersumme_euro"},1000]}
    ]}
  ]}'::jsonb,
  'Seniorenkreis-Förderung passt nicht zur AHP-Staffelung (12-24 Treffen → max 1.000 €, ab 25 → max 2.000 €).',
  'hinweis', 'AHP 2.3 Seniorenkreise'),

-- AHP 2.3.5: Quartiersmanagement Altenarbeit, 7.500 €/Jahr (ab 2025)
('APL2', 'foerderhoechstgrenze_qm_altenarbeit',
  'AHP Kap. 2.3 (Quartiersmanagement Altenarbeit): pauschale Förderung bis 7.500 € pro Jahr (ab Haushaltsjahr 2025).',
  '{"or":[
    {"!=":[{"var":"foerderbereich"},"quartiersmanagement_altenarbeit"]},
    {"<=":[{"var":"geforderte_foerdersumme_euro"},7500]}
  ]}'::jsonb,
  'Quartiersmanagement Altenarbeit: geforderte Summe übersteigt AHP-Höchstgrenze 7.500 € pro Jahr.',
  'verstoss', 'AHP 2.3 Quartiersmanagement Altenarbeit'),

-- AHP 2.3.5: QM-Altenarbeit erst ab Haushaltsjahr 2025
('APL2', 'qm_altenarbeit_ab_2025',
  'AHP Kap. 2.3 (Quartiersmanagement Altenarbeit): Förderung ist erst ab Jahr 2025 verfügbar.',
  '{"or":[
    {"!=":[{"var":"foerderbereich"},"quartiersmanagement_altenarbeit"]},
    {">=":[{"var":"haushaltsjahr"},2025]}
  ]}'::jsonb,
  'Quartiersmanagement-Altenarbeit-Förderung ist erst für Haushaltsjahre ab 2025 zugänglich.',
  'verstoss', 'AHP 2.3 Quartiersmanagement Altenarbeit'),

-- ── 3) Förderbereich-Klassifikation als Voraussetzung ──

('APL2', 'foerderbereich_angegeben',
  'Voraussetzung für alle Cap-Regeln: der Antrag muss einem der AHP-Förderbereiche (2.1-2.4) zugeordnet sein.',
  '{"!=":[{"var":"foerderbereich"},null]}'::jsonb,
  'Antrag ist keinem AHP-Förderbereich zugeordnet — Cap-Regeln können nicht maschinell geprüft werden.',
  'hinweis', 'AHP 2 Förderrichtlinie und Förderbereiche'),

-- ── 4) Pflichtfelder (insb. Förderbereich IV) ──

('APL2', 'fb_iv_finanzplanung_vorhanden',
  'AHP Kap. 2.4 (Förderbereich IV): Im Antrag ist eine Finanzierungsplanung vorzulegen, die alle geplanten Ausgaben und Einnahmen umfasst.',
  '{"or":[
    {"!=":[{"var":"foerderbereich"},"struktur_schwerpunktfoerderung"]},
    {"==":[{"var":"finanzplanung_vorhanden"},true]}
  ]}'::jsonb,
  'Förderbereich IV verlangt eine vollständige Finanzierungsplanung — diese ist im Antrag nicht hinterlegt.',
  'verstoss', 'AHP 2.4 Förderbereich IV'),

('APL2', 'fb_iv_zuwendungszweck_beschrieben',
  'AHP Kap. 2.4 (Förderbereich IV): Im Antrag ist der Zuwendungszweck unter Erläuterung der angestrebten Ziele zu beschreiben.',
  '{"or":[
    {"!=":[{"var":"foerderbereich"},"struktur_schwerpunktfoerderung"]},
    {"and":[
      {"!=":[{"var":"zuwendungszweck"},null]},
      {"!=":[{"var":"zuwendungszweck"},""]}
    ]}
  ]}'::jsonb,
  'Förderbereich IV verlangt eine Beschreibung des Zuwendungszwecks mit angestrebten Zielen — diese fehlt.',
  'verstoss', 'AHP 2.4 Förderbereich IV'),

-- ── 5) FB I-spezifisches Pflichtfeld: Projektskizze ──

('APL2', 'fb_i_projektskizze_eingereicht',
  'AHP Kap. 2.1 (Förderbereich I): Anbieter muss bei Antragstellung eine Projektskizze vorlegen und diese mit dem Sozialreferat abstimmen.',
  '{"or":[
    {"!=":[{"var":"foerderbereich"},"aufbau_niedrigschwellige_angebote"]},
    {"==":[{"var":"projektskizze_eingereicht"},true]}
  ]}'::jsonb,
  'Förderbereich I verlangt eine Projektskizze, die mit dem Sozialreferat abgestimmt wurde — fehlt im Antrag.',
  'verstoss', 'AHP 2.1 Förderbereich I'),

-- ── 6) Stadtbewohner-Anteil als Skalierungsfaktor (BZ + Bildungsträger) ──

('APL2', 'stadtbewohner_anteil_angegeben',
  'AHP Kap. 2.3.2/2.3.3: Auszahlung skaliert mit dem prozentualen Anteil der Stadtbewohner an Gesamt-Teilnehmern — Anteil sollte angegeben sein.',
  '{"or":[
    {"!=":[{"var":"foerderbereich"},"begegnungszentren"]},
    {"!=":[{"var":"foerderbereich"},"bildungstraeger"]},
    {"!=":[{"var":"stadtbewohner_anteil"},null]}
  ]}'::jsonb,
  'Stadtbewohner-Anteil ist nicht angegeben — Auszahlung würde sich AHP-gerecht skalieren (Kap. 2.3.2/2.3.3), kann maschinell nicht berechnet werden.',
  'hinweis', 'AHP 2.3.2 Begegnungszentren'),

-- ── 7) Übergreifende Regeln ──

('APL2', 'doppelfoerderung_pruefen',
  'AHP Kap. 4 Schlussbemerkungen: Eine Doppelförderung wird ausgeschlossen.',
  '{"==":[1,2]}'::jsonb,
  'Doppelförderung ist nach AHP Kap. 4 ausgeschlossen — bitte manuell prüfen, ob der Träger denselben Maßnahmebereich bereits über ein anderes Förderprogramm bezuschusst bekommt.',
  'hinweis', 'AHP 4 Schlussbemerkungen'),

('APL2', 'wirkungsort_wuerzburg_pruefen',
  'AHP Kap. 3.2 e): Förderung kann nur für Leistungen gewährt werden, die auf dem Gebiet der Stadt Würzburg erbracht werden.',
  '{"==":[1,2]}'::jsonb,
  'AHP 3.2 e) verlangt, dass die geförderte Leistung auf dem Gebiet der Stadt Würzburg erbracht wird — bitte manuell prüfen.',
  'hinweis', 'AHP 3.2 Antragstellung'),

('APL2', 'logo_stadt_wuerzburg_pflicht',
  'AHP Kap. 2: Vereine, Träger und Einrichtungen sind verpflichtet, in ihren Programmen und Veröffentlichungen den Erhalt von Fördergeldern nach SGB XII § 71 zu vermerken und das Logo der Stadt Würzburg zu verwenden.',
  '{"==":[{"var":"logo_verwendet"},true]}'::jsonb,
  'AHP Kap. 2: Logo der Stadt Würzburg muss in Veröffentlichungen verwendet werden — Träger hat das nicht bestätigt.',
  'hinweis', 'AHP 2 Förderrichtlinie'),

-- ── 8) Verwaltungs-Auflage (informativ) ──

('APL2', 'kein_rechtsanspruch_auf_foerderung',
  'AHP Kap. 3.4 Bewilligung: Über Art und Höhe der Bewilligung entscheidet der Sozialausschuss — ein Rechtsanspruch besteht nicht.',
  '{"==":[1,2]}'::jsonb,
  'Hinweis: nach AHP 3.4 besteht kein Rechtsanspruch auf Förderung — Sozialausschuss entscheidet nach Prüfung durch Leitung Seniorenarbeit (FB IIS).',
  'hinweis', 'AHP 3.4 Bewilligung');

commit;

notify pgrst, 'reload schema';
