# TODO — Phase 6: n8n-Workflow für Multi-FB-OCR

> **Status 2026-05-25 (vor VL):** UE0-Frontend + Edge Function schreiben FB-spezifische
> Einreichungen in `apl.antrag_einreichung`. Der n8n-Workflow ist noch der alte
> Single-FB-Stand (`supabase/webhooks/n8n-ue0-pdf-ocr.json`, FB-II-only Wochenplan-OCR,
> Schema `apl2`). Für die VL morgen reicht **simpler Fall**: alle Uploads bleiben mit
> `status='wartend'` in der Tabelle stehen, manuelles Pull-Down folgt später.
>
> Diese Datei beschreibt das Ziel-Workflow-Konzept für die Nachpflege.

## Ziel-Architektur

```
Webhook (Supabase NOTIFY apl.notify_n8n_on_pdf_einreichung)
   │  payload: { einreichung_id, storage_path, dateiname, groesse_bytes }
   ▼
Set status = "in_verarbeitung"
   │  PATCH apl.antrag_einreichung
   ▼
PDF aus Storage holen (antragseingang-pdf/<storage_path>)
   ▼
Wenn erkannter_fb IS NULL → Klassifikation aufrufen
   │  POST https://pruefung.butscher.cloud/api/klassifiziere-pdf
   │  PATCH apl.antrag_einreichung SET erkannter_fb = …
   ▼
Switch (erkannter_fb)
   ├── "I"   → Branch-FB-I-OCR    (Pflichtfelder: projekt_titel, personalkosten_euro, sachkosten_euro)
   ├── "II"  → Branch-FB-II-OCR   (Pflichtfelder: ehrenamt_titel, anzahl_helfer_vorjahr, gesamt_helferstunden_vorjahr)
   │          + falls extrahiert_jsonb.anlagen[].slot_typ == "helferliste":
   │            POST /api/extrahiere-helferliste  →  apl.fb_ii_helfer-Rows
   ├── "III" → Branch-FB-III-OCR  (Variante aus extrahiert_jsonb.variante)
   │          + variantenspezifische Detail-Tabellen apl.fb_iii_*_detail
   └── "IV"  → Branch-FB-IV-OCR   (vorhaben_titel, kurzbeschreibung, geplante_massnahmen)
   ▼
INSERT apl.antraege + Detail-Tabellen + apl.anlagen (Storage-Pfade aus extrahiert_jsonb.anlagen)
   ▼
PATCH apl.antrag_einreichung
   SET antrag_id = <neu>,
       status = "fertig",
       extrahiert_jsonb = <vollständig>,
       verarbeitet_am = now()
```

## Prompt-Skelette pro FB

Pro FB-Branch ein Claude-Vision-Call mit FB-spezifischem JSON-Schema-Prompt. Das
existierende `pruefung/src/pruefung/klassifiziere_pdf.py` zeigt das Muster:
hartes Validieren der LLM-Ausgabe gegen bekannte Felder, kein Erraten.

Vorhandene Backend-Endpoints, die der Workflow nutzen kann:

| FB / Slot                 | Endpoint                                              |
|---------------------------|-------------------------------------------------------|
| Klassifikation            | `POST /api/klassifiziere-pdf`                         |
| FB II Helferliste OCR     | `POST /api/extrahiere-helferliste`                    |
| FB II Helferliste Excel   | `POST /api/import-excel-schablone`                    |
| FB I/III/IV Hauptantrag   | _noch zu bauen_ — analog `klassifiziere_pdf.py`       |

## Schema-Bestandteile aus dem Frontend-Upload

Die Edge Function legt diese Felder in `apl.antrag_einreichung` an:

| Feld                | Bedeutung                                                            |
|---------------------|----------------------------------------------------------------------|
| `storage_path`      | Hauptantrag-PDF unter `antragseingang-pdf/YYYY/MM/<uuid>.pdf`        |
| `erkannter_fb`      | `I|II|III|IV` (vom Bürger gewählt ODER Smart-Upload-Klassifizierer)  |
| `extrahiert_jsonb`  | Initial-State: `{variante?: "A|B|C|D", anlagen?: [...]}`             |
| `extrahiert_jsonb.anlagen[]` | `{slot_typ, storage_path, dateiname, groesse_bytes, mime}` |

n8n liest beim Start beides aus, dispatcht im Switch, mergt die OCR-Ergebnisse
in `extrahiert_jsonb` rein (Variante + Anlagen-Pfade behalten, fachliche Felder ergänzen).

## Simpler-Fall-Übergang (heute)

Falls Phase 6 noch nicht ausgerollt ist:

1. Workflow `n8n-ue0-pdf-ocr` deaktivieren oder unverändert lassen.
2. Bürger sieht in der UE0-Status-Page „wartend"-Spinner bis Timeout (5 min)
   → Fehler-Card mit Kontakt-Hinweis.
3. Sachbearbeitung kann via SQL-Direktzugriff oder UE3-Inbox die wartenden
   Einreichungen sehen (`select * from apl.antrag_einreichung where status='wartend'`)
   und manuell weiterverarbeiten.

## Aufwandschätzung

- Switch-Knoten + 4 OCR-Branches: ~2-3 h pro FB für Prompt + JSON-Mapping
- Detail-Tabellen-Insert-Logik je FB: ~1-2 h
- Test mit echten PDFs aus `Fake_Belege/` / `ue0/demo-pdfs/`: ~1 h pro FB
- **Gesamt:** ~1-2 Tage solide Arbeit
