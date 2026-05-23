-- 044_raeume_belege_optional.sql
--
-- Hintergrund: UE1-Antragsformular wird abgespeckt (Step 5 'Räume +
-- Belege' entfällt komplett), weil AHP 3.8 wörtlich sagt:
-- „Belege sind nur auf Anfrage einzureichen." Für FB III ist die
-- Detail-Belegerhebung im Antragsmoment also nicht rechtssicher
-- verlangt. Der Antrag soll schlanker werden.
--
-- Konsequenz fürs Datenmodell:
--   raeume_vorhanden + raeume_unentgeltlich sind aktuell NOT NULL —
--   wenn das Formular sie nicht mehr setzt, kracht das Insert.
--   Daher hier NULL erlaubt.
--
-- Bestehende Anträge bleiben unangetastet (haben weiterhin ihre
-- ja/nein-Werte). Nur neue Anträge können sie NULL lassen.

begin;

alter table apl2.antraege
  alter column raeume_vorhanden drop not null,
  alter column raeume_unentgeltlich drop not null;

-- CHECK-Constraints anpassen, sodass NULL auch erlaubt ist
do $$
begin
  -- raeume_vorhanden
  if exists (select 1 from pg_constraint where conname = 'antraege_raeume_vorhanden_check') then
    alter table apl2.antraege drop constraint antraege_raeume_vorhanden_check;
  end if;
  alter table apl2.antraege
    add constraint antraege_raeume_vorhanden_check
    check (raeume_vorhanden is null or raeume_vorhanden in ('ja', 'nein'));

  -- raeume_unentgeltlich
  if exists (select 1 from pg_constraint where conname = 'antraege_raeume_unentgeltlich_check') then
    alter table apl2.antraege drop constraint antraege_raeume_unentgeltlich_check;
  end if;
  alter table apl2.antraege
    add constraint antraege_raeume_unentgeltlich_check
    check (raeume_unentgeltlich is null or raeume_unentgeltlich in ('ja', 'nein'));
end $$;

comment on column apl2.antraege.raeume_vorhanden is
  'NULL erlaubt seit Migration 044: das UE1-Antragsformular fragt Räumlichkeiten gem. AHP 3.8 nicht mehr zwingend ab (Belege nur auf Anfrage).';
comment on column apl2.antraege.raeume_unentgeltlich is
  'NULL erlaubt seit Migration 044 — analog raeume_vorhanden.';

commit;

notify pgrst, 'reload schema';
