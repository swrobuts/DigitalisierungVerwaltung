-- 054_ahp_norm_statements_qualitativ.sql
--
-- Akribischer Sync 2026-05-24: Ergänzung der ahp_norm_statements um die
-- AHP-Stellen, die im Audit als Lücke identifiziert wurden. Status
-- 'kuratiert', mit kuratierungs_kommentar als Audit-Trail.
--
-- Vorgehensweise: Der DB-Stand vor dieser Migration wurde wörtlich
-- gegen die Spec-Liste abgeglichen. Die meisten Spec-Stellen waren
-- bereits in den Migrationen 028/049 und früheren Extraktionen
-- vorhanden — diese Migration ergänzt nur das, was tatsächlich fehlt,
-- um keine Duplikate zu erzeugen.
--
-- Wörtliche Quelle: foerderrichtlinie-ahp-2025-03-27.pdf
--
-- Echte Lücken (Stand 2026-05-24):
--
--   (A) 2.2 / qualitativ — face-to-face-Anforderung. PDF Z. 216-218:
--       „Förderfähig gemäß dieser Richtlinie sind daher Helferkreise,
--        Besuchsdienste oder andere soziale Dienste, die Angebote mit
--        direktem Kontakt zum älteren Menschen anbieten (face-to-face)."
--
--   (B) 3.2 / verpflichtung — präziser Wortlaut für die in 3.2 b)
--       genannte Doppelbedingung. PDF Z. 297-298:
--       „Voraussetzungen für die Bearbeitung eines Zuschussantrages
--        ist das vollständige und gewissenhafte Ausfüllen der
--        Formblätter."
--       (Der bestehende DB-Eintrag „Die Formblätter müssen vollständig
--        ausgefüllt sein, damit ein Zuschussantrag bearbeitet wird"
--        lässt das Wort „gewissenhaft" weg. Wir ergänzen den
--        PDF-Wortlaut, ohne den vorhandenen Eintrag zu verwerfen.)
--
-- Alle anderen Stellen aus der Spec-Tabelle (2.1 Folgeantrag, jährlich
-- berichten, Quartiers-Anbindung; 2.3 Pkt. 4 QM-Austausch; 3.2
-- fristgerecht/anerkennt/Stadtgebiet; 3.4 Sozialausschuss/kein
-- Rechtsanspruch; 3.5 schriftlicher Bescheid; 3.8 1.-April-Frist,
-- Bericht+Nachweis, 3 Jahre Aufbewahrung; 3.9 Einsicht+Auskunft) sind
-- bereits in der DB als status='kuratiert' vorhanden.
--
-- Defensiv: DO-Block; Doctree-Version aus letztem ahp_doctree;
-- ON CONFLICT … DO NOTHING gegen den UNIQUE-Index
-- (doctree_version, section_path, statement).

begin;

do $$
declare
  v text;
begin
  select version into v from apl2.ahp_doctree order by built_at desc limit 1;
  if v is null then
    raise exception 'Migration 054: keine Doctree-Version gefunden — bitte zuerst /api/rebuild-doctree.';
  end if;

  -- (A) 2.2 face-to-face — qualitativ
  insert into apl2.ahp_norm_statements
    (doctree_version, section_path, section_title, statement, statement_type, status, kuratierungs_kommentar, kuratiert_am)
  values
    (v,
     '2.2',
     'Förderbereich II — Bürgerschaftliches Engagement',
     'Förderfähig gemäß dieser Richtlinie sind daher Helferkreise, Besuchsdienste oder andere soziale Dienste, die Angebote mit direktem Kontakt zum älteren Menschen anbieten (face-to-face).',
     'qualitativ',
     'kuratiert',
     'Audit 2026-05-24: AHP-Stelle ohne maschinelle Regel, dokumentiert als Wissensbestand für RAG und Sachbearbeiter-Anzeige. Wörtlich AHP-PDF Stand 2025-03-27 Z. 216-218.',
     now())
  on conflict (doctree_version, section_path, statement) do nothing;

  -- (B) 3.2 vollständig + gewissenhaft — präziser PDF-Wortlaut
  insert into apl2.ahp_norm_statements
    (doctree_version, section_path, section_title, statement, statement_type, status, kuratierungs_kommentar, kuratiert_am)
  values
    (v,
     '3.2',
     'Antragstellung',
     'Voraussetzungen für die Bearbeitung eines Zuschussantrages ist das vollständige und gewissenhafte Ausfüllen der Formblätter.',
     'verpflichtung',
     'kuratiert',
     'Audit 2026-05-24: AHP-Stelle ohne maschinelle Regel, dokumentiert als Wissensbestand für RAG und Sachbearbeiter-Anzeige. Wörtlich AHP-PDF Stand 2025-03-27 Z. 297-298 (3.2 b). Ergänzt den bestehenden, weniger präzisen Eintrag „Die Formblätter müssen vollständig ausgefüllt sein …" um das Wort „gewissenhaft", ohne den Bestand zu verwerfen.',
     now())
  on conflict (doctree_version, section_path, statement) do nothing;
end $$;

commit;

notify pgrst, 'reload schema';
