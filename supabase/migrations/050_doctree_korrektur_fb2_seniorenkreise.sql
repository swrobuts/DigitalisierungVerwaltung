-- 050_doctree_korrektur_fb2_seniorenkreise.sql
--
-- Audit 2026-05-24: Doctree section 2.2 und section 2.3 Pkt 4
-- (Seniorenkreise) enthalten halluzinierte Tabellen, die nicht im
-- AHP-PDF stehen.
--
-- section 2.2 hat Tabelle "bis 300 / 3-5 EA → 1.500 €" etc. —
-- erfunden. PDF (Z. 222-223) sagt: "< 3999 Std / ≤ 59 EA → 1.250 €;
-- ≥ 4000 / ≥ 60 → 2.000 €; ≥ 6000 / ≥ 90 → 3.500 €".
--
-- section 2.3.4 (Seniorenkreise) hat Tabelle "12-24 → 1.000 € /
-- ab 25 → 2.000 €" — erfunden. PDF (Z. 257-260) sagt:
-- "≥ 10 → 750 €; ≥ 20 → 1.250 €; ≥ 46 → 2.000 €".
--
-- Außerdem: die 5 children unter 2.3 (Mehrgenerationenhäuser,
-- Begegnungszentren, Bildungsträger, Seniorenkreise, QM) haben
-- aktuell alle path="" — das hat zur Folge, dass der Halluzina-
-- tions-Validator Refs der Form "AHP 2.3.2 …" nicht auflösen
-- kann und FB-III-Bescheide mit HTTP 422 blockiert.
-- Diese Migration setzt path auf "2.3.1" … "2.3.5".
--
-- Nach dieser Migration MUSS /api/build-embeddings aufgerufen
-- werden, damit die korrigierten Sections + neuen 2.3.x-Pfade
-- frische Embeddings bekommen.

begin;

-- ──────────────────────────────────────────────────────────────────
-- 1) Section 2.2 — Content mit korrekter PDF-Tabelle ersetzen
--    Pfad: root → children[1] (=Kapitel 2) → children[1] (=2.2)
-- ──────────────────────────────────────────────────────────────────

update apl2.ahp_doctree
set tree_jsonb = jsonb_set(
  tree_jsonb,
  '{children, 1, children, 1, content}',
  to_jsonb($content$Die Stadt Würzburg legt bei der Förderung im Bereich der Altenhilfe besonderen Wert auf die psychosoziale Betreuung sowie auf eine starke Identifikation der Bürger:innen mit ihrem Stadtbezirk, bzw. dem Quartier. Hierbei kommt dem Ehrenamt eine zentrale Rolle zu: Es soll nicht nur den Dialog zwischen den Generationen fördern, sondern auch eine aktive Bürgerkultur im Sinne von Solidarität und Verantwortung leben. Die Förderung zielt darauf ab, die ältere Generation im Quartier zu unterstützen und gleichzeitig das Engagement der Bürger:innen für ihre Lebensumgebung zu stärken. Damit dies auch zukünftig erfolgreich umgesetzt werden kann, sind die Potenziale des Alters — insbesondere durch ehrenamtliche Initiativen — von großer Bedeutung, um das soziale Miteinander auf lokaler Ebene unter dem Motto „Aktiv im Alter" und „Alter schafft Neues" weiter zu fördern und zu gestalten. Einsamkeit nimmt in der späten Lebensphase zu. Prognosen zeigen, dass dieses Phänomen zukünftig insgesamt noch weiter zunehmen wird. Durch diese Förderrichtlinie will die Stadt Würzburg Trägern Anreize geben mit ihren Angeboten dieser Entwicklung entgegen zu wirken. Förderfähig gemäß dieser Richtlinie sind daher Helferkreise, Besuchsdienste oder andere soziale Dienste, die Angebote mit direktem Kontakt zum älteren Menschen anbieten (face-to-face). Diese Angebote werden pauschal mit einem Zuschuss von 750 € pro Jahr gefördert. Darüber hinaus wird eine weitere gestaffelte Förderung gewährt. Diese orientiert sich an der Anzahl der geleisteten ehrenamtlichen Stunden, bzw. der Anzahl der Ehrenamtlichen Helfer:innen. Die Zuordnung erfolgt stets in die höchst mögliche Kategorie, entweder den geleisteten Stunden oder der Anzahl der Ehrenamtlichen. | Anzahl Stunden | Anzahl Ehrenamtliche | Fördersumme | |---|---|---| | < 3.999 Std/Jahr | ≤ 59 EA | 1.250 € | | ≥ 4.000 Std/Jahr | ≥ 60 EA | 2.000 € | | ≥ 6.000 Std/Jahr | ≥ 90 EA | 3.500 € | Maximale jährliche Fördersumme: 750 € (Pauschale) + 3.500 € (Staffel-Maximum) = 4.250 €.$content$::text)
);

-- ──────────────────────────────────────────────────────────────────
-- 2) Section 2.3.4 (Seniorenkreise) — Content mit korrekter
--    Staffel-Tabelle ersetzen
--    Pfad: root → children[1] → children[2] (=2.3) → children[3] (=Seniorenkreise)
-- ──────────────────────────────────────────────────────────────────

update apl2.ahp_doctree
set tree_jsonb = jsonb_set(
  tree_jsonb,
  '{children, 1, children, 2, children, 3, content}',
  to_jsonb($content$Seniorenkreise bieten in einem bestimmten Stadtgebiet oder Quartier Angebote für ältere Menschen an, die für alle Menschen offen sind — unabhängig von Vereinszugehörigkeit oder Konfession — und aktiv im Quartier beworben werden. Die Förderung dieser Kreise setzt voraus, dass die Verantwortlichen regelmäßig mit dem Quartiersmanagement in Austausch treten. Dieser Austausch kann beispielsweise durch die Teilnahme an Besprechungen oder kollegiale Beratung erfolgen. Eine gemeinsame Planung der Termine sowie eine koordinierte Veröffentlichung der Termine in den Medien und der Öffentlichkeitsarbeit des Quartiers sind erforderlich. Seniorenkreise erhalten eine pauschale Förderung von bis zu 2.000 € pro Jahr. Eine Abstufung wird auf der Grundlage der Häufigkeit der Treffen vorgenommen. Die Zahl der Teilnehmer:innen soll einer Gruppengröße von mindestens 6 Senior:innen entsprechen. | Anzahl Treffen | Fördersumme | |---|---| | ≥ 10 Treffen | 750 € | | ≥ 20 Treffen | 1.250 € | | ≥ 46 Treffen | 2.000 € |$content$::text)
);

-- ──────────────────────────────────────────────────────────────────
-- 3) Pfade für die 5 children unter 2.3 setzen — damit der
--    Halluzinations-Validator Refs "AHP 2.3.1" .. "AHP 2.3.5"
--    auflösen kann.
--    Aktuell: alle haben path="".
-- ──────────────────────────────────────────────────────────────────

update apl2.ahp_doctree set tree_jsonb = jsonb_set(tree_jsonb, '{children, 1, children, 2, children, 0, path}', '"2.3.1"'::jsonb);
update apl2.ahp_doctree set tree_jsonb = jsonb_set(tree_jsonb, '{children, 1, children, 2, children, 1, path}', '"2.3.2"'::jsonb);
update apl2.ahp_doctree set tree_jsonb = jsonb_set(tree_jsonb, '{children, 1, children, 2, children, 2, path}', '"2.3.3"'::jsonb);
update apl2.ahp_doctree set tree_jsonb = jsonb_set(tree_jsonb, '{children, 1, children, 2, children, 3, path}', '"2.3.4"'::jsonb);
update apl2.ahp_doctree set tree_jsonb = jsonb_set(tree_jsonb, '{children, 1, children, 2, children, 4, path}', '"2.3.5"'::jsonb);

-- Verifikation: 4 von Stellen müssen die korrekten Werte enthalten.
do $$
declare
  t jsonb;
  fb2_check text;
  sen_check text;
  pfad_check text;
begin
  select tree_jsonb into t from apl2.ahp_doctree order by built_at desc limit 1;

  fb2_check := t #>> '{children, 1, children, 1, content}';
  if fb2_check not like '%3.500 €%' or fb2_check like '%5.500 €%' then
    raise exception 'Migration 050: section 2.2 enthält noch alte Werte. Inhalt: %', left(fb2_check, 500);
  end if;

  sen_check := t #>> '{children, 1, children, 2, children, 3, content}';
  if sen_check not like '%≥ 46 Treffen%' or sen_check like '%12-24%' then
    raise exception 'Migration 050: section 2.3.4 enthält noch alte Werte. Inhalt: %', left(sen_check, 500);
  end if;

  pfad_check := t #>> '{children, 1, children, 2, children, 3, path}';
  if pfad_check != '2.3.4' then
    raise exception 'Migration 050: Pfad für 2.3.4 nicht gesetzt. Wert: %', pfad_check;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
