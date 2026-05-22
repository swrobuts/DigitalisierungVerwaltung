-- 024_ontologie_rules_ahp_konform.sql
--
-- Ersetzt die in Migration 020 gepflanzten Regeln durch AUSSCHLIESSLICH aus
-- der AHP-Förderrichtlinie 2025-03-27 abgeleitete Regeln. Die alten Regeln
-- (miete_xor_unentgeltlich, plausible_personalkosten, wochenplan_min_1_tag,
-- haushaltsjahr_in_range) waren willkürlich gewählt — Schwellwerte und
-- paragraph_refs hatten KEINEN Beleg in der Richtlinie und genügten damit
-- nicht der rechtsbasierten Begründungspflicht.
--
-- Alle neuen paragraph_ref-Werte verweisen auf die echten Kapitel der AHP
-- 2025-03-27 (gespiegelt im apl2.ahp_doctree-Snapshot version='2025-03-27').
-- Quelle pro Regel im inline-Kommentar.

-- ── Alte Regeln entfernen ──────────────────────────────────────────────
delete from apl2.ontologie_rules
where plan_id = 'APL2'
  and rule_name in (
    'miete_xor_unentgeltlich',
    'plausible_personalkosten',
    'wochenplan_min_1_tag',
    'haushaltsjahr_in_range'
  );

-- mindestens_eine_kostenposition wird beibehalten, aber paragraph_ref + Beschreibung
-- werden auf die echte AHP-Stelle (Kap. 2.4 + Kap. 3.2 b) ausgerichtet.
update apl2.ontologie_rules
set
  beschreibung = 'AHP Kap. 2.4 (Förderbereich IV): "Finanzierungsplanung, die alle geplanten Ausgaben und Einnahmen der geförderten Maßnahme umfasst, vorzulegen". Mindestens eine Kostenposition muss damit angegeben sein.',
  paragraph_ref = 'AHP 2.4 Förderbereich IV / 3.2 b) Antragstellung'
where plan_id = 'APL2' and rule_name = 'mindestens_eine_kostenposition';

-- ── Neue AHP-konforme Regeln ───────────────────────────────────────────

insert into apl2.ontologie_rules (plan_id, rule_name, beschreibung, condition_jsonb, fehler_msg_de, schwere, paragraph_ref) values

-- Träger-Sitz muss in der Stadt Würzburg liegen.
-- AHP 3.1 Antragsberechtigt: "Verbände, Gruppen und Initiativen der
--   Seniorenarbeit (...) mit Sitz in der Stadt Würzburg."
-- Prüfung kombiniert: (a) PLZ-Range Würzburger Stadtgebiet 97070-97084
-- (Quelle: Postdienst-Verzeichnis Stadt Würzburg) UND (b) Ort = 'Würzburg'.
-- Die DB hält PLZ als Text mit Regex ^[0-9]{5}$ — wir verwenden numerische
-- Konversion via JSON-Logic. Wenn DB-Datentyp text bleibt, prüfen wir Range
-- per String-Vergleich (lexikographisch funktioniert für 5-stellige PLZ).
('APL2', 'traeger_sitz_wuerzburg',
  'AHP Kap. 3.1: Antragsberechtigt sind nur Träger mit Sitz in der Stadt Würzburg. Geprüft wird PLZ-Range 97070-97084 UND Ort=Würzburg.',
  '{"and":[
    {">=":[{"var":"plz"},"97070"]},
    {"<=":[{"var":"plz"},"97084"]},
    {"in":[{"var":"ort"},["Würzburg","Wuerzburg","WÜRZBURG","WUERZBURG"]]}
  ]}',
  'Träger-Sitz liegt nicht in der Stadt Würzburg (AHP 3.1 verlangt Sitz im Stadtgebiet, PLZ 97070-97084).',
  'verstoss',
  'AHP 3.1 Antragsberechtigt'
),

-- Antragsfrist 1. April des Antragsjahres.
-- AHP 3.3 Antragsfristen: "Die Anträge müssen grundsätzlich bis zum
--   1. April des Antragsjahres vorliegen. Anträge die zu spät eingereicht
--   werden, gelten als verfristet und werden grundsätzlich abgelehnt."
-- JSON-Logic prüft: antragsdatum <= haushaltsjahr-04-01.
-- Implementierung: wir setzen den Vergleich in Python um (in
-- layer_b_ontologie:derive_facts wird antragsfrist_eingehalten als bool
-- abgeleitet), die Regel prüft nur das vorabgeleitete Feld.
('APL2', 'antragsfrist_1_april',
  'AHP Kap. 3.3: Anträge müssen bis zum 1. April des Antragsjahres eingegangen sein, sonst gelten sie als verfristet und werden grundsätzlich abgelehnt.',
  '{"==":[{"var":"antragsfrist_eingehalten"},true]}',
  'Antrag ist verfristet — Eingangsdatum liegt nach dem 1. April des Antragsjahres (AHP 3.3).',
  'verstoss',
  'AHP 3.3 Antragsfristen'
),

-- Auszahlungs-Konto = Konto des Antragsberechtigten.
-- AHP 3.6 Auszahlung: "Zuschüsse werden ausschließlich auf Konten von
--   Antragsberechtigten überwiesen."
-- Die IBAN-Inhaberschaft ist maschinell nicht prüfbar — daher als HINWEIS,
-- der den Sachbearbeiter zur manuellen Prüfung auffordert. Bedingung false
-- bewirkt: feuert immer (always-fire-Pattern).
('APL2', 'iban_auf_traegerkonto_pruefen',
  'AHP Kap. 3.6: Auszahlungen erfolgen ausschließlich auf Konten von Antragsberechtigten. Maschinelle Inhaber-Verifikation der IBAN ist nicht möglich, daher manueller Hinweis.',
  '{"==":[1,2]}',
  'IBAN-Inhaberschaft bitte manuell prüfen — Auszahlung darf laut AHP 3.6 nur auf Konten des Antragsberechtigten erfolgen.',
  'hinweis',
  'AHP 3.6 Auszahlung des Zuschusses'
),

-- Plausibilität Haushaltsjahr = Kalenderjahr.
-- AHP 3.7 Rechnungslegung: "Das Rechnungsjahr läuft vom 1. Januar bis
--   31. Dezember." Wir prüfen, dass das angegebene Haushaltsjahr ein
--   realistisches Kalenderjahr ist (nicht zu weit in Vergangenheit oder Zukunft).
-- Bewusst weit gehaltene Range (5 Jahre rückwirkend, 2 Jahre prospektiv) —
-- das ist KEINE harte AHP-Vorgabe, sondern Plausibilitätsschutz vor offen-
-- sichtlichen Tippfehlern (z.B. Antrag für 1926 oder 9999).
('APL2', 'haushaltsjahr_plausibel',
  'Plausibilitätsschutz: Haushaltsjahr ist ein Kalenderjahr (AHP 3.7 Rechnungslegung) und sollte sich auf eine bearbeitbare Periode beziehen.',
  '{"and":[
    {">=":[{"var":"haushaltsjahr"},2021]},
    {"<=":[{"var":"haushaltsjahr"},2028]}
  ]}',
  'Haushaltsjahr außerhalb des plausiblen Bereichs (erwartet 2021-2028).',
  'hinweis',
  'AHP 3.7 Rechnungslegung'
);

notify pgrst, 'reload schema';
