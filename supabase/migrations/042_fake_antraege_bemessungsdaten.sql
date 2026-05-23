-- 042_fake_antraege_bemessungsdaten.sql
--
-- Ergänzt die FAKE-Demo-Anträge (APL2-2026-FAKE-002 bis -006) um die
-- AHP-2.3-Bemessungsfelder, die nach dem UE1-Step-4-Refactor jetzt
-- Pflicht-Antragsfelder sind. FAKE-001 hat schon vollständige Werte
-- und bleibt unangetastet.
--
-- WICHTIG zur Methodik:
--   - Die Werte sind erfunden, aber plausibel (Größenordnung typischer
--     Würzburger Begegnungszentren). Im SQL-Kommentar pro Antrag steht
--     die Annahme, damit Nachprüfung leicht ist.
--   - Diese Migration berührt NUR Anträge mit antragsnummer LIKE
--     'APL2-2026-FAKE-%' — echte Anträge sind safe.
--   - Die `geforderte_foerdersumme_euro` bleibt unverändert; die Anteils-
--     Werte sind so gewählt, dass die anteilige Höchstauszahlung
--     (10.000 € × Anteil) zu unterschiedlichen Bewilligungs-Szenarien
--     führt (volle Bewilligung, anteilige Reduktion). Das macht die
--     Demo der KI-Prüfung wertvoller.

begin;

-- FAKE-002 — Senioren-Stammtisch Frauenland (Bürgerverein)
-- Annahme: kleiner Stammtisch, hoher Würzburger-Anteil (Stadtteil-
-- gebunden), wöchentlich, fast ausschließlich Stadtbewohner.
update apl2.antraege
   set anzahl_teilnehmer       = 45,
       anzahl_treffen_jahr     = 36   -- 3 pro Monat × 12
 where antragsnummer = 'APL2-2026-FAKE-002';

-- FAKE-003 — AWO-Begegnungsstätte Heidingsfeld
-- Annahme: etablierte AWO-Stätte mit hoher Aktivität, fast jede Woche
-- mehrere Angebote, dominant Würzburger Teilnehmer (Stadtteil).
update apl2.antraege
   set anzahl_teilnehmer       = 65,
       anzahl_treffen_jahr     = 52
 where antragsnummer = 'APL2-2026-FAKE-003';

-- FAKE-004 — Caritas-Tagestreff Versbach
-- Annahme: kleine Einrichtung (12 reg. Teilnehmer), Versbach mit gut
-- 65 % Würzburger Stadtbewohner-Anteil (Pendler-Anteil aus dem Land-
-- kreis). foerderbereich ist 'seniorenkreise' — der Anteil ist hier
-- formal nicht ausschlaggebend, wird trotzdem gepflegt.
update apl2.antraege
   set stadtbewohner_anteil    = 0.650
 where antragsnummer = 'APL2-2026-FAKE-004';

-- FAKE-005 — Diakonie-Treff Sanderau
-- Annahme: mittlere Diakonie-Einrichtung, gemischtes Programm.
update apl2.antraege
   set anzahl_teilnehmer       = 28,
       anzahl_treffen_jahr     = 40
 where antragsnummer = 'APL2-2026-FAKE-005';

-- FAKE-006 — Senioren-aktiv GmbH (Treffpunkt Würzburg)
-- Annahme: größter Träger mit zentral gelegenem Treffpunkt, daher
-- viele Teilnehmer und HOHE Aktivität, ABER niedriger Stadtbewohner-
-- Anteil (55 %), weil zentral und gut erreichbar auch fürs Umland.
-- Folge: die anteilige Höchstauszahlung (10.000 × 55 % = 5.500 €)
-- liegt unter der geforderten Summe — guter Demo-Fall für die
-- KI-Empfehlung „reduzierte Bewilligung".
update apl2.antraege
   set anzahl_teilnehmer       = 80,
       stadtbewohner_anteil    = 0.550,
       anzahl_treffen_jahr     = 65
 where antragsnummer = 'APL2-2026-FAKE-006';

-- Kontroll-Ausgabe (nur sichtbar bei psql-Interactive-Run)
do $$
declare
  fehlend int;
begin
  select count(*) into fehlend
    from apl2.antraege
   where antragsnummer like 'APL2-2026-FAKE-%'
     and (anzahl_teilnehmer is null
          or stadtbewohner_anteil is null
          or anzahl_treffen_jahr is null);
  if fehlend > 0 then
    raise notice 'Migration 042: % FAKE-2026-Anträge haben weiterhin NULL-Bemessungsfelder', fehlend;
  else
    raise notice 'Migration 042: Alle FAKE-2026-Anträge haben vollständige Bemessungsdaten';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
