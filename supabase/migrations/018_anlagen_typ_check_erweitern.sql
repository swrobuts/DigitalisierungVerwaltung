-- 018_anlagen_typ_check_erweitern.sql
-- UE1-v2 nutzt die neuen Belegtyp-Namen aus apl2.belegposition.belegtyp
-- (betriebskosten, personalkosten, miete) auch für apl2.anlagen.typ —
-- der alte CHECK-Constraint von UE1 v1 erlaubt aber nur die 4 fixen
-- Anlagen-Typen. Symptom: "new row for relation \"anlagen\" violates
-- check constraint \"anlagen_typ_check\"" beim Submit mit Mietbeleg.
--
-- Fix: Constraint droppen + neuen anlegen, der beide Namensschemata zulässt.

alter table apl2.anlagen drop constraint if exists anlagen_typ_check;

alter table apl2.anlagen add constraint anlagen_typ_check check (
  typ in (
    -- UE1-v1 Legacy-Typen (Bestandsdaten)
    'mietvertrag',
    'programm-altentagesstaette',
    'anlage-1-kostennachweis',
    'personalkostenbelege',
    -- UE1-v2 Belegtyp-Namen (matching apl2.belegposition.belegtyp)
    'miete',
    'betriebskosten',
    'personalkosten'
  )
);

notify pgrst, 'reload schema';
