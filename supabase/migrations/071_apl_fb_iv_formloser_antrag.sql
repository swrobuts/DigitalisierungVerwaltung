-- 071_apl_fb_iv_formloser_antrag.sql
--
-- Erfindungs-Korrektur: FB IV (Struktur- und Schwerpunktförderung) ist
-- laut Stadt Würzburg ein FORMLOSER Antrag — es gibt KEIN Antragsformular-
-- PDF und die Felder vorhaben_titel/kurzbeschreibung/geplante_massnahmen/
-- beantragte_summe_euro waren eine Erfindung der ersten Implementierung.
--
-- Quelle: https://www.wuerzburg.de/themen/gesundheit-soziales/senioren/
--         antragswesen/index.html (Stand 2026-05-26): "FB IV: Formlos"
-- Audit: docs/PDF-FELDER-AUDIT-2026-05-26.md
--
-- Korrektur:
--   1. Alle NOT-NULL-Pflichtspalten werden NULLable (Halluzinations-Schutz)
--   2. Neue Spalte `dokument_path` für den hochgeladenen formlosen PDF-Antrag
--   3. CHECK-Constraint für length(kurzbeschreibung) bleibt, falls Bürger
--      doch eine Kurzbeschreibung als optionale Hilfe für die KI-Klassifi-
--      kation eingibt
--
-- Bestehende Demo-Daten in apl.fb_iv_freitext bleiben unverändert
-- (Migration 067 FAKE-Anträge). Sie behalten ihre erfundenen Werte als
-- "Demo-Anschauungsmaterial" — neue echte Anträge können aber FB IV jetzt
-- PDF-treu einreichen.

begin;

alter table apl.fb_iv_freitext
  alter column vorhaben_titel       drop not null,
  alter column kurzbeschreibung     drop not null,
  alter column geplante_massnahmen  drop not null;

alter table apl.fb_iv_freitext
  add column if not exists dokument_path text;

comment on column apl.fb_iv_freitext.dokument_path is
  'Storage-Pfad zum formlosen FB-IV-Antrags-PDF (Bürger lädt eigenes Dokument '
  'hoch, da es kein offizielles Stadt-Würzburg-Antragsformular für FB IV gibt).';

comment on table apl.fb_iv_freitext is
  'FB IV = Struktur- und Schwerpunktförderung. Laut Stadt Würzburg FORMLOSER '
  'Antrag (kein PDF-Formular). Bürger:in lädt eigenes PDF unter '
  'dokument_path hoch + optionale Freitext-Hilfsfelder für die KI-Klassi-'
  'fikation (Vorhaben-Titel, Kurzbeschreibung) — alle Felder sind nullable.';

commit;

notify pgrst, 'reload schema';
