-- 063_apl_ahp_norm_statements.sql
-- Doctree-Tabelle mit verpflichtendem Source-Pinning gem. Spec §12.1.
-- Jedes Statement muss quelle_pdf_pfad + quelle_seite + woertliches_zitat haben.
-- Der Quellen-Validator (pruefung/quellen_validator.py) prüft beim Bescheid-Render hard.

create type apl.statement_typ_enum as enum (
  'pflicht',
  'optional',
  'verwaltungspraxis',
  'definition'
);

create table apl.ahp_norm_statements (
  id                   uuid primary key default gen_random_uuid(),
  ref                  text not null,
  foerderbereich       apl.foerderbereich_enum,
  fb_iii_variante      apl.fb_iii_variante_enum,
  statement_typ        apl.statement_typ_enum not null,
  kurz_aussage         text not null,
  ausfuehrlich         text,

  -- Hard-Source-Pinning (Spec §12.1)
  quelle_pdf_pfad      text not null check (quelle_pdf_pfad like 'materialien/%'),
  quelle_seite         int not null check (quelle_seite >= 1),
  woertliches_zitat    text not null check (length(woertliches_zitat) >= 10),

  aktiv                boolean not null default true,
  erstellt_am          timestamptz not null default now()
);

create index ahp_norm_statements_fb_idx on apl.ahp_norm_statements(foerderbereich) where aktiv;
create index ahp_norm_statements_ref_idx on apl.ahp_norm_statements(ref);

comment on table apl.ahp_norm_statements is
  'Kuratierte AHP-Norm-Statements mit Source-Pinning gegen Halluzination. '
  'Pflichtfelder quelle_pdf_pfad + quelle_seite + woertliches_zitat müssen '
  'beim Bescheid-Render referenziert werden (siehe quellen_validator.py).';

-- 12 Seed-Statements als Skelett. Wörtliche Zitate als 'TBD — …' markiert.
-- Vor erstem produktiven Bescheid-Render manuell aus PDF nachpflegen
-- (siehe docs/superpowers/tracking/ahp-doctree-kuration-pending.md).
insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
values
  ('§ 1', NULL, 'definition',
   'Antrags-Berechtigung: gemeinnützige Träger der Seniorenarbeit in Würzburg',
   'AHP fördert Strukturen und Angebote der Altenhilfe. Antragsberechtigt sind gemeinnützige Träger mit Aktivitäten in der Stadt Würzburg.',
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 1,
   'TBD — wörtliches Zitat aus Richtlinie nach manueller Kuration einfügen'),

  ('§ 2.1', 'I', 'pflicht',
   'FB I: Förderung für Aufbau niedrigschwelliger Angebote oder Engagement-Strukturen',
   NULL,
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 3,
   'TBD — Seite 3, Förderbereich I'),

  ('§ 2.2', 'II', 'pflicht',
   'FB II: Pauschale Förderung von bürgerschaftlichem Engagement',
   NULL,
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 4,
   'TBD — Seite 4, Förderbereich II'),

  ('§ 2.3.1', 'III', 'pflicht',
   'FB III Variante A — Mehrgenerationenhaus (Bundesprogramm-Bestätigung Pflicht)',
   NULL,
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 5,
   'TBD — Mehrgenerationenhaus'),

  ('§ 2.3.2', 'III', 'pflicht',
   'FB III Variante B — Begegnungszentrum/Bildungsträger, max. 10.000 €/Jahr',
   NULL,
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 5,
   'TBD — Begegnungszentren'),

  ('§ 2.3.4', 'III', 'pflicht',
   'FB III Variante C — Seniorenkreis Treffen-Staffel: ≥10/≥20/≥40 Treffen',
   'Förderhöhe steigt mit Treffen-Anzahl: ≥10 → 750 €, ≥20 → 1.250 €, ≥40 → 2.000 €',
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 6,
   'TBD — Seniorenkreise Treffen-Staffel'),

  ('§ 2.3.5', 'III', 'pflicht',
   'FB III Variante D — Quartiersmanagement, bis 7.500 €/Jahr',
   NULL,
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 7,
   'TBD — Quartiersmanagement'),

  ('§ 2.4', 'IV', 'pflicht',
   'FB IV — Struktur- und Schwerpunktförderung, formlos',
   NULL,
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 8,
   'TBD — Schwerpunktförderung'),

  ('§ 3.3', NULL, 'pflicht',
   'Antragsfrist: bis 30. April des Haushaltsjahrs',
   'Anträge müssen bis spätestens 30. April des laufenden Haushaltsjahres eingereicht sein.',
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 9,
   'TBD — Antragsfristen'),

  ('§ 3.5', NULL, 'pflicht',
   'Auszahlung nur an gemeinnützige Träger mit gültiger Bankverbindung',
   'IBAN muss technisch gültig sein (Mod-97). Auszahlung an Privatkonten nicht zulässig.',
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 10,
   'TBD — Auszahlungs-Voraussetzungen'),

  ('AGB.IBAN', NULL, 'verwaltungspraxis',
   'IBAN-Prüfung nach ISO 13616 (Mod-97)',
   'Sozialreferat-Praxis: vor Auszahlung wird IBAN technisch geprüft.',
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 10,
   'TBD — interne Verwaltungspraxis, wird beim Sozialreferat angefragt'),

  ('§ 4', NULL, 'pflicht',
   'Verwendungsnachweis: bis 30. April des Folgejahrs',
   'Bis zum 30. April des Folgejahres ist ein Verwendungsnachweis vorzulegen. Antrag fürs Folgejahr zählt als Verwendungsnachweis fürs Vorjahr.',
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 11,
   'TBD — Verwendungsnachweis');
