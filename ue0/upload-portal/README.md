# UE0 — PDF-Upload-Portal mit KI-OCR

> **Reifegradstufe 0**: Der Bürger füllt das offizielle Original-Antrags-PDF wie gewohnt aus (am Computer oder per Hand) und lädt es hier hoch. Ein KI-gestützter Workflow extrahiert die Felder automatisch via **Claude Vision OCR** — auch handschriftlich Ausgefülltes — und schreibt sie ins gemeinsame Antragsbackend, aus dem UE2 und UE3 lesen. **Gleiche Datenquelle wie UE1, andere Eingabemethode.**

## Konzept

```
[Bürger] ──upload──> [Edge Function `upload-antragspdf`]
                          ├── speichert PDF in Storage-Bucket
                          └── erzeugt Tracking-Eintrag (antrag_einreichung)
                                  │
[Bürger sieht Status-Seite mit Spinner, pollt alle 3 s]
                                  │
                          [DB-Trigger NOTIFY → n8n-Webhook]
                                  ↓
                     [n8n-Workflow]
                          ├── lädt PDF aus Storage
                          ├── sendet an Anthropic Claude Vision (mit
                          │   Handschrift-Hinweis + JSON-Schema-Prompt)
                          ├── parst Antwort, ergänzt Defaults
                          ├── INSERT apl2.antraege
                          └── UPDATE antrag_einreichung: status=fertig
                                  ↓
[Bürger sieht Antragsnummer + Vorschau der extrahierten Felder]
                                  ↓
[Sachbearbeitung in UE2/UE3 sieht den neuen Antrag in der Inbox]
```

## Komponenten in diesem Repo

| Pfad | Beschreibung |
|---|---|
| `ue0/upload-portal/` | Vite/TS-Frontend (dieses Verzeichnis) |
| `ue0/demo-pdfs/` | Zwei ausgefüllte Demo-Anträge (siehe unten) + Generator-Script |
| `supabase/migrations/047_ue0_pdf_einreichung.sql` | Storage-Bucket, Tracking-Tabelle, RLS, DB-Trigger |
| `supabase/functions/upload-antragspdf/` | Edge Function (Validierung + Storage-Upload + Tracking-Insert) |
| `supabase/webhooks/n8n-ue0-pdf-ocr.json` | n8n-Workflow zum Import |
| `.github/workflows/deploy-ue0.yml` | Auto-Deploy nach GH Pages |

## Setup (einmalig)

### 1) GitHub-Secrets

Im Repo unter Settings → Secrets and variables → Actions:
- `VITE_SUPABASE_URL` = `https://supabase.butscher.cloud`
- `VITE_SUPABASE_ANON_KEY` = anon-key der Supabase-Instanz

(Sind bereits gesetzt für UE1 — UE0 nutzt dieselben.)

### 2) n8n-Workflow importieren

```bash
# Auf der VPS, in der n8n-UI:
# Workflows → Import → from File → supabase/webhooks/n8n-ue0-pdf-ocr.json
# Webhook-URL kopieren (z.B. https://n8n.butscher.cloud/webhook/ue0-antragspdf)
```

### 3) DB-Setting für den Trigger

```sql
alter database postgres
  set app.n8n_ue0_webhook = 'https://n8n.butscher.cloud/webhook/ue0-antragspdf';
```

(Setting wird vom Trigger `trg_notify_n8n_on_pdf_einreichung` gelesen — siehe Migration 047.)

### 4) Edge Function deployen

```bash
scp -r supabase/functions/upload-antragspdf vps:/tmp/
ssh vps "sudo cp -r /tmp/upload-antragspdf /root/supabase/docker/volumes/functions/ \
  && docker restart supabase-edge-functions"
```

### 5) Demo-PDFs erzeugen (optional)

```bash
uv run --with reportlab python3 ue0/demo-pdfs/generate.py
```

Erzeugt zwei PDFs in `ue0/demo-pdfs/`:
- `demo-antrag-pfarrei-st-albert.pdf` — maschinell ausgefüllt
- `demo-antrag-buergerverein-handschrift.pdf` — Handschrift-anmutende Font (Demo für „auch Handschrift lesbar")

## Lokal entwickeln

```bash
cd ue0/upload-portal
npm install
echo "VITE_SUPABASE_URL=https://supabase.butscher.cloud" > .env.local
echo "VITE_SUPABASE_ANON_KEY=<key>" >> .env.local
npm run dev
# http://localhost:5174
```

## Architektur-Entscheidungen

- **GH Pages statt VPS-Container**: konsistent zu UE1. Frontend ist statisch, alle Verarbeitung läuft asynchron über Supabase + n8n.
- **Storage-Bucket private**: nur service_role (Edge Function + n8n) darf read/write. Anon-User können das Original-PDF nach Upload nicht mehr abrufen — DSGVO-konform.
- **Tracking-UUID statt Session-Cookie**: Bürger bekommt einen unguessable Status-Link, der per Bookmark/Refresh wiederaufrufbar bleibt. Keine Auth nötig.
- **Anthropic Claude Vision für OCR**: liest auch Handschrift zuverlässig. LM Studio (lokales LLM, siehe UE3 Compliance-Statusseite) wäre eine Alternative, ist aber für Vision-Tasks lokal noch nicht so stark.
- **JSON-Schema im Prompt**: Claude erhält ein striktes Schema mit `null`-Defaults für fehlende Felder — vermeidet Halluzinationen bei leeren Feldern.

## Rechtlicher Hinweis

Das GUI orientiert sich optisch lose am Original-Auftritt der Stadt Würzburg
(wuerzburg.de/rathaus/formularcenter), ist aber **kein offizielles Angebot**:

- Eigener Disclaimer im Footer („Demo-Webseite für Lehrzwecke")
- Kein offizielles Stadt-Würzburg-Logo (eigenes SVG-Wappen, generisch)
- Eigene Domain (GitHub Pages, nicht wuerzburg.de)
- Hochgeladene Dokumente werden nach Vorlesungsende gelöscht
