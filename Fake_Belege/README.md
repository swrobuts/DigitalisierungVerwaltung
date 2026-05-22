# Fake_Belege — Test-Pakete für UE3 Prüfungs-Pipeline

Generator: `python generate.py` (idempotent, deterministische UUIDs).

## Pakete

| # | Slug | Träger | Erwartetes Prüfergebnis | Layer |
|---|---|---|---|---|
| 1 | `01_pfarrei-st-albert` | Pfarrei St. Albert Heidingsfeld | ✅ sauber | Negativ-Kontrolle |
| 2 | `02_buergerverein-frauenland` | Bürgerverein Frauenland e.V. | ✅ sauber (unentgeltlich) | Negativ-Kontrolle #2 |
| 3 | `03_awo-heidingsfeld` | AWO-Begegnungsstätte Heidingsfeld | 🟡 Layer-A-Verstoß: IBAN ungültig | A |
| 4 | `04_caritas-versbach` | Caritas-Tagestreff Versbach | 🟡 Layer-B-Verstoß: Personalkosten/Öffnungstag unplausibel | B |
| 5 | `05_diakonie-sanderau` | Diakonie-Treff Sanderau | 🟡 Layer-C-Verstoß: Programminhalte nicht förderfähig | C |
| 6 | `06_senioren-aktiv-gmbh` | "Senioren-aktiv GmbH" (Fraud-Multi) | 🔴 Multi-Layer: GmbH statt gemeinnützig, IBAN ungültig, dünner Wochenplan | A + B + C |

## Verwendung

1. `Fake_Belege/.venv/bin/python generate.py` → erzeugt PDFs + `seed.sql`
2. `seed.sql` gegen Datenbank einspielen (truncate apl2.antraege ist Voraussetzung — Status `eingegangen`):
   ```bash
   ssh vps "docker exec -i supabase-db psql -U supabase_admin -d postgres" < seed.sql
   ```
3. GUI öffnen: https://amt-ki.butscher.cloud → 6 Anträge sichtbar → "Antrag prüfen" je Paket.

## Test-Erwartungen pro Layer

### Layer A (strukturell)
- **#3 AWO Heidingsfeld**: IBAN ungültig (mod-97-Check schlägt fehl)
- **#6 Senioren-aktiv GmbH**: IBAN ungültig

### Layer B (Ontologie / JSON-Logic)
- **#4 Caritas Versbach**: `plausible_personalkosten` (78.000 € bei 52 Öffnungstagen)
- **#6 Senioren-aktiv GmbH**: `plausible_personalkosten` + ggf. weitere

### Layer C (RAG via Claude, AHP-Richtlinie)
- **#5 Diakonie Sanderau**: Bingo mit Geldgewinnen, Tupperware-Verkauf, kommerzielle Inhalte
- **#6 Senioren-aktiv GmbH**: GmbH statt gemeinnützig, Kapitalanlage-Vermittlung, Selbstkontrahierung

## Hinweis

Alle Namen, Adressen, IBAN-Empfänger, Steuernummern sind erfunden.
Die Pakete dienen ausschließlich der KI-Prüfungs-Validierung in Lehrkontext UE3.
