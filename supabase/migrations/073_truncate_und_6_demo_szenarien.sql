-- 073_truncate_und_6_demo_szenarien.sql
--
-- Demo-Reset für die THWS-Vorlesung. Löscht alle bisherigen Anträge
-- (inkl. Prüfungen, Bescheide, History via ON DELETE CASCADE) und legt
-- exakt 6 konsistente Szenarien an:
--
--   1. FB I    — DEMO-Caritas Quartier Heuchelhof          BEWILLIGEN
--   2. FB II   — DEMO-AWO Besuchsdienst                    BEWILLIGEN
--   3. FB I    — DEMO-Senioren-Stammtisch Sanderau         ABLEHNEN (§ 2.1 Träger)
--   4. FB III-C — DEMO-Seniorenkreis St. Adalbero          ABLEHNEN (§ 3.3 Frist)
--   5. FB III-D — DEMO-Quartiersmanagement Grombühl        ABLEHNEN (§ 4 Doppelförd.)
--   6. FB IV   — DEMO-Türkisch-Deutscher Seniorenbund      RÜCKFRAGE (§ 2.4 PDF fehlt)
--
-- Alle Anträge starten im Status 'eingegangen', ohne vorab erstellte
-- Bescheide oder Prüfungen — der Sachbearbeiter:in soll sie frisch
-- durch den Workflow laufen lassen.
--
-- Antragsnummern werden vom Trigger generate_antragsnummer (Migration 062)
-- gesetzt und folgen dem Schema APL-<jahr>-FB<x>-<KUERZEL>-<HEX>.
--
-- Konsistenz: jedes Pflichtfeld pro FB-Plugin (siehe pruefung/.../foerderbereiche/)
-- ist gesetzt, sodass die KI-Prüfung pro Antrag eine klare Empfehlung
-- ableiten kann. Ablehnungs-Gründe sind in einer einzigen, prüfbaren
-- Schema-Dimension verankert (Antragsdatum / Doppelförderung-Hinweis /
-- Träger-Bezeichnung).

begin;

-- ── 1) Tabula rasa ───────────────────────────────────────────────────────────
-- CASCADE räumt mit auf: fb_*-Detail, anlagen, antrag_history,
-- pruefprotokoll, pruefungen, manuelle_pruefung, bescheide.
-- (Kein RESTART IDENTITY — apl.antraege.id ist UUID, keine Sequence.)
truncate table apl.antraege cascade;


-- ── Case 1: FB I — DEMO-Caritas Quartier Heuchelhof — BEWILLIGEN ─────────────
with neu as (
  insert into apl.antraege (
    haushaltsjahr, foerderbereich,
    dachverband, einrichtung, ansprechpartner,
    strasse, hausnummer, plz, ort,
    telefon, email, homepage,
    bankname, iban, bic,
    status, submitted_at, submitted_language
  ) values (
    2026, 'I',
    'Caritasverband Würzburg-Stadt e.V.',
    'DEMO-Caritas Quartier Heuchelhof',
    'Maria Bauer',
    'Berner Straße', '14', '97084', 'Würzburg',
    '0931 38661-0', 'demo-fbi-001@caritas-wuerzburg.example',
    'https://www.caritas-wuerzburg.de',
    'Sparkasse Mainfranken', 'DE89370400440532013000', 'COBADEFFXXX',
    'eingegangen',
    '2026-03-15 09:24:00+01', 'de'
  ) returning id
)
insert into apl.fb_i_projekt (
  antrag_id, projekt_titel, laufzeit, stadtteil,
  personalkosten_euro, sachkosten_euro,
  drittmittel_jsonb, andere_mittel_jsonb
)
select id,
  'Nachbarschaftscafé Heuchelhof',
  '01.01.2026 – 31.12.2026',
  'Heuchelhof',
  18500.00, 4200.00,
  '[{"quelle":"Eigenanteil Caritas","summe":2000,"status":"zugesagt"}]'::jsonb,
  '[]'::jsonb
from neu;


-- ── Case 2: FB II — DEMO-AWO Besuchsdienst — BEWILLIGEN ─────────────────────
with neu as (
  insert into apl.antraege (
    haushaltsjahr, foerderbereich,
    dachverband, einrichtung, ansprechpartner,
    strasse, hausnummer, plz, ort,
    telefon, email,
    bankname, iban, bic,
    status, submitted_at, submitted_language
  ) values (
    2026, 'II',
    'AWO Kreisverband Würzburg-Stadt e.V.',
    'DEMO-AWO Besuchsdienst',
    'Klaus Reinhardt',
    'Kantstraße', '45', '97074', 'Würzburg',
    '0931 29380-0', 'demo-fbii-002@awo-wuerzburg.example',
    'Sparkasse Mainfranken', 'DE12500105170648489890', 'INGDDEFFXXX',
    'eingegangen',
    '2026-03-20 14:12:00+01', 'de'
  ) returning id
), kopf as (
  insert into apl.fb_ii_ehrenamt (
    antrag_id, ehrenamt_titel,
    anzahl_helfer_vorjahr, gesamt_helferstunden_vorjahr,
    direkter_kontakt_senioren
  )
  select id,
    'Ehrenamtlicher Besuchsdienst für isolierte Seniorinnen und Senioren',
    12, 1440, true
  from neu returning antrag_id
)
insert into apl.fb_ii_helfer (
  antrag_id, position, name, vorname, einsatzbereich,
  eintritt, stunden_monat, stunden_jahr
)
select antrag_id, p, n, v, b, e::date, sm, sj
from kopf, lateral (values
    ( 1, 'Müller',   'Anna',     'Hausbesuche Heuchelhof',  '2018-03-01', 10, 120),
    ( 2, 'Schmidt',  'Hans',     'Hausbesuche Heuchelhof',  '2019-01-15', 10, 120),
    ( 3, 'Lechner',  'Sabine',   'Demenzgruppe',            '2020-09-01', 10, 120),
    ( 4, 'Pavlović', 'Marija',   'Hausbesuche Sanderau',    '2021-04-12', 10, 120),
    ( 5, 'Yıldız',   'Mehmet',   'Türkische Senioren',      '2022-02-01', 10, 120),
    ( 6, 'Bauer',    'Renate',   'Hausbesuche Frauenland',  '2022-06-15', 10, 120),
    ( 7, 'Hofmann',  'Werner',   'Hausbesuche Grombühl',    '2023-01-10', 10, 120),
    ( 8, 'Weber',    'Christina','Demenzgruppe',            '2023-03-22', 10, 120),
    ( 9, 'Köhler',   'Gerhard',  'Hausbesuche Heuchelhof',  '2023-08-05', 10, 120),
    (10, 'Richter',  'Monika',   'Wohnbereich Süd',         '2024-02-12', 10, 120),
    (11, 'Schäfer',  'Thomas',   'Hausbesuche Sanderau',    '2024-09-01', 10, 120),
    (12, 'Wagner',   'Elke',     'Demenzgruppe',            '2025-01-08', 10, 120)
) as h(p, n, v, b, e, sm, sj);


-- ── Case 3: FB I — DEMO-Senioren-Stammtisch — ABLEHNEN (§ 2.1 Träger) ───────
-- Privatinitiative ohne Vereinsstatus → kein gemeinnütziger Träger.
-- Im einrichtung-Feld klar markiert; dachverband bewusst NULL.
with neu as (
  insert into apl.antraege (
    haushaltsjahr, foerderbereich,
    dachverband, einrichtung, ansprechpartner,
    strasse, hausnummer, plz, ort,
    telefon, email,
    bankname, iban, bic,
    status, submitted_at, submitted_language
  ) values (
    2026, 'I',
    null,
    'DEMO-Senioren-Stammtisch Sanderau (Privatinitiative)',
    'Klaus-Dieter Müller',
    'Sanderring', '8', '97070', 'Würzburg',
    '0931 55512-99', 'demo-fbi-003@privat.example',
    'Volksbank Raiffeisenbank', 'DE21790200760027913168', 'GENODEF1WUE',
    'eingegangen',
    '2026-03-28 17:55:00+01', 'de'
  ) returning id
)
insert into apl.fb_i_projekt (
  antrag_id, projekt_titel, laufzeit, stadtteil,
  personalkosten_euro, sachkosten_euro,
  drittmittel_jsonb, andere_mittel_jsonb
)
select id,
  'Wöchentlicher Senioren-Stammtisch im Café Sanderau',
  '01.01.2026 – 31.12.2026',
  'Sanderau',
  0.00, 1800.00,
  '[]'::jsonb,
  '[]'::jsonb
from neu;


-- ── Case 4: FB III-C — DEMO-Seniorenkreis St. Adalbero — ABLEHNEN (§ 3.3) ───
-- Antragsfrist war 1. April; eingereicht am 15.05.2026 → verfristet.
with neu as (
  insert into apl.antraege (
    haushaltsjahr, foerderbereich,
    dachverband, einrichtung, ansprechpartner,
    strasse, hausnummer, plz, ort,
    telefon, email,
    bankname, iban, bic,
    status, submitted_at, submitted_language
  ) values (
    2026, 'III',
    'Katholische Pfarrei St. Adalbero',
    'DEMO-Seniorenkreis St. Adalbero',
    'Pfarrer Michael Klein',
    'Friedrich-Ebert-Ring', '25', '97072', 'Würzburg',
    '0931 78403-0', 'demo-fbiii-004@pfarrei-st-adalbero.example',
    'LIGA Bank', 'DE74750903000002154780', 'GENODEF1M05',
    'eingegangen',
    '2026-05-15 11:08:00+02', 'de'
  ) returning id
)
insert into apl.fb_iii_variante (
  antrag_id, variante,
  c_treffen_schwelle, c_teilnehmer_durchschnitt,
  c_quartierstreffen_anzahl, c_quartier_kooperation,
  c_quartier_person_name
)
select id, 'C',
  '12', 18,
  4, true,
  'Pfr. Michael Klein'
from neu;


-- ── Case 5: FB III-D — DEMO-Quartiersmanagement Grombühl — ABLEHNEN (§ 4) ───
-- Hauptamtliche Person wird parallel über das Bayerische Quartiersbüro-
-- Programm gefördert → Doppelförderung. Perplexity-Externe-Validierung
-- soll das in der Demo eigenständig aufdecken.
-- Hinweis fürs LLM: der "Komplikations"-Sachverhalt wird im Anmerkung-
-- Feld der Variante D (d_ehrenamt_personen_jsonb) leicht erkennbar
-- gemacht, damit Layer-B die Doppelförderung auch ohne Perplexity finden
-- KANN (Sicherheits-Netz).
with neu as (
  insert into apl.antraege (
    haushaltsjahr, foerderbereich,
    dachverband, einrichtung, ansprechpartner,
    strasse, hausnummer, plz, ort,
    telefon, email, homepage,
    bankname, iban, bic,
    status, submitted_at, submitted_language
  ) values (
    2026, 'III',
    'Diakonisches Werk Würzburg e.V.',
    'DEMO-Quartiersmanagement Grombühl',
    'Peter Walz',
    'Grombühlstraße', '23', '97080', 'Würzburg',
    '0931 80487-0', 'demo-fbiii-005@diakonie-wuerzburg.example',
    'https://www.diakonie-wuerzburg.de',
    'Evangelische Bank', 'DE74520604100000091190', 'GENODEF1EK1',
    'eingegangen',
    '2026-03-25 10:32:00+01', 'de'
  ) returning id
)
insert into apl.fb_iii_variante (
  antrag_id, variante,
  d_hauptamt_name, d_hauptamt_stunden_woche, d_hauptamt_stunden_monat,
  d_ehrenamt_personen_jsonb
)
select id, 'D',
  'Sarah Weber', 19.5, 84.5,
  '[{"name":"Helga Brunner","stunden_monat":8},{"name":"Manfred Sailer","stunden_monat":6},{"hinweis":"Hauptamt Sarah Weber wird parallel ueber Bayerisches Quartiersbuero-Programm 2025/2026 finanziert (50 % Stelle)."}]'::jsonb
from neu;


-- ── Case 6: FB IV — DEMO-Türkisch-Deutscher Seniorenbund — RÜCKFRAGE ────────
-- Formloser Antrag, Kurzbeschreibung dünn, dokument_path leer
-- (Konzept-PDF nicht hochgeladen) → heilbar.
with neu as (
  insert into apl.antraege (
    haushaltsjahr, foerderbereich,
    dachverband, einrichtung, ansprechpartner,
    strasse, hausnummer, plz, ort,
    telefon, email,
    bankname, iban, bic,
    status, submitted_at, submitted_language
  ) values (
    2026, 'IV',
    null,
    'DEMO-Türkisch-Deutscher Seniorenbund Würzburg',
    'Ayşe Demir',
    'Sanderring', '14', '97070', 'Würzburg',
    '0931 12345-67', 'demo-fbiv-006@tds-wuerzburg.example',
    'Sparkasse Mainfranken', 'DE92790500000045132198', 'BYLADEM1SWU',
    'eingegangen',
    '2026-03-30 16:18:00+01', 'de'
  ) returning id
)
insert into apl.fb_iv_freitext (
  antrag_id, vorhaben_titel, kurzbeschreibung, dokument_path
)
select id,
  'Mehrsprachige Seniorenbegegnung 2026',
  'Interkulturelle Treffen für türkisch- und deutschsprachige Senioren, sprachlich vermittelt.',
  null
from neu;


-- ── Konsistenz-Check ────────────────────────────────────────────────────────
do $$
declare
  c integer;
begin
  select count(*) into c from apl.antraege;
  if c <> 6 then
    raise exception 'Demo-Migration inkonsistent: % Antrag(e) statt 6', c;
  end if;
end $$;


commit;
