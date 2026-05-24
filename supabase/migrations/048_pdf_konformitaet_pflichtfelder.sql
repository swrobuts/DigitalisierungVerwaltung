-- 048_pdf_konformitaet_pflichtfelder.sql
--
-- Hintergrund: Audit 2026-05-24 (UE1-Webform vs. Original-PDF APL 2).
-- Das amtliche Antrags-PDF der Stadt Würzburg ("Altenhilfeplan APL 2")
-- fragt Pflichtfelder ab, die in den Migrationen 044 (raeume_*) und
-- 045 (telefon, bankverbindung) auf NULL erlaubt geweicht wurden,
-- weil das UE1-Webform zwischenzeitlich abgespeckt wurde.
--
-- Robert hat per Audit-Antwort entschieden: PDF ist Quelle der Wahrheit
-- (Voll-Sync). Damit müssen die Spalten wieder NOT NULL werden, und
-- das Webform muss sie wieder pflichtig abfragen.
--
-- Vorab-Audit (per psql, 2026-05-24):
--   antraege gesamt = 5
--   mit NULL in telefon / bankverbindung / raeume_vorhanden /
--   raeume_unentgeltlich = jeweils 0
-- → kein Backfill nötig, SET NOT NULL kollisionsfrei.
--
-- Hinweis zu Kosten-Spalten (Betriebskosten/Personalkosten/Miete):
--   diese existieren seit Migration 016 nicht mehr direkt in
--   apl2.antraege, sondern in apl2.belegposition. Webform muss
--   belegposition-Einträge erzeugen, View antrag_mit_summen liefert
--   die Aggregate. Keine Schemaänderung hier.
--
-- Hinweis zu Mietvertrag (PDF: „Kopie Mietvertrag"):
--   AHP 3.8 sagt „Belege nur auf Anfrage". PDF erwähnt den Mietvertrag
--   als Hinweis, nicht als zwingenden Pflicht-Beleg. → bleibt optional,
--   keine neue Spalte/Bucket nötig.

begin;

-- Sicherheitsgurt: vor SET NOT NULL prüfen, dass wirklich keine NULL
-- mehr existiert (falls zwischen Audit-Zeitpunkt und Migration ein
-- neuer Antrag eingegangen ist).
do $$
declare
  null_telefon          int;
  null_bank             int;
  null_raeume_vorh      int;
  null_raeume_unentg    int;
begin
  select count(*) into null_telefon       from apl2.antraege where telefon is null;
  select count(*) into null_bank          from apl2.antraege where bankverbindung is null;
  select count(*) into null_raeume_vorh   from apl2.antraege where raeume_vorhanden is null;
  select count(*) into null_raeume_unentg from apl2.antraege where raeume_unentgeltlich is null;

  if (null_telefon + null_bank + null_raeume_vorh + null_raeume_unentg) > 0 then
    raise exception
      'Migration 048 abgebrochen — NULL-Werte vorhanden: telefon=%, bank=%, raeume_vorh=%, raeume_unentg=%. Bitte zuerst backfillen.',
      null_telefon, null_bank, null_raeume_vorh, null_raeume_unentg;
  end if;
end $$;

-- 1) NOT NULL wieder einführen
alter table apl2.antraege
  alter column telefon              set not null,
  alter column bankverbindung       set not null,
  alter column raeume_vorhanden     set not null,
  alter column raeume_unentgeltlich set not null;

-- 2) CHECK-Constraints (waren in Migration 044 auf „is null OR in (ja, nein)"
--    gelockert) wieder strikt machen.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'antraege_raeume_vorhanden_check') then
    alter table apl2.antraege drop constraint antraege_raeume_vorhanden_check;
  end if;
  alter table apl2.antraege
    add constraint antraege_raeume_vorhanden_check
    check (raeume_vorhanden in ('ja', 'nein'));

  if exists (select 1 from pg_constraint where conname = 'antraege_raeume_unentgeltlich_check') then
    alter table apl2.antraege drop constraint antraege_raeume_unentgeltlich_check;
  end if;
  alter table apl2.antraege
    add constraint antraege_raeume_unentgeltlich_check
    check (raeume_unentgeltlich in ('ja', 'nein'));
end $$;

-- 3) Cross-Field-Regel (PDF-Logik): wenn keine eigenen Räume UND nicht
--    unentgeltlich überlassen → muss eine Miete-Belegposition existieren.
--    Als CHECK-Constraint nicht abbildbar (verlangt Subquery); statt-
--    dessen Hinweis als COMMENT, Durchsetzung im Pruefung-Service
--    (Backend) und im UE1-cross-field.ts (Frontend).

comment on column apl2.antraege.telefon is
  'Pflicht seit Migration 048: PDF H8 fragt Telefon/Handy als Pflichtfeld ab. War 045 optional, jetzt zurück auf PDF-Konformität.';
comment on column apl2.antraege.bankverbindung is
  'Pflicht seit Migration 048: PDF H4 fragt Bankverbindung (Bankname) als Pflichtfeld ab.';
comment on column apl2.antraege.raeume_vorhanden is
  'Pflicht seit Migration 048 (PDF H13). Cross-Field-Regel: wenn raeume_vorhanden=nein UND raeume_unentgeltlich=nein, muss belegposition mit belegtyp=miete > 0 existieren.';
comment on column apl2.antraege.raeume_unentgeltlich is
  'Pflicht seit Migration 048 (PDF H14). Siehe Cross-Field-Regel an raeume_vorhanden.';

commit;

notify pgrst, 'reload schema';
