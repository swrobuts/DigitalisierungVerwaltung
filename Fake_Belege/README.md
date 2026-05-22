# Fake_Belege — Test-Pakete für UE3 Prüfungs-Pipeline

Generator: `python generate.py` (idempotent, deterministische UUIDs).

## Pakete

| # | Slug | Träger | Erwartetes Prüfergebnis | Layer |
|---|---|---|---|---|
| 1 | `01_pfarrei-st-albert` | Pfarrei St. Albert Heidingsfeld | ✅ sauber — nur IBAN-Manuell-Hinweis (AHP 3.6) | Negativ-Kontrolle |
| 2 | `02_buergerverein-frauenland` | Bürgerverein Frauenland e.V. | ✅ sauber — Räume unentgeltlich, nur IBAN-Manuell-Hinweis (AHP 3.6) | Negativ-Kontrolle #2 |
| 3 | `03_awo-heidingsfeld` | AWO-Begegnungsstätte Heidingsfeld | 🟡 Layer-A-Verstoß: IBAN mod-97-ungültig (Bezug AHP 3.6) | A |
| 4 | `04_caritas-versbach` | Caritas-Tagestreff Versbach | ✅ sauber — 1 Öffnungstag/Wo ist auffällig, aber AHP nennt keine Mindestzahl | Negativ-Kontrolle #3 |
| 5 | `05_diakonie-sanderau` | Diakonie-Treff Sanderau | ✅ sauber — Bingo/Tupperware sind in AHP nicht explizit verboten (vgl. fraud_notes) | Lehrbeispiel: Lücke der Rechtsgrundlage |
| 6 | `06_senioren-aktiv-gmbh` | "Senioren-aktiv GmbH" (Fraud-Multi) | 🔴 Multi-Verstoß: IBAN ungültig, Sitz nicht in Würzburg, Antragsfrist (1.4.) verpasst | A + B (Sitz, Frist) |

## Verwendung

1. `Fake_Belege/.venv/bin/python generate.py` → erzeugt PDFs + `seed.sql`
2. `seed.sql` gegen Datenbank einspielen (truncate apl2.antraege ist Voraussetzung — Status `eingegangen`):
   ```bash
   ssh vps "docker exec -i supabase-db psql -U supabase_admin -d postgres" < seed.sql
   ```
3. GUI öffnen: https://amt-ki.butscher.cloud → 6 Anträge sichtbar → "Antrag prüfen" je Paket.

## Erwartete Befunde (nach Migration 024 — Ontologie aus echter AHP abgeleitet)

| # | Verstöße | Hinweise | Details |
|---|---|---|---|
| 1 Pfarrei St. Albert | 0 | 1 | nur IBAN-Manuell-Hinweis (AHP 3.6) |
| 2 Bürgerverein Frauenland | 0 | 1 | nur IBAN-Hinweis |
| 3 AWO Heidingsfeld | 1 | 1 | Layer-A IBAN-mod-97-Verstoß + IBAN-Hinweis |
| 4 Caritas Versbach | 0 | 1 | nur IBAN-Hinweis (1 Öffnungstag ist auffällig, aber kein AHP-Verstoß) |
| 5 Diakonie Sanderau | 0 | 1 | nur IBAN-Hinweis (Bingo/Tupperware sind in AHP nicht explizit verboten) |
| 6 Senioren-aktiv GmbH | 3 | 1 | IBAN ungültig + verfristet (AHP 3.3) + Sitz nicht Würzburg (AHP 3.1) |

### Aktive Ontologie-Regeln (alle mit AHP-Bezug)

| Regel | AHP-Bezug | Schwere |
|---|---|---|
| `traeger_sitz_wuerzburg` | 3.1 Antragsberechtigt | verstoss |
| `antragsfrist_1_april` | 3.3 Antragsfristen | verstoss |
| `mindestens_eine_kostenposition` | 2.4 Förderbereich IV / 3.2 b) | verstoss |
| `iban_auf_traegerkonto_pruefen` | 3.6 Auszahlung | hinweis (always-fire) |
| `haushaltsjahr_plausibel` | 3.7 Rechnungslegung | hinweis |

### Lehrwert der Pakete #4 + #5

Beide Pakete enthalten Auffälligkeiten, die ursprünglich als Layer-B/Layer-C-Verstöße
konstruiert waren — sich aber nach Abgleich mit der echten AHP-Richtlinie als **nicht
durch eine Rechtsnorm gedeckte Annahmen** herausgestellt haben:
- Caritas: 78.000 € Personalkosten bei 1 Wochentag-Öffnung — auffällig, aber AHP nennt
  keine Personalkosten-Grenze oder Mindest-Öffnungstage
- Diakonie: Bingo mit Geldgewinnen, Tupperware-Verkauf — semantisch fragwürdig, aber
  AHP 2025-03-27 enthält keine Programminhalt-Verbote

Das ist das pädagogische Lehrbeispiel: nicht jede Auffälligkeit ist ein Verstoß.
Layer C ist hier ehrlich (0 Befunde) statt willkürlich.

## Hinweis

Alle Namen, Adressen, IBAN-Empfänger, Steuernummern sind erfunden.
Die Pakete dienen ausschließlich der KI-Prüfungs-Validierung in Lehrkontext UE3.
