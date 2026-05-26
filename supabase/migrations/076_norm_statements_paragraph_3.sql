-- 076_norm_statements_paragraph_3.sql
--
-- Zwei Korrekturen / Ergaenzungen an apl.ahp_norm_statements,
-- direkt aus dem AHP-PDF (Stand 2025-03-27, Seite 9 § 3.1 + § 3.3):
--
-- Bug 5: § 3.1 Antragsberechtigung fehlte vollstaendig.
--   Case 3 (DEMO-Senioren-Stammtisch Sanderau, Privatinitiative ohne
--   Traegerstatus) wurde dadurch bewilligt, obwohl AHP § 3.1
--   Privatpersonen ohne Traegerstatus klar ausschliesst.
--
-- Bug 6: § 3.3 Antragsfrist hatte als woertliches_zitat den Placeholder
--   "TBD — Antragsfristen". Echter Wortlaut aus AHP § 3.3 wird gesetzt,
--   damit das LLM nicht halluzinieren muss (vorher kam faelschlich
--   "30. April" — der echte Termin ist 1. April).

begin;

-- ── Bug 5: § 3.1 neu einfuegen (loescht vorab dasselbe ref, falls schon da) ──
delete from apl.ahp_norm_statements where ref = '§ 3.1 Antragsberechtigung';

insert into apl.ahp_norm_statements
  (ref, foerderbereich, fb_iii_variante, statement_typ,
   kurz_aussage, ausfuehrlich,
   quelle_pdf_pfad, quelle_seite, woertliches_zitat, aktiv)
values
  ('§ 3.1 Antragsberechtigung',
   null,    -- gilt fuer alle FBs
   null,    -- keine Varianten-Spezifik
   'pflicht',
   'Antragsberechtigt sind nur Vereine/Verbaende/Traegerorganisationen mit Sitz in Wuerzburg, anerkannt/bekannt/bewaehrt — Privatpersonen ohne Traegerstatus sind ausgeschlossen.',
   'AHP § 3.1 fordert explizit Traegerstatus: Verbaende, Gruppen und Initiativen der Seniorenarbeit (Wohlfahrtsverbaende, Vereine, Stadtteilinitiativen) mit Sitz in Wuerzburg, die anerkannt, bekannt und bewaehrt sein muessen. Reine Privatinitiativen ohne anerkannten Traegerstatus erfuellen diese Voraussetzungen nicht und sind nicht antragsberechtigt.',
   'materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf',
   9,
   'Antragsberechtigt sind Verbaende, Gruppen und Initiativen der Seniorenarbeit (Wohlfahrtsverbaende und andere Traeger der Seniorenarbeit, z. B. Vereine, Stadtteilinitiativen) mit Sitz in der Stadt Wuerzburg. Der Antragsberechtigte muss anerkannt, bekannt und bewaehrt sein.',
   true);

-- ── Bug 6: § 3.3 Antragsfrist — TBD-Zitat durch echten Wortlaut ersetzen ──
update apl.ahp_norm_statements
   set woertliches_zitat = 'Die Antraege muessen grundsaetzlich bis zum 1. April des Antragsjahres vorliegen. Antraege die zu spaet eingereicht werden, gelten als verfristet und werden grundsaetzlich abgelehnt.',
       kurz_aussage = 'Antragsfrist: 1. April des Antragsjahres. Spaetere Antraege gelten als verfristet und werden grundsaetzlich abgelehnt.',
       quelle_seite = 9
 where ref in ('§ 3.3', '§ 3.3 Antragsfrist', '§ 3.3 Antragsfristen', '§ 4');

commit;
