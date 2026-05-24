-- 056_anlage_1_storage_path.sql
--
-- UE0-Pipeline für Anlage 1 (Wochenplan) vervollständigen:
-- Bürger kann optional zusätzlich zur Haupt-PDF eine Anlage-1-PDF
-- (Wochenplan: Wochentag + Öffnungszeit + Angebot) hochladen.
-- Edge Function speichert beide PDFs separat im Bucket
-- `antragseingang-pdf`; n8n liest beide, der OCR-Workflow erkennt
-- anhand der Vorhandenseins von `anlage_1_storage_path` ob er den
-- zweiten Claude-Vision-Call (Wochenplan-Schema) ausführen soll.

begin;

alter table apl2.antrag_einreichung
  add column if not exists anlage_1_storage_path text null;

-- Längen-Sanity (Storage-Pfade sind kurz: YYYY/MM/<uuid>-anlage1.pdf ≈ 50 Zeichen)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'antrag_einreichung_anlage_1_path_len_check'
  ) then
    alter table apl2.antrag_einreichung
      add constraint antrag_einreichung_anlage_1_path_len_check
      check (anlage_1_storage_path is null or length(anlage_1_storage_path) <= 200);
  end if;
end $$;

comment on column apl2.antrag_einreichung.anlage_1_storage_path is
  'Optionaler Upload der Anlage 1 (Wochenplan) parallel zum Hauptantrag. '
  'Wenn gesetzt, lädt n8n auch dieses PDF und extrahiert Wochenplan-Einträge '
  '(apl2.oeffnungszeit) per zweitem Claude-Vision-Call.';

commit;

notify pgrst, 'reload schema';
