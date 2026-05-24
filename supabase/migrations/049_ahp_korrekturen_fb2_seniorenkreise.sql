-- 049_ahp_korrekturen_fb2_seniorenkreise.sql
--
-- Drei-fach-Audit 2026-05-24 hat zwei wörtliche Fakten-Erfindungen
-- gefunden, die im rechtsverbindlichen Bescheid landen würden:
--
-- 1) FB II "Bürgerschaftliches Engagement" — Cap im System: 5.500 €/Jahr.
--    Tatsächlich im AHP-PDF (Stand 2025-03-27, Z. 219-223):
--      750 € pauschal + Staffel-Tabelle:
--        < 3999 Std/Jahr  ODER ≤ 59 EA  →  1.250 €
--        ≥ 4000 Std/Jahr  ODER ≥ 60 EA  →  2.000 €
--        ≥ 6000 Std/Jahr  ODER ≥ 90 EA  →  3.500 €
--    Maximalsumme = 750 + 3.500 = 4.250 €/Jahr.
--    Zuordnung in höchstmögliche Kategorie (Z. 222 wörtlich:
--    "Die Zuordnung erfolgt stets in die höchst mögliche Kategorie,
--    entweder den geleisteten Stunden oder der Anzahl der
--    Ehrenamtlichen").
--
-- 2) FB III.4 Seniorenkreise — Staffel im System: "12-24 Treffen →
--    1.000 € / ≥ 25 → 2.000 €". Komplett erfunden. Im AHP-PDF
--    (Z. 257-260) steht:
--      ≥ 10 Treffen  →    750 €
--      ≥ 20 Treffen  →  1.250 €
--      ≥ 46 Treffen  →  2.000 €
--    Cap 2.000 €/Jahr, Mindestgruppengröße 6 Teilnehmer:innen
--    (Z. 258-259).
--
-- Code-Schichten (bescheid_subsumtion.py, UE3 AntragDetail.tsx,
-- Doctree) werden in Phase 1.3-1.6 nachgezogen.

begin;

-- ──────────────────────────────────────────────────────────────────
-- 1) FB II — Cap auf 4.250 € senken
-- ──────────────────────────────────────────────────────────────────

update apl2.ontologie_rules
set
  beschreibung   = 'FB II — pauschal 750 € + gestaffelte Zusatzförderung; maximal 4.250 € pro Jahr (750 € + Staffel-Max 3.500 €).',
  condition_jsonb = '{"or":[{"!=":[{"var":"foerderbereich"},"buergerschaftliches_engagement"]},{"<=":[{"var":"geforderte_foerdersumme_euro"},4250]}]}'::jsonb,
  fehler_msg_de  = 'Bei "Bürgerschaftliches Engagement" beträgt die jährliche Förderhöchstsumme 4.250 € (750 € Pauschale + 3.500 € Staffel-Maximum).',
  paragraph_ref  = 'AHP 2.2 Förderbereich II'
where rule_name = 'foerderhoechstgrenze_buergerschaftliches_engagement';

-- ──────────────────────────────────────────────────────────────────
-- 2) Seniorenkreise — korrekte Staffel 10/20/46
-- ──────────────────────────────────────────────────────────────────

update apl2.ontologie_rules
set
  beschreibung   = 'FB III.4 Seniorenkreise — Treffen-Staffel: ≥ 10 Treffen → 750 €; ≥ 20 → 1.250 €; ≥ 46 → 2.000 €. Cap 2.000 €/Jahr.',
  condition_jsonb = '{"or":[
    {"!=":[{"var":"foerderbereich"},"seniorenkreise"]},
    {"==":[{"var":"anzahl_treffen_jahr"},null]},
    {"==":[{"var":"geforderte_foerdersumme_euro"},null]},
    {"and":[
      {">=":[{"var":"anzahl_treffen_jahr"},46]},
      {"<=":[{"var":"geforderte_foerdersumme_euro"},2000]}
    ]},
    {"and":[
      {">=":[{"var":"anzahl_treffen_jahr"},20]},
      {"<":[{"var":"anzahl_treffen_jahr"},46]},
      {"<=":[{"var":"geforderte_foerdersumme_euro"},1250]}
    ]},
    {"and":[
      {">=":[{"var":"anzahl_treffen_jahr"},10]},
      {"<":[{"var":"anzahl_treffen_jahr"},20]},
      {"<=":[{"var":"geforderte_foerdersumme_euro"},750]}
    ]}
  ]}'::jsonb,
  fehler_msg_de  = 'Seniorenkreis-Förderung folgt AHP 2.3 Pkt. 4: ≥ 10 Treffen/Jahr → max 750 €, ≥ 20 → max 1.250 €, ≥ 46 → max 2.000 €. Geforderte Summe passt nicht zur angegebenen Treffenzahl.',
  paragraph_ref  = 'AHP 2.3 Pkt. 4 Seniorenkreise'
where rule_name = 'seniorenkreise_treffenstaffel_plausibel';

-- ──────────────────────────────────────────────────────────────────
-- 3) FB-III paragraph_refs korrigieren (von 2.3.x auf 2.3 Pkt. x)
--    Halluzinations-Validator kann dann im aktuellen Doctree auflösen
--    (Doctree-Untergliederung 2.3.1-2.3.5 folgt in Phase 1.3 separat).
-- ──────────────────────────────────────────────────────────────────

update apl2.ontologie_rules set paragraph_ref = 'AHP 2.3 Pkt. 1 Mehrgenerationenhäuser' where rule_name = 'foerderhoechstgrenze_mgh';
update apl2.ontologie_rules set paragraph_ref = 'AHP 2.3 Pkt. 2 Begegnungszentren'      where rule_name = 'foerderhoechstgrenze_begegnungszentren';
update apl2.ontologie_rules set paragraph_ref = 'AHP 2.3 Pkt. 3 Bildungsträger'         where rule_name = 'foerderhoechstgrenze_bildungstraeger';
update apl2.ontologie_rules set paragraph_ref = 'AHP 2.3 Pkt. 4 Seniorenkreise'         where rule_name = 'foerderhoechstgrenze_seniorenkreise';
update apl2.ontologie_rules set paragraph_ref = 'AHP 2.3 Pkt. 5 Quartiersmanagement'    where rule_name = 'foerderhoechstgrenze_qm_altenarbeit';
update apl2.ontologie_rules set paragraph_ref = 'AHP 2.3 Pkt. 5 Quartiersmanagement'    where rule_name = 'qm_altenarbeit_ab_2025';
update apl2.ontologie_rules set paragraph_ref = 'AHP 2.3 Pkt. 4 Seniorenkreise'         where rule_name = 'seniorenkreise_min_6_teilnehmer';
update apl2.ontologie_rules set paragraph_ref = 'AHP 2.3 Pkt. 2 Begegnungszentren'      where rule_name = 'auszahlung_max_cap_mal_anteil';

-- ──────────────────────────────────────────────────────────────────
-- 4) Logisch tote Regel reparieren: stadtbewohner_anteil_angegeben
--    Vorher: or-Verknüpfung — feuert nie.
--    Nachher: für die zwei FBe mit Anteils-Skalierung Pflicht.
-- ──────────────────────────────────────────────────────────────────

update apl2.ontologie_rules
set condition_jsonb = '{"or":[
    {"and":[
      {"!=":[{"var":"foerderbereich"},"begegnungszentren"]},
      {"!=":[{"var":"foerderbereich"},"bildungstraeger"]}
    ]},
    {"!=":[{"var":"stadtbewohner_anteil"},null]}
  ]}'::jsonb,
    fehler_msg_de = 'Für "Begegnungszentren" und "Bildungsträger" muss der Stadtbewohner-Anteil (Vorjahr) angegeben sein — die Auszahlung erfolgt anteilig (AHP 2.3 Pkt. 2/3).',
    paragraph_ref = 'AHP 2.3 Pkt. 2 Begegnungszentren'
where rule_name = 'stadtbewohner_anteil_angegeben';

-- ──────────────────────────────────────────────────────────────────
-- 5) logo_stadt_wuerzburg_pflicht — feuert aktuell IMMER, weil
--    Default NULL bei jedem Antrag als != true gewertet wird.
--    aktiv=false setzen, bis das Feld erhoben wird.
-- ──────────────────────────────────────────────────────────────────

update apl2.ontologie_rules
set
  aktiv = false,
  beschreibung = beschreibung || ' [DEAKTIVIERT 2026-05-24: feuerte fälschlich bei jedem Antrag, weil logo_verwendet nicht erhoben wird. Reaktivierung sobald Webform/OCR das Feld setzt.]'
where rule_name = 'logo_stadt_wuerzburg_pflicht';

-- ──────────────────────────────────────────────────────────────────
-- 6) ahp_norm_statements — alte erfundene FB-II-Staffel verwerfen
--    und durch AHP-konforme Statements ersetzen.
--    Schema: section_path, section_title, statement, statement_type,
--    status, kuratierungs_kommentar, doctree_version.
--    statement_type CHECK: 'hoechstgrenze'|'frist'|'verbot'|'verpflichtung'
--                          |'pflichtfeld'|'staffel'|'qualitativ'
-- ──────────────────────────────────────────────────────────────────

-- Aktuelle Doctree-Version ermitteln (für FK-konsistenten Insert)
do $$
declare
  v text;
begin
  select version into v from apl2.ahp_doctree order by built_at desc limit 1;
  if v is null then
    raise exception 'Migration 049: keine Doctree-Version gefunden — bitte zuerst /api/rebuild-doctree.';
  end if;

  -- Alle bisherigen 2.2-statements als verworfen markieren
  update apl2.ahp_norm_statements
  set status = 'verworfen',
      kuratierungs_kommentar = coalesce(kuratierungs_kommentar, '') ||
        ' [Audit 2026-05-24: enthielt erfundene Staffel-Werte (300/500/700 Std → 1.500/2.500/4.000/5.500 €). AHP-PDF Stand 2025-03-27 Z. 219-223 nennt < 3999/≥4000/≥6000 Std → 1.250/2.000/3.500 €.]'
  where section_path = '2.2';

  -- Korrekte 2.2-Statements neu einfügen
  insert into apl2.ahp_norm_statements
    (doctree_version, section_path, section_title, statement, statement_type, status, kuratierungs_kommentar, kuratiert_am)
  values
    (v, '2.2', 'Förderbereich II — Bürgerschaftliches Engagement',
     'Diese Angebote werden pauschal mit einem Zuschuss von 750 € pro Jahr gefördert.',
     'hoechstgrenze', 'kuratiert',
     'Wörtlich AHP 2025-03-27 Z. 219-220.', now()),
    (v, '2.2', 'Förderbereich II — Bürgerschaftliches Engagement',
     'Darüber hinaus wird eine weitere gestaffelte Förderung gewährt: < 3.999 Std/Jahr oder ≤ 59 Ehrenamtliche → 1.250 €; ≥ 4.000 Std oder ≥ 60 EA → 2.000 €; ≥ 6.000 Std oder ≥ 90 EA → 3.500 €.',
     'staffel', 'kuratiert',
     'Wörtlich AHP 2025-03-27 Z. 220-223 (Tabelle).', now()),
    (v, '2.2', 'Förderbereich II — Bürgerschaftliches Engagement',
     'Die Zuordnung erfolgt stets in die höchstmögliche Kategorie, entweder den geleisteten Stunden oder der Anzahl der Ehrenamtlichen.',
     'verpflichtung', 'kuratiert',
     'Wörtlich AHP 2025-03-27 Z. 221-222.', now()),
    (v, '2.2', 'Förderbereich II — Bürgerschaftliches Engagement',
     'Maximale jährliche Fördersumme: 750 € + 3.500 € = 4.250 €.',
     'hoechstgrenze', 'kuratiert',
     'Abgeleitet aus AHP 2025 Z. 219-223.', now());

  -- Alle bisherigen 2.3-statements zu Seniorenkreisen verwerfen
  -- (im aktuellen Doctree gibt es nur section_path='2.3' ohne Untergliederung)
  update apl2.ahp_norm_statements
  set status = 'verworfen',
      kuratierungs_kommentar = coalesce(kuratierungs_kommentar, '') ||
        ' [Audit 2026-05-24: Sub-Seniorenkreise-Statements ggf. erfunden (12-24/25 Treffen). AHP-PDF Z. 257-260 nennt 10/20/46.]'
  where section_path = '2.3' and (statement ilike '%seniorenkreis%' or statement ilike '%12-24%' or statement ilike '%25 treffen%');

  -- Korrekte Seniorenkreise-Statements neu einfügen
  insert into apl2.ahp_norm_statements
    (doctree_version, section_path, section_title, statement, statement_type, status, kuratierungs_kommentar, kuratiert_am)
  values
    (v, '2.3', 'Förderbereich III — Pkt. 4 Seniorenkreise',
     'Seniorenkreise erhalten eine pauschale Förderung von bis zu 2.000 € pro Jahr.',
     'hoechstgrenze', 'kuratiert',
     'Wörtlich AHP 2025-03-27 Z. 257.', now()),
    (v, '2.3', 'Förderbereich III — Pkt. 4 Seniorenkreise',
     'Treffen-Staffel: ≥ 10 Treffen → 750 €; ≥ 20 Treffen → 1.250 €; ≥ 46 Treffen → 2.000 €.',
     'staffel', 'kuratiert',
     'Wörtlich AHP 2025-03-27 Z. 257-260 (Tabelle).', now()),
    (v, '2.3', 'Förderbereich III — Pkt. 4 Seniorenkreise',
     'Die Zahl der Teilnehmer:innen soll einer Gruppengröße von mindestens 6 Senior:innen entsprechen.',
     'pflichtfeld', 'kuratiert',
     'Wörtlich AHP 2025-03-27 Z. 258-259.', now());

  -- 7) Cap×Stadtbewohner-Anteil-Formel als kuratierte Verwaltungspraxis
  insert into apl2.ahp_norm_statements
    (doctree_version, section_path, section_title, statement, statement_type, status, kuratierungs_kommentar, kuratiert_am)
  values
    (v, '2.3', 'Förderbereich III — Pkt. 2 Begegnungszentren',
     'Verwaltungspraxis Sozialreferat Stadt Würzburg: Maximale Auszahlung = Förderhöchstgrenze × Stadtbewohner-Anteil. Beispiel: 10.000 € × 70 % = 7.000 € maximale Auszahlung.',
     'verpflichtung', 'kuratiert',
     'Kuratierte Auslegung 2026-05-24 (Robert Butscher bestätigt). AHP-PDF formuliert offen ("erfolgt die Auszahlung des prozentualen Anteils"); diese Formel ist die operative Umsetzung des Sozialreferats.', now());
end $$;

commit;

notify pgrst, 'reload schema';
