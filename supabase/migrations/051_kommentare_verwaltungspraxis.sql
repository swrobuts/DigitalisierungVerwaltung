-- 051_kommentare_verwaltungspraxis.sql
--
-- AHP-Audit 2026-05-24 (P1): Spalten-Kommentare aus Migration 048 haben
-- die Pflicht-Eigenschaft mit "PDF H8 fragt … als Pflichtfeld ab"
-- begründet — dies ist sachlich falsch. Das amtliche Antrags-PDF
-- (Stand 2025-03-27) zeigt die betroffenen Felder OHNE formale
-- Pflicht-Markierung. Die Pflicht-Behandlung resultiert aus der
-- Verwaltungspraxis des Sozialreferats Stadt Würzburg.
--
-- Diese Migration ist defensiv: NUR COMMENT-Updates. Keine
-- Strukturänderungen, keine Datenbewegung, keine RLS-Eingriffe.
--
-- Zusätzlich: Kommentar an apl2.ontologie_rules-Zeile
-- 'auszahlung_max_cap_mal_anteil' wird ergänzt, um klarzustellen,
-- dass die Formel eine kuratierte Auslegung darstellt
-- (Begründung siehe Migration 049 / norm_statements).

begin;

-- ──────────────────────────────────────────────────────────────────
-- 1) apl2.antraege — präzisere Begründung für Pflichtspalten
-- ──────────────────────────────────────────────────────────────────

comment on column apl2.antraege.telefon is
  'Pflicht seit Migration 048 (Verwaltungspraxis Sozialreferat Stadt Würzburg, '
  'Robert Butscher 2026-05-24). PDF fragt das Feld ab, ohne formale '
  'Pflicht-Markierung — Verwaltungspraxis behandelt es als zwingend für '
  'Antragsannahme.';

comment on column apl2.antraege.bankverbindung is
  'Pflicht seit Migration 048 (Verwaltungspraxis Sozialreferat Stadt Würzburg, '
  'Robert Butscher 2026-05-24). PDF fragt Bankverbindung (Bankname) ab, ohne '
  'formale Pflicht-Markierung — Verwaltungspraxis behandelt es als zwingend '
  'für Antragsannahme (Voraussetzung für Auszahlung).';

comment on column apl2.antraege.raeume_vorhanden is
  'Pflicht seit Migration 048 (Verwaltungspraxis Sozialreferat Stadt Würzburg, '
  'Robert Butscher 2026-05-24). PDF fragt das Feld ab, ohne formale '
  'Pflicht-Markierung — Verwaltungspraxis behandelt es als zwingend. '
  'Cross-Field-Regel: wenn raeume_vorhanden=nein UND raeume_unentgeltlich=nein, '
  'muss belegposition mit belegtyp=miete > 0 existieren.';

comment on column apl2.antraege.raeume_unentgeltlich is
  'Pflicht seit Migration 048 (Verwaltungspraxis Sozialreferat Stadt Würzburg, '
  'Robert Butscher 2026-05-24). PDF fragt das Feld ab, ohne formale '
  'Pflicht-Markierung — Verwaltungspraxis behandelt es als zwingend. '
  'Siehe Cross-Field-Regel an raeume_vorhanden.';

-- ──────────────────────────────────────────────────────────────────
-- 2) apl2.ontologie_rules — auszahlung_max_cap_mal_anteil: Klar-
--    stellung, dass die Formel kuratierte Auslegung ist
-- ──────────────────────────────────────────────────────────────────
-- Die AHP-Förderrichtlinie definiert für FB III Pkt. 2 (Begegnungs-
-- zentren) eine prozentuale Auszahlung nach Stadtbewohner-Anteil und
-- einen jährlichen Cap. Die konkrete Multiplikations-Formel
-- (cap * anteil) ist eine kuratierte Auslegung der Sachbearbeitung
-- und im AHP nicht wörtlich als Formel ausformuliert — siehe
-- norm_statement zu dieser Regel (eingepflegt mit Migration 049).
-- Wir nutzen hier table_comment der Regel-Tabelle nicht (sondern den
-- norm_statement-Mechanismus), aber für DB-Inspektion ein klarer
-- Hinweis als kombinierter row-level COMMENT-Surrogat via
-- description-Spalte, falls vorhanden. Sonst no-op.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'apl2'
      and table_name   = 'ontologie_rules'
      and column_name  = 'description'
  ) then
    update apl2.ontologie_rules
       set description = coalesce(description, '') ||
           E'\n\n[Verwaltungspraxis 2026-05-24] Die Formel '
           '"auszahlung = cap * stadtbewohner_anteil" ist kuratierte '
           'Auslegung der Sachbearbeitung Sozialreferat. Der AHP '
           'definiert Cap und Anteils-Skalierung, aber nicht die '
           'konkrete Multiplikations-Formel. Siehe Migration 049 '
           'norm_statement für die wörtliche AHP-Quelle.'
     where rule_name = 'auszahlung_max_cap_mal_anteil';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
