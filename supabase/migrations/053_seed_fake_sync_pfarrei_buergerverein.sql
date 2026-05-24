-- 053_seed_fake_sync_pfarrei_buergerverein.sql
--
-- UE0-Audit Fix #6: Drift zwischen Fake_Belege/seed.sql (DB-Stand) und
-- ue0/demo-pdfs/generate.py (Demo-PDFs) für FAKE-001 PFARREI.
--
-- Quelle der Wahrheit (Robert-Entscheidung): ue0/demo-pdfs/generate.py.
-- Wenn jemand das Demo-PDF nach Pipeline-Run erneut hochlädt, soll der
-- OCR die GLEICHEN Felder finden, die vorher in der DB lagen. Sonst
-- entsteht ein abweichender Zweit-Antrag.
--
-- Drift: FAKE-001 IBAN 'DE24790500000301234567' (Sparkasse) + BIC
-- 'BYLADEM1SWU' → soll lt. Demo-PDF 'DE89370400440532013000' +
-- 'COBADEFFXXX' sein.
-- FAKE-002 war bereits konsistent (gleiche IBAN, gleicher BIC).
--
-- Defensive Sicherheit: nur FAKE-001 + FAKE-002 werden angefasst.
-- Andere Anträge bleiben unangetastet. Bei abweichenden Antragsnummern
-- macht der Block schlicht nichts.

begin;

do $$
declare
  v_pfarrei uuid;
  v_buerger uuid;
begin
  -- FAKE-001 PFARREI — Bank-Daten auf Demo-PDF synchronisieren
  select id into v_pfarrei
    from apl2.antraege
   where antragsnummer = 'APL2-2026-FAKE-001';

  if v_pfarrei is not null then
    update apl2.antraege
       set bankverbindung = 'Sparkasse Mainfranken Würzburg',
           iban           = 'DE89370400440532013000',
           bic            = 'COBADEFFXXX'
     where id = v_pfarrei;
    raise notice 'FAKE-001 PFARREI: IBAN/BIC auf Demo-PDF synchronisiert.';
  else
    raise notice 'FAKE-001 nicht vorhanden — Sync übersprungen.';
  end if;

  -- FAKE-002 BUERGERVEREIN — defensiv mit gleichen Werten überschreiben
  -- (no-op falls bereits korrekt, schadet aber nichts).
  select id into v_buerger
    from apl2.antraege
   where antragsnummer = 'APL2-2026-FAKE-002';

  if v_buerger is not null then
    update apl2.antraege
       set bankverbindung = 'VR-Bank Würzburg',
           iban           = 'DE87790900000010101010',
           bic            = 'GENODEF1WU1'
     where id = v_buerger;
    raise notice 'FAKE-002 BUERGERVEREIN: Bank-Felder defensiv synchronisiert.';
  else
    raise notice 'FAKE-002 nicht vorhanden — Sync übersprungen.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
