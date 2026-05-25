-- 067_apl_demo_antraege.sql
--
-- 6 realitätsnahe Demo-Anträge im neuen apl-Schema, einer pro Förderbereich
-- plus eine zweite FB III-Variante und ein „Schwierig-Fall" für UE2/UE3-Demos.
--
-- Alle Anträge sind als DEMO erkennbar (Träger-Name beginnt mit „DEMO-"),
-- damit sie sich von echten Anträgen unterscheiden lassen und der
-- Demo-Reset-Job sie eindeutig löschen kann.
--
-- Antragsnummern werden vom Trigger generate_antragsnummer (Migration 062)
-- gesetzt und folgen dem Schema APL-<jahr>-FB<x>-<KUERZEL>-<HEX>.

begin;

-- ── FB I — Aufbau niedrigschwelliger Angebote ──────────────────────────────
with neu as (
  insert into apl.antraege (
    haushaltsjahr, foerderbereich,
    dachverband, einrichtung, ansprechpartner,
    strasse, hausnummer, plz, ort,
    telefon, email, homepage,
    bankname, iban, bic,
    status, submitted_language
  ) values (
    2026, 'I',
    'Caritasverband Würzburg', 'DEMO-Caritas Quartier Heuchelhof', 'Maria Bauer',
    'Berner Straße', '14', '97084', 'Würzburg',
    '0931 38661-0', 'demo-fbi@caritas-wuerzburg.example', 'https://www.caritas-wuerzburg.de',
    'Sparkasse Mainfranken', 'DE89370400440532013000', 'COBADEFFXXX',
    'eingegangen', 'de'
  ) returning id
)
insert into apl.fb_i_projekt (antrag_id, projekt_titel, laufzeit, stadtteil,
                              personalkosten_euro, sachkosten_euro,
                              drittmittel_jsonb)
select id, 'Nachbarschaftscafé Heuchelhof', '01.01.2026 – 31.12.2026', 'Heuchelhof',
       18500.00, 4200.00,
       '[{"quelle":"Aktion Mensch","summe":5000,"status":"zugesagt"}]'::jsonb
from neu;

-- ── FB II — Bürgerschaftliches Engagement (Helferliste!) ──────────────────
with neu as (
  insert into apl.antraege (
    haushaltsjahr, foerderbereich,
    dachverband, einrichtung, ansprechpartner,
    strasse, hausnummer, plz, ort,
    telefon, email,
    bankname, iban, bic,
    status, submitted_language
  ) values (
    2026, 'II',
    'AWO Kreisverband Würzburg', 'DEMO-AWO Besuchsdienst', 'Klaus Reinhardt',
    'Kantstraße', '45', '97074', 'Würzburg',
    '0931 29380-0', 'demo-fbii@awo-wuerzburg.example',
    'Sparkasse Mainfranken', 'DE12500105170648489890', 'INGDDEFFXXX',
    'in_pruefung', 'de'
  ) returning id
), kopf as (
  insert into apl.fb_ii_ehrenamt (antrag_id, ehrenamt_titel,
                                  anzahl_helfer_vorjahr, gesamt_helferstunden_vorjahr,
                                  direkter_kontakt_senioren)
  select id, 'Ehrenamtlicher Besuchsdienst für isolierte Seniorinnen',
         18, 2640, true from neu returning antrag_id
)
insert into apl.fb_ii_helfer (antrag_id, position, name, vorname, einsatzbereich,
                              eintritt, stunden_monat, stunden_jahr)
select antrag_id, p, n, v, b, e::date, sm, sj from kopf, lateral (
  values
    (1, 'Müller',   'Anna',     'Wohnbereich Süd',   '2018-03-01', 12, 144),
    (2, 'Schmidt',  'Hans',     'Wohnbereich Nord',  '2019-01-15', 14, 168),
    (3, 'Lechner',  'Sabine',   'Demenzgruppe',      '2020-09-01', 10, 120),
    (4, 'Pavlović', 'Marija',   'Wohnbereich Süd',   '2021-04-12', 15, 180),
    (5, 'Yıldız',   'Mehmet',   'Türkische Senioren','2022-02-01', 18, 216)
) as h(p, n, v, b, e, sm, sj);

-- ── FB III Variante A — Mehrgenerationenhaus ──────────────────────────────
with neu as (
  insert into apl.antraege (
    haushaltsjahr, foerderbereich,
    einrichtung, ansprechpartner,
    strasse, hausnummer, plz, ort,
    telefon, email, homepage,
    bankname, iban, bic,
    status, submitted_language
  ) values (
    2026, 'III',
    'DEMO-Mehrgenerationenhaus Lindleinsmühle', 'Dr. Birgit Hofmann',
    'Versbacher Straße', '208', '97078', 'Würzburg',
    '0931 88066-12', 'demo-fbiii-a@mgh-lindleinsmuehle.example',
    'https://www.mgh-lindleinsmuehle.de',
    'Sparkasse Mainfranken', 'DE91100110012626361156', 'NTSBDEB1XXX',
    'eingegangen', 'de'
  ) returning id
)
insert into apl.fb_iii_variante (antrag_id, variante, a_anmerkung)
select id, 'A', 'Bundesprogramm-Förderbescheid 2026 liegt bei (siehe Anlage 1).'
from neu;

-- ── FB III Variante C — Seniorenkreis, Treffen-Staffel ────────────────────
with neu as (
  insert into apl.antraege (
    haushaltsjahr, foerderbereich,
    dachverband, einrichtung, ansprechpartner,
    strasse, hausnummer, plz, ort,
    telefon, email,
    bankname, iban, bic,
    status, submitted_language
  ) values (
    2026, 'III',
    'Pfarrei St. Adalbero', 'DEMO-Seniorenkreis St. Adalbero', 'Renate Friedrich',
    'Wittelsbacherstraße', '5', '97074', 'Würzburg',
    '0931 70522-0', 'demo-fbiii-c@adalbero.example',
    'Liga Bank', 'DE76750903000000123456', 'GENODEF1M05',
    'eingegangen', 'de'
  ) returning id
)
insert into apl.fb_iii_variante (
  antrag_id, variante,
  c_treffen_schwelle, c_teilnehmer_durchschnitt,
  c_quartierstreffen_anzahl, c_quartier_kooperation, c_quartier_person_name
)
select id, 'C',
       'GT_20'::apl.treffen_schwelle_enum, 22,
       4, 'Quartier Sanderau', 'Renate Friedrich'
from neu;

-- ── FB III Variante D — Quartiersmanagement ───────────────────────────────
with neu as (
  insert into apl.antraege (
    haushaltsjahr, foerderbereich,
    dachverband, einrichtung, ansprechpartner,
    strasse, hausnummer, plz, ort,
    telefon, email, homepage,
    bankname, iban, bic,
    status, submitted_language
  ) values (
    2026, 'III',
    'Diakonisches Werk Würzburg', 'DEMO-Quartiersmanagement Grombühl', 'Peter Walz',
    'Grombühlstraße', '23', '97080', 'Würzburg',
    '0931 80487-0', 'demo-fbiii-d@diakonie-wuerzburg.example',
    'https://www.diakonie-wuerzburg.de',
    'Evangelische Bank', 'DE74520604100000091190', 'GENODEF1EK1',
    'rueckfrage', 'de'
  ) returning id
)
insert into apl.fb_iii_variante (
  antrag_id, variante,
  d_hauptamt_name, d_hauptamt_stunden_woche, d_hauptamt_stunden_monat
)
select id, 'D', 'Sarah Weber', 19.5, 84.5
from neu;

-- ── FB IV — Strukturförderung (Freitext, „schwieriger" Demo-Fall) ─────────
with neu as (
  insert into apl.antraege (
    haushaltsjahr, foerderbereich,
    einrichtung, ansprechpartner,
    strasse, hausnummer, plz, ort,
    telefon, email,
    bankname, iban, bic,
    status, submitted_language
  ) values (
    2026, 'IV',
    'DEMO-Türkisch-Deutscher Seniorenbund e.V.', 'Ayşe Kara',
    'Sanderstraße', '17', '97072', 'Würzburg',
    '0931 4528732', 'demo-fbiv@tdsb.example',
    'Türkiye İş Bankası AG', 'DE15512308000160017832', 'ISBKDEFXXXX',
    'in_pruefung', 'tr'
  ) returning id
)
insert into apl.fb_iv_freitext (antrag_id, vorhaben_titel, kurzbeschreibung,
                                 geplante_massnahmen, beantragte_summe_euro,
                                 laufzeit)
select id,
  'Interkulturelle Pflegelotsen für türkischsprachige Senior:innen',
  'Aufbau eines mehrsprachigen Lotsen-Netzwerks zur Orientierung in der Würzburger Altenhilfe für türkischsprachige Familien.',
  '5 ehrenamtliche Lotsen schulen, monatliche Sprechstunden in 3 Stadtteilen, türkisch/deutsche Informationsmaterialien, Vernetzung mit AWO Besuchsdienst.',
  9800.00, '01.04.2026 – 31.03.2027'
from neu;

-- ── Verifikation ──────────────────────────────────────────────────────────
do $$
declare
  cnt_antraege int;
  cnt_fbi int;
  cnt_fbii int;
  cnt_fbii_helfer int;
  cnt_fbiii int;
  cnt_fbiv int;
begin
  select count(*) into cnt_antraege from apl.antraege where einrichtung like 'DEMO-%';
  select count(*) into cnt_fbi  from apl.fb_i_projekt;
  select count(*) into cnt_fbii from apl.fb_ii_ehrenamt;
  select count(*) into cnt_fbii_helfer from apl.fb_ii_helfer;
  select count(*) into cnt_fbiii from apl.fb_iii_variante;
  select count(*) into cnt_fbiv from apl.fb_iv_freitext;

  if cnt_antraege <> 6 then raise exception 'Migration 067 — erwartete 6 DEMO-Anträge, fand %', cnt_antraege; end if;
  if cnt_fbi <> 1  then raise exception 'Migration 067 — FB I count: erwartet 1, fand %', cnt_fbi; end if;
  if cnt_fbii <> 1 then raise exception 'Migration 067 — FB II count: erwartet 1, fand %', cnt_fbii; end if;
  if cnt_fbii_helfer <> 5 then raise exception 'Migration 067 — Helferliste count: erwartet 5, fand %', cnt_fbii_helfer; end if;
  if cnt_fbiii <> 3 then raise exception 'Migration 067 — FB III count: erwartet 3 (A,C,D), fand %', cnt_fbiii; end if;
  if cnt_fbiv <> 1  then raise exception 'Migration 067 — FB IV count: erwartet 1, fand %', cnt_fbiv; end if;

  raise notice 'Migration 067 OK — 6 Demo-Anträge angelegt (FB I:1, FB II:1+5 Helfer, FB III:3, FB IV:1).';
end $$;

commit;

notify pgrst, 'reload schema';
