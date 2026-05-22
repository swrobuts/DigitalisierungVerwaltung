-- Fake_Belege/seed.sql — 6 Antrag-Pakete für UE3-Prüfungs-Test.
-- Generiert von Fake_Belege/generate.py — NICHT händisch editieren.
-- Vorgehen: gegen apl2-Schema einspielen (truncate ist Voraussetzung).

BEGIN;

SET search_path TO apl2, public;

-- antraege
INSERT INTO antraege (id, antragsnummer, haushaltsjahr, name, traeger, strasse, hausnummer, plz, ort, bankverbindung, iban, bic, ansprechpartner, telefon, email, raeume_vorhanden, raeume_unentgeltlich, antragsdatum, geforderte_foerdersumme_euro, submitted_language, status) VALUES ('a1111111-1111-1111-1111-111111111111', 'APL2-2026-FAKE-001', 2026, 'Seniorentreff St. Albert', 'Katholische Kirchenstiftung St. Albert', 'Sieboldstraße', '14', '97082', 'Würzburg', 'Sparkasse Mainfranken Würzburg', 'DE24790500000301234567', 'BYLADEM1SWU', 'Pfarrer Michael KleinTest', '0931 78403-0', 'seniorentreff@pfarrei-st-albert.de', 'ja', 'nein', '2026-03-15', 8500.0, 'de', 'eingegangen');
INSERT INTO antraege (id, antragsnummer, haushaltsjahr, name, traeger, strasse, hausnummer, plz, ort, bankverbindung, iban, bic, ansprechpartner, telefon, email, raeume_vorhanden, raeume_unentgeltlich, antragsdatum, geforderte_foerdersumme_euro, submitted_language, status) VALUES ('a2222222-2222-2222-2222-222222222222', 'APL2-2026-FAKE-002', 2026, 'Senioren-Stammtisch Frauenland', 'Bürgerverein Frauenland e.V.', 'Rottendorfer Straße', '56', '97074', 'Würzburg', 'VR-Bank Würzburg', 'DE87790900000010101010', 'GENODEF1WU1', 'Dr. Helga MertensTest (1. Vorsitzende)', '0931 70402-12', 'vorstand@buergerverein-frauenland.de', 'ja', 'ja', '2026-03-22', 4200.0, 'de', 'eingegangen');
INSERT INTO antraege (id, antragsnummer, haushaltsjahr, name, traeger, strasse, hausnummer, plz, ort, bankverbindung, iban, bic, ansprechpartner, telefon, email, raeume_vorhanden, raeume_unentgeltlich, antragsdatum, geforderte_foerdersumme_euro, submitted_language, status) VALUES ('a3333333-3333-3333-3333-333333333333', 'APL2-2026-FAKE-003', 2026, 'AWO-Begegnungsstätte Heidingsfeld', 'Arbeiterwohlfahrt Kreisverband Würzburg e.V.', 'Klingenstraße', '11', '97084', 'Würzburg', 'Sparkasse Mainfranken Würzburg', 'DE41790500000102030401', 'BYLADEM1SWU', 'Frau Beate KornTest (Einrichtungsleitung)', '0931 88044-23', 'heidingsfeld@awo-wuerzburg.de', 'ja', 'nein', '2026-03-25', 9800.0, 'de', 'eingegangen');
INSERT INTO antraege (id, antragsnummer, haushaltsjahr, name, traeger, strasse, hausnummer, plz, ort, bankverbindung, iban, bic, ansprechpartner, telefon, email, raeume_vorhanden, raeume_unentgeltlich, antragsdatum, geforderte_foerdersumme_euro, submitted_language, status) VALUES ('a4444444-4444-4444-4444-444444444444', 'APL2-2026-FAKE-004', 2026, 'Caritas-Tagestreff Versbach', 'Caritasverband für die Stadt und den Landkreis Würzburg e.V.', 'Versbacher Straße', '142', '97078', 'Würzburg', 'LIGA Bank Regensburg', 'DE10750903000002400500', 'GENODEF1M05', 'Herr Stefan ReiserTest', '0931 38664-50', 'versbach@caritas-wuerzburg.org', 'ja', 'nein', '2026-03-20', 12500.0, 'de', 'eingegangen');
INSERT INTO antraege (id, antragsnummer, haushaltsjahr, name, traeger, strasse, hausnummer, plz, ort, bankverbindung, iban, bic, ansprechpartner, telefon, email, raeume_vorhanden, raeume_unentgeltlich, antragsdatum, geforderte_foerdersumme_euro, submitted_language, status) VALUES ('a5555555-5555-5555-5555-555555555555', 'APL2-2026-FAKE-005', 2026, 'Diakonie-Treff Sanderau', 'Diakonisches Werk Würzburg e.V.', 'Wittelsbacherstraße', '9', '97072', 'Würzburg', 'Evangelische Bank eG', 'DE45520604500001234567', 'GENODEF1EK1', 'Diakonin Anja VogtDemo', '0931 80498-17', 'sanderau@diakonie-wuerzburg.de', 'ja', 'nein', '2026-03-18', 7500.0, 'de', 'eingegangen');
INSERT INTO antraege (id, antragsnummer, haushaltsjahr, name, traeger, strasse, hausnummer, plz, ort, bankverbindung, iban, bic, ansprechpartner, telefon, email, raeume_vorhanden, raeume_unentgeltlich, antragsdatum, geforderte_foerdersumme_euro, submitted_language, status) VALUES ('a6666666-6666-6666-6666-666666666666', 'APL2-2026-FAKE-006', 2026, 'Senioren-aktiv Treffpunkt Würzburg', 'Senioren-aktiv GmbH', 'Nordstraße', '12', '90439', 'Nürnberg', 'Commerzbank Nürnberg (Geschäftskonto)', 'DE78790400470099887761', 'COBADEFFXXX', 'Klaus MüllerTest (Geschäftsführer)', '0911 99887-66', 'k.mueller@senioren-aktiv-gmbh.de', 'ja', 'nein', '2026-04-15', 15000.0, 'de', 'eingegangen');

-- belegposition
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a1111111-1111-1111-1111-111111111111', 'miete', 'Miete Pfarrsaal St. Albert (12 Monate à 850 €)', 10200.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a1111111-1111-1111-1111-111111111111', 'personalkosten', 'Sozialpädagogin Frau Sabine HofmannTest (Teilzeit 12h/Woche)', 18400.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a1111111-1111-1111-1111-111111111111', 'betriebskosten', 'Strom, Heizung, Wasser anteilig', 3800.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a1111111-1111-1111-1111-111111111111', 'betriebskosten', 'Versicherung, Reinigungsmaterial, Kaffee/Tee', 1200.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a2222222-2222-2222-2222-222222222222', 'personalkosten', 'Honorar Kursleitung Gedächtnistraining (Frau EichingerTest)', 4800.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a2222222-2222-2222-2222-222222222222', 'personalkosten', 'Honorar Bewegungsangebot (Herr SchäferTest, ÜL-B Sport)', 5400.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a2222222-2222-2222-2222-222222222222', 'betriebskosten', 'Verbrauchsmaterial, Getränke, Bastel-/Spielmaterial', 1600.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a2222222-2222-2222-2222-222222222222', 'betriebskosten', 'Anteilige Reinigung (Eigenleistung Verein)', 800.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a3333333-3333-3333-3333-333333333333', 'miete', 'Kaltmiete 12 × 620 €', 7440.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a3333333-3333-3333-3333-333333333333', 'personalkosten', 'Fachkraft soziale Arbeit (Teilzeit 18h/Woche)', 26800.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a3333333-3333-3333-3333-333333333333', 'betriebskosten', 'Nebenkosten Heizung/Strom/Wasser (Vorauszahlung)', 3120.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a3333333-3333-3333-3333-333333333333', 'betriebskosten', 'Versicherung, Telekom, Hygiene', 980.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a4444444-4444-4444-4444-444444444444', 'miete', 'Raumpauschale 12 × 380 €', 4560.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a4444444-4444-4444-4444-444444444444', 'personalkosten', 'Einrichtungsleitung Vollzeit (Diplom-Sozialpädagogin)', 58000.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a4444444-4444-4444-4444-444444444444', 'personalkosten', 'Hauswirtschafterin Teilzeit + Springer', 20000.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a4444444-4444-4444-4444-444444444444', 'betriebskosten', 'Nebenkosten, Material, Versicherung', 2400.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a5555555-5555-5555-5555-555555555555', 'miete', 'Miete Gemeindezentrum 12 × 540 €', 6480.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a5555555-5555-5555-5555-555555555555', 'personalkosten', 'Diakonin (Teilzeit 15 h/Woche)', 22500.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a5555555-5555-5555-5555-555555555555', 'betriebskosten', 'Nebenkosten, Versicherung', 3200.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a6666666-6666-6666-6666-666666666666', 'miete', 'Geschäftsmiete 12 × 1.850 € (Vermieter: MüllerTest Immobilien)', 22200.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a6666666-6666-6666-6666-666666666666', 'personalkosten', 'Geschäftsführer-Bezug (Klaus MüllerTest)', 24000.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a6666666-6666-6666-6666-666666666666', 'personalkosten', 'Beratungshonorar K. MüllerTest Consulting', 24000.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a6666666-6666-6666-6666-666666666666', 'personalkosten', 'Aushilfen-Pauschalen (5 Personen á 4.800 €)', 24000.0);
INSERT INTO belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro) VALUES ('a6666666-6666-6666-6666-666666666666', 'betriebskosten', 'EDV-Lizenzen / SAP-Beratung MüllerTest Consulting', 6000.0);

-- oeffnungszeit
INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ('a1111111-1111-1111-1111-111111111111', 'mo', '14:00 – 17:00', 'Offener Treff, Kaffee');
INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ('a1111111-1111-1111-1111-111111111111', 'mi', '14:00 – 17:00', 'Spielenachmittag, Skat / Rommé');
INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ('a1111111-1111-1111-1111-111111111111', 'fr', '14:00 – 17:00', 'Seniorengymnastik mit Frau EberleinTest');
INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ('a2222222-2222-2222-2222-222222222222', 'di', '13:30 – 16:30', 'Offener Treff + Gedächtnistraining (14-tägig)');
INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ('a2222222-2222-2222-2222-222222222222', 'do', '13:30 – 16:30', 'Bewegungsangebot + Café');
INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ('a2222222-2222-2222-2222-222222222222', 'sa', '10:00 – 12:00', 'Frühstückstreff (1. Sa/Monat)');
INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ('a3333333-3333-3333-3333-333333333333', 'mo', '10:00 – 16:00', 'Mittagstisch + offener Treff');
INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ('a3333333-3333-3333-3333-333333333333', 'mi', '10:00 – 16:00', 'Mittagstisch + Beratung');
INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ('a3333333-3333-3333-3333-333333333333', 'do', '13:00 – 17:00', 'Themen-Café');
INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ('a3333333-3333-3333-3333-333333333333', 'fr', '10:00 – 14:00', 'Mittagstisch');
INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ('a4444444-4444-4444-4444-444444444444', 'mi', '14:00 – 16:00', 'Offener Treff');
INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ('a5555555-5555-5555-5555-555555555555', 'mo', '14:00 – 17:00', 'Offener Treff, Café');
INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ('a5555555-5555-5555-5555-555555555555', 'mi', '18:30 – 21:30', 'Bingo-Abend mit Geldgewinnen');
INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ('a5555555-5555-5555-5555-555555555555', 'fr', '14:00 – 17:00', 'Tupperware-Vorstellung / Verkaufsnachmittag (monatlich)');
INSERT INTO oeffnungszeit (antrag_id, wochentag, oeffnungszeit, angebot) VALUES ('a6666666-6666-6666-6666-666666666666', 'do', '14:00 – 16:00', 'Info-Veranstaltung Kapitalanlagen 50+');

COMMIT;
