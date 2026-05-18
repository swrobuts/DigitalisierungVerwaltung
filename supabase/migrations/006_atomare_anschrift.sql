-- 006_atomare_anschrift.sql — anschrift Freitext → 4 atomare Felder
-- Vorbedingung: apl2.antraege ist LEER (sonst Migration anpassen mit Backfill).

\set ON_ERROR_STOP on

-- 1) Hard-stop wenn Tabelle nicht leer (Sicherheitsnetz)
do $$
declare cnt int;
begin
  select count(*) into cnt from apl2.antraege;
  if cnt > 0 then
    raise exception 'apl2.antraege hat % Rows — Migration braucht Backfill-Logik', cnt;
  end if;
end $$;

-- 2) Neue Spalten (nullable für saubere Migration auch in Cloud-Studio-Setup)
alter table apl2.antraege
  add column if not exists strasse    text,
  add column if not exists hausnummer text,
  add column if not exists plz        text,
  add column if not exists ort        text;

-- 3) PLZ-Check (5 Ziffern, idempotent via drop & create)
alter table apl2.antraege drop constraint if exists antraege_plz_check;
alter table apl2.antraege add constraint antraege_plz_check check (plz is null or plz ~ '^[0-9]{5}$');

-- 4) NOT NULL setzen (sicher, weil Tabelle leer)
alter table apl2.antraege alter column strasse    set not null;
alter table apl2.antraege alter column hausnummer set not null;
alter table apl2.antraege alter column plz        set not null;
alter table apl2.antraege alter column ort        set not null;

-- 5) Alte Spalte droppen
alter table apl2.antraege drop column if exists anschrift;

-- 6) PostgREST Schema-Reload
notify pgrst, 'reload schema';
