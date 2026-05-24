# UE0 — Demo-PDFs für die KI-OCR-Upload-Pipeline

Die hier liegenden PDFs werden auf https://lve.butscher.cloud/ue0
(bzw. dem Upload-Portal unter `ue0/upload-portal/`) hochgeladen und
demonstrieren die Reifegradstufe 0 (Bürger lädt ausgefüllte
Original-Formulare hoch → Claude Vision extrahiert).

## Generierung

```bash
uv run --with reportlab python3 ue0/demo-pdfs/generate.py
```

Datenquelle: dicts `PFARREI` und `BUERGERVEREIN` in `generate.py`.
Beide entsprechen den DB-Datensätzen `APL2-2026-FAKE-001` resp.
`APL2-2026-FAKE-002`.

## Dateien

| Datei | Träger | Modus | Inhalt |
|---|---|---|---|
| `demo-antrag-pfarrei-st-albert.pdf` | Kath. Kirchenstiftung St. Albert | maschinell | Hauptantrag (Layout angelehnt an `materialien/antrag-apl2.pdf`) |
| `demo-antrag-buergerverein-handschrift.pdf` | Bürgerverein Frauenland e.V. | Handschrift-Font | Hauptantrag (Demo „auch handschriftlich lesbar") |
| `demo-anlage1-pfarrei-st-albert.pdf` | Kath. Kirchenstiftung St. Albert | maschinell | Anlage 1 (Wochenplan; Layout an `materialien/anlage-antrag-apl2.pdf`) |
| `demo-anlage1-buergerverein-handschrift.pdf` | Bürgerverein Frauenland e.V. | Handschrift-Font | Anlage 1 (Wochenplan) |

## Nutzung im Upload-Portal

Im Upload-Portal kann pro Einreichung jetzt **zwei** PDFs hochgeladen werden:

1. **Hauptantrag** (Pflicht) — z.B. `demo-antrag-pfarrei-st-albert.pdf`
2. **Anlage 1** (optional) — z.B. `demo-anlage1-pfarrei-st-albert.pdf`

Der n8n-Workflow verarbeitet beide separat und schreibt die
extrahierten Wochenplan-Zeilen aus der Anlage 1 in
`apl2.oeffnungszeit`.

## Hinweis

Alle Personen-, Bank-, Telefondaten sind erfunden („…Test").
Verwendung nur zu Demo-/Lehrzwecken THWS.
