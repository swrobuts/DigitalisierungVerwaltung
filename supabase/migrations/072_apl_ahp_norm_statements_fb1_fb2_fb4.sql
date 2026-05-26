-- 072_apl_ahp_norm_statements_fb1_fb2_fb4.sql
--
-- Ergänzt apl.ahp_norm_statements um Aussagen für FB I, FB II, FB IV
-- (sowie programm-übergreifende Aussagen aus Abschnitt 3 — Verfahren,
-- Verwendungsnachweis, Prüfungsrecht), damit der KI-Layer-B-Validator
-- (pruefung/layer_b.check_ontologie / quellen_validator) auch für FB I,
-- II, IV greift.
--
-- Phase 1.7 (Mai 2026, Migration 063) hatte nur ein Skelett mit
-- „TBD — wörtliches Zitat …" für alle FBs gesetzt. Hier füllen wir die
-- realen wörtlichen Zitate ein — aus der Förderrichtlinie 2025-03-27.
--
-- Robert-Regel (oberste Priorität, siehe docs/PDF-FELDER-AUDIT-2026-05-26.md):
-- „Es darf NIE etwas erfunden oder hinzugefügt werden, was weder in der
--  Rechtsgrundlage noch in den PDFs enthalten ist."
-- → jede `woertliches_zitat`-Zeile unten ist ein direktes Zitat aus dem
--   PDF (gelegentlich minimal gekürzt um Zeilen-Umbrüche/Fußnoten-Refs),
--   inklusive Seitenangabe in `quelle_seite`.
--
-- Schema-Referenz (aus 063): ahp_norm_statements hat die Spalten
--   ref, foerderbereich (I|II|III|IV|NULL), fb_iii_variante,
--   statement_typ (pflicht|optional|verwaltungspraxis|definition),
--   kurz_aussage, ausfuehrlich, quelle_pdf_pfad, quelle_seite,
--   woertliches_zitat.
-- Idempotent: NICHT mit ON CONFLICT — die Tabelle hat keinen Unique-Key
-- auf (ref, foerderbereich). Wir nutzen `where not exists` pro Eintrag,
-- damit Re-Apply keine Duplikate erzeugt.

begin;

-- Hilfs-Variable für den PDF-Pfad, der bei allen Einträgen identisch ist.
-- (psql-`\set` geht in Migrationen nicht — wir wiederholen den Pfad
-- explizit. Der Check-Constraint in 063 erzwingt `materialien/%`.)

-- ── Programm-übergreifende Aussagen (foerderbereich = NULL) ─────────

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 2 Verpflichtung Logo',
  NULL, 'pflicht',
  'Träger sind verpflichtet, Förderquelle und Logo der Stadt Würzburg zu vermerken',
  'Bei Programmen und Veröffentlichungen der geförderten Angebote muss der Erhalt von Fördergeldern nach SGB XII § 71 vermerkt werden, mit dem Logo der Stadt Würzburg.',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 6,
  'Die Vereine, Träger und Einrichtungen sind verpflichtet, den Erhalt von Fördergeldern nach SGB XII § 71, in ihren Programmen und Veröffentlichungen zu vermerken, wobei das Logo der Stadt Würzburg verwendet werden muss.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 2 Verpflichtung Logo' and foerderbereich is null
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 3.1 Antragsberechtigung',
  NULL, 'pflicht',
  'Antragsberechtigt: Verbände, Gruppen, Initiativen der Seniorenarbeit mit Sitz in Würzburg',
  'Der Antragsberechtigte muss anerkannt, bekannt und bewährt sein. Privatpersonen sind nicht antragsberechtigt.',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 9,
  'Antragsberechtigt sind Verbände, Gruppen und Initiativen der Seniorenarbeit (Wohlfahrtsverbände und andere Träger der Seniorenarbeit, z. B. Vereine, Stadtteilinitiativen) mit Sitz in der Stadt Würzburg. Der Antragsberechtigte muss anerkannt, bekannt und bewährt sein.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 3.1 Antragsberechtigung' and foerderbereich is null
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 3.2 Antragstellung',
  NULL, 'pflicht',
  'Antrag auf Formblättern, vollständig und gewissenhaft ausgefüllt',
  'Anträge sind auf den entsprechenden Formblättern fristgerecht bei der Geschäftsstelle Fachbereich IIS, Leitung Senioren einzureichen. Förderung kann nur für die auf dem Gebiet der Stadt Würzburg erbrachte Leistung gewährt werden.',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 9,
  'Die Anträge sind auf den entsprechenden Formblättern fristgerecht bei der Geschäftsstelle Fachbereich IIS, Leitung Senioren einzureichen. Voraussetzungen für die Bearbeitung eines Zuschussantrages ist das vollständige und gewissenhafte Ausfüllen der Formblätter.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 3.2 Antragstellung' and foerderbereich is null
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 3.3 Antragsfrist',
  NULL, 'pflicht',
  'Antragsfrist: 1. April des Antragsjahres',
  'Anträge müssen grundsätzlich bis zum 1. April des Antragsjahres vorliegen. Verspätete Anträge gelten als verfristet und werden grundsätzlich abgelehnt.',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 9,
  'Die Anträge müssen grundsätzlich bis zum 1. April des Antragsjahres vorliegen. Anträge die zu spät eingereicht werden, gelten als verfristet und werden grundsätzlich abgelehnt.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 3.3 Antragsfrist' and foerderbereich is null
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 3.4 Bewilligung',
  NULL, 'pflicht',
  'Entscheidung durch Sozialausschuss; kein Rechtsanspruch auf Förderung',
  'Über Art und Höhe der Bewilligung entscheidet der Sozialausschuss nach Prüfung des Antrags durch FB IIS, Leitung Seniorenarbeit. Bei knapper Mittellage kann zur Wahrung der Fördergerechtigkeit vom Richtlinienrahmen abgewichen werden.',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 9,
  'Über die Art und Höhe der Bewilligung entscheidet der Sozialausschuss der Stadt Würzburg nach Prüfung des Antrages durch die Leitung Seniorenarbeit, FB IIS. Ein Rechtsanspruch besteht nicht.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 3.4 Bewilligung' and foerderbereich is null
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 3.6 Auszahlungs-Konto',
  NULL, 'pflicht',
  'Auszahlung ausschließlich auf Konten von Antragsberechtigten',
  'Zuschüsse werden nicht auf Privatkonten überwiesen. Voraussetzung ist die zuvor erfolgte Beschlussfassung durch den Sozialausschuss.',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 9,
  'Die Auszahlung des Zuschusses erfolgt nach Beschlussfassung durch den Sozialausschuss der Stadt Würzburg. Zuschüsse werden ausschließlich auf Konten von Antragsberechtigten überwiesen.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 3.6 Auszahlungs-Konto' and foerderbereich is null
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 3.7 Rechnungsjahr',
  NULL, 'definition',
  'Rechnungsjahr: 1. Januar bis 31. Dezember',
  NULL,
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 9,
  'Das Rechnungsjahr läuft vom 1. Januar bis 31. Dezember.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 3.7 Rechnungsjahr' and foerderbereich is null
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 3.8 Verwendungsnachweis',
  NULL, 'pflicht',
  'Verwendungsnachweis bis 1. April des Folgejahres; Originalbelege 3 Jahre aufbewahren',
  'Der Verwendungsnachweis hat aus einem sachlichen Bericht und einem zahlenmäßigen Nachweis zu bestehen. Belege sind nur auf Anfrage einzureichen. Originalbelege mind. 3 Jahre aufbewahren.',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 9,
  'Die ordnungsgemäße Verwendung der Zuschussmittel ist vom Antragsteller bis zum 1. April des auf die Zuschussgewährung folgenden Jahres nachzuweisen. Der Verwendungsnachweis hat aus einem sachlichem Bericht und einem zahlenmäßigem Nachweis zu bestehen. Belege sind nur auf Anfrage einzureichen. Die Originalbelege sind jedoch mindestens 3 Jahre aufzubewahren.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 3.8 Verwendungsnachweis' and foerderbereich is null
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 3.9 Prüfungsrecht',
  NULL, 'pflicht',
  'Prüfungsrecht der Stadt Würzburg; Antragsteller müssen Einsicht in Bücher und Belege gewähren',
  NULL,
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 9,
  'Die Stadt Würzburg ist berechtigt, die ordnungsgemäße Verwendung der gewährten Zuschüsse zu prüfen. Die Antragsteller sind verpflichtet, der Stadt Würzburg die zur Prüfung erforderliche Einsicht in alle Bücher und Belege zu gewähren und die entsprechenden Auskünfte zu erteilen.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 3.9 Prüfungsrecht' and foerderbereich is null
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 4 Doppelförderung',
  NULL, 'pflicht',
  'Doppelförderung ausgeschlossen',
  'Die Richtlinien dienen dem Grundsatz der Fördergerechtigkeit. Eine Doppelförderung wird ausgeschlossen.',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 10,
  'Die Richtlinien dienen dem Grundsatz der Fördergerechtigkeit. Eine Doppelförderung wird ausgeschlossen.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 4 Doppelförderung' and foerderbereich is null
);

-- ── FB I — Aufbau von niedrigschwelligen Angeboten ───────────────────

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 2.1 FB I Zweck',
  'I', 'definition',
  'FB I: Anschubfinanzierung für neue niedrigschwellige Angebote bzw. nachbarschaftliche Hilfsdienste',
  'Die Stadt sieht sich als Partner in dieser Phase. Der Anbieter stellt eine Projektskizze vor und stimmt diese bei Antragstellung mit dem Sozialreferat, FB IIS, Bereich Senioren, ab.',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 6,
  'Die Aufbauphase von neuen Angeboten ist häufig aufgrund noch fehlender finanzieller Ressourcen für den Anbieter eine besondere wirtschaftliche Herausforderung. In dieser Phase werden Konzepte für neue, innovative Angebote entwickelt und Projektanträge gestellt. Die Stadt Würzburg unterstützt mögliche Träger von Angeboten in dieser Phase finanziell. Sie ermöglicht dadurch den Aufbau neuer Angebote.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 2.1 FB I Zweck' and foerderbereich = 'I'
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 2.1 FB I Höhe',
  'I', 'pflicht',
  'Pauschalzuschuss FB I: 3.000 € pro Jahr',
  NULL,
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 6,
  'Die Stadt Würzburg gewährt daraufhin einen pauschalen Zuschuss in Höhe von 3.000 € pro Jahr für den Aufbau von niedrigschwelligen Angeboten bzw. nachbarschaftlicher, bürgerschaftlicher Hilfsdienste für ältere Bürger:innen.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 2.1 FB I Höhe' and foerderbereich = 'I'
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 2.1 FB I Befristung',
  'I', 'pflicht',
  'FB-I-Zuschüsse sind befristet auf maximal drei Jahre',
  'Nach Ende der Projektphase kann eine Förderung durch Richtlinie II, III oder IV erfolgen.',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 6,
  'Diese Zuschüsse sind befristet auf maximal drei Jahre. Nach Ende der Projektphase kann eine Förderung durch die Richtlinie II, III oder IV erfolgen.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 2.1 FB I Befristung' and foerderbereich = 'I'
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 2.1 FB I Quartier-Anbindung',
  'I', 'pflicht',
  'Bedingung: enge Anbindung an das Quartier des Wirkungskreises',
  NULL,
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 6,
  'Die Träger der neuen Angebote suchen eine enge Anbindung an das Quartier, in dem ihr Wirkungskreis liegen wird.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 2.1 FB I Quartier-Anbindung' and foerderbereich = 'I'
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 2.1 FB I Folge-Förderantrag',
  'I', 'pflicht',
  'Spätestens im zweiten Projektjahr Folge-Förderantrag (z.B. SeLA, GutePflegeFör) bei anderer Stelle',
  NULL,
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 6,
  'Spätestens im zweiten Projektjahr wird von den Projektträgern ein Förderantrag wie z.B. „SeLA" oder „Gute PflegeFör" bei einer anderen Stelle gestellt.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 2.1 FB I Folge-Förderantrag' and foerderbereich = 'I'
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 2.1 FB I Jahresbericht',
  'I', 'pflicht',
  'Jährlicher Bericht zur Umsetzung; Prüfung ergänzender Fördermöglichkeiten',
  NULL,
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 6,
  'Die Projektentwickler berichten jährlich über die Umsetzung. Sie prüfen frühestmöglich ergänzende Fördermöglichkeiten und informieren zum Sachverhalt.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 2.1 FB I Jahresbericht' and foerderbereich = 'I'
);

-- ── FB II — Förderung bürgerschaftlichen Engagements ────────────────

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 2.2 FB II Zweck',
  'II', 'definition',
  'FB II: Förderung sozialer Dienste mit direktem face-to-face-Kontakt zum älteren Menschen',
  'Adressiert dem zunehmenden Phänomen Einsamkeit in der späten Lebensphase. Helferkreise, Besuchsdienste oder andere soziale Dienste mit direktem Kontakt zum älteren Menschen.',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 6,
  'Förderfähig gemäß dieser Richtlinie sind daher Helferkreise, Besuchsdienste oder andere soziale Dienste, die Angebote mit direktem Kontakt zum älteren Menschen anbieten (face-to-face).'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 2.2 FB II Zweck' and foerderbereich = 'II'
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 2.2 FB II Sockelförderung',
  'II', 'pflicht',
  'FB-II-Sockelförderung: pauschal 750 € pro Jahr',
  NULL,
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 7,
  'Diese Angebote werden pauschal mit einem Zuschuss von 750 € pro Jahr gefördert.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 2.2 FB II Sockelförderung' and foerderbereich = 'II'
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 2.2 FB II Staffelung',
  'II', 'pflicht',
  'Gestaffelte Aufstockung nach Helferstunden oder Helferzahl; höchste Kategorie zählt',
  'Staffel: <3999 Std oder ≤59 EA → 1.250 €; ≥4000 Std oder ≥60 EA → 2.000 €; ≥6000 Std oder ≥90 EA → 3.500 €. Höchste Kategorie zählt (Stunden ODER Helfer:innen).',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 7,
  'Darüber hinaus wird eine weitere gestaffelte Förderung gewährt. Diese orientiert sich an der Anzahl der geleisteten ehrenamtlichen Stunden, bzw. der Anzahl der Ehrenamtlichen Helfer:innen. Die Zuordnung erfolgt stets in die höchst mögliche Kategorie, entweder den geleisteten Stunden oder der Anzahl der Ehrenamtlichen.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 2.2 FB II Staffelung' and foerderbereich = 'II'
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 2.2 FB II Identifikation Quartier',
  'II', 'definition',
  'Wert auf Identifikation der Bürger:innen mit Stadtbezirk / Quartier',
  NULL,
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 6,
  'Die Stadt Würzburg legt bei der Förderung im Bereich der Altenhilfe besonderen Wert auf die psychosoziale Betreuung sowie auf eine starke Identifikation der Bürger:innen mit ihrem Stadtbezirk, bzw. dem Quartier.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 2.2 FB II Identifikation Quartier' and foerderbereich = 'II'
);

-- ── FB IV — Struktur- und Schwerpunktförderung (formlos) ─────────────

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 2.4 FB IV Zweck',
  'IV', 'definition',
  'FB IV: unbürokratische Strukturförderung für kritische Entwicklungen, unterjährig beantragbar',
  'Förderung von Projekten und Initiativen zur Stärkung vorhandener Strukturen in den Stadtteilen. Auch innovative Projekte des Sozialreferates (Aufsuchende Hilfe, Pflegestützpunkt, Wohnberatung, Seniorenvertretung mit Seniorenbeirat) gehören dazu.',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 8,
  'Sich verändernde Rahmenbedingungen erfordern in einer ersten Phase unbürokratische Ansätze der Förderung. Das Sozialreferat der Stadt muss auf kritische Entwicklungen reagieren können, um schnelle Lösungen zu erarbeiten.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 2.4 FB IV Zweck' and foerderbereich = 'IV'
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 2.4 FB IV Beantragung',
  'IV', 'pflicht',
  'FB IV ist unterjährig beantragbar — keine starre Antragsfrist',
  'Die Stärke dieses Fördertopfes ermöglicht eine zeitnahe und unterjährige Beantragung und Mittelgewährung.',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 8,
  'Die Stärke dieses Fördertopfes ermöglicht eine zeitnahe und unterjährige Beantragung und Mittelgewährung für solch wichtige Projekte und Initiativen, um diese umzusetzen.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 2.4 FB IV Beantragung' and foerderbereich = 'IV'
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 2.4 FB IV Pflicht-Angaben',
  'IV', 'pflicht',
  'Antrag muss Zuwendungszweck (Erläuterung der Ziele) und Finanzierungsplan enthalten',
  'Pflicht-Bestandteile des FB-IV-Antrags: (1) Zuwendungszweck unter Erläuterung der angestrebten Ziele, (2) Finanzierungsplanung mit allen geplanten Ausgaben und Einnahmen der geförderten Maßnahme.',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 8,
  'Im Rahmen der Antragstellung ist der Zuwendungszweck unter Erläuterung der angestrebten Ziele zu beschreiben. Zudem ist eine Finanzierungsplanung, die alle geplanten Ausgaben und Einnahmen der geförderten Maßnahme umfasst, vorzulegen.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 2.4 FB IV Pflicht-Angaben' and foerderbereich = 'IV'
);

insert into apl.ahp_norm_statements
  (ref, foerderbereich, statement_typ, kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat)
select
  '§ 2.4 FB IV Adressaten',
  'IV', 'definition',
  'Auch innovative Projekte des Sozialreferates fallen unter FB IV',
  'Aufsuchende Hilfe und Beratung für Senior:innen, Pflegestützpunkt, Wohnberatung, Seniorenvertretung mit Seniorenbeirat zählen explizit zu FB IV.',
  'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf', 8,
  'Auch innovative Projekte des Sozialreferates, z.B. der Aufsuchenden Hilfe und Beratung für Senior:innen, dem Pflegestützpunkt und der Wohnberatung und der Seniorenvertretung mit dem Seniorenbeirat, gehören dazu.'
where not exists (
  select 1 from apl.ahp_norm_statements
  where ref = '§ 2.4 FB IV Adressaten' and foerderbereich = 'IV'
);

commit;
notify pgrst, 'reload schema';
