---
marp: true
theme: default
paginate: true
header: "UE0 · PDF-Upload mit KI-OCR · Reifegradstufe 0"
footer: "Fallstudie AHP Würzburg · Dr. Robert Butscher · THWS"
style: |
  section { font-family: 'Inter', system-ui, sans-serif; }
  h1, h2, h3 { color: #4A4A4A; }
  .accent { color: #AD0E36; font-weight: 600; }
  .pill { display: inline-block; padding: 4px 12px; border-radius: 999px;
          background: #AD0E36; color: white; font-size: 14px;
          letter-spacing: 0.06em; font-weight: 600; }
  blockquote { border-left: 4px solid #AD0E36; background: #FBE9EE;
               padding: 12px 20px; }
---

<!-- _class: lead -->

<span class="pill">REIFEGRADSTUFE 0</span>

# PDF-Upload mit KI-OCR

**Vom E-Mail-Anhang zur strukturierten Erfassung — ohne dass
Bürger:innen etwas Neues lernen müssen.**

<small>Fallstudie AHP Würzburg · Modul Innovationsmanagement BBA · Dr. Robert Butscher · 2026</small>

<!-- Speaker-Notiz: „Weicher Einstieg" in die Digitalisierung —
fast jede Verwaltung kann das sofort hochziehen, ohne ein Formular
zu bauen. -->

---

## Lernziele

Nach dieser UE können Sie:

1. **Wissen** — den Unterschied zwischen Mail-PDF-Prozess und
   strukturiertem Upload benennen.
2. **Verstehen** — wie KI-Vision-OCR ein PDF in strukturierte
   JSON-Daten überführt (Schema-Forcing).
3. **Anwenden** — den Datenfluss Upload → Storage → n8n → Vision-OCR →
   DB im Code lokalisieren.
4. **Beurteilen** — Chancen und Grenzen der Stufe gegenüber UE1
   (Webformular) gegeneinander abwägen.

---

## Ausgangslage — der PDF-Mail-Prozess heute

1. Bürger:in lädt das offizielle Antrags-PDF herunter
2. Füllt es am Computer oder handschriftlich aus
3. Scannt es, hängt es an eine Mail, schickt sie ans Amt
4. Mensch im Amt druckt die Mail aus, heftet sie ab
5. Mensch im Amt tippt die Felder ins Fachverfahren ab

> **Das ist kein exotischer Sonderfall — das ist der Mainstream
> in deutschen Ämtern 2026.**

---

## Problemstellung

| Schmerzpunkt | Wirkung |
|---|---|
| Doppelte Erfassung (Bürger + Amt) | Zeit, Geld, Fehlerrisiko |
| Zahlendreher beim Abtippen (IBAN!) | falsche Auszahlungen |
| Unleserliche Handschrift | Rückfragen, Verzögerung |
| Fehlende Anlagen unbemerkt | Antrag liegt wochenlang |
| Kein Status für Bürger:in | „warte ich noch?" |
| Posteingang nicht durchsuchbar | Vorgang verschollen |

> **Kernproblem:** Das PDF ist tot. Es transportiert Daten als Bild,
> nicht als Daten.

---

## Reifegradmodell — wo wir stehen

| Stufe | Was neu ist | Bürger | Amt |
|---|---|---|---|
| **UE0** (jetzt) | **PDF-Upload + KI-OCR** | **=** | **↓↓** |
| UE1 | Strukturiertes Webformular | ↑ | ↓↓↓ |
| UE2 | Sachbearbeiter-Inbox (manuell) | = | ↓ |
| UE3 | KI-Empfehlung (Mensch entscheidet) | = | ↓↓↓ |
| UE4 | Konversationeller Agent | ↓↓ | ↓↓↓ |

> UE0 ist der „weiche Einstieg" — keine neue Bürger:innen-Logik nötig.

---

## Herangehensweise

**Idee:** Das PDF bleibt, aber wir lesen es maschinell aus.

1. Bürger:in lädt das ausgefüllte PDF hoch (kein neues Formular)
2. KI-Vision liest jedes Feld und bestätigt im Webformular (UE1)
3. Bürger:in korrigiert nur, was nicht stimmt
4. Antrag wird strukturiert eingereicht — das Amt tippt nichts mehr ab

> **Didaktischer Kniff:** Trennung von *Eingang* (UE0) und
> *strukturiertem Antrag* (UE1) — die KI ist die Brücke.

---

## Tech-Stack & Tools

| Komponente | Wahl | Begründung |
|---|---|---|
| Frontend | Vite 6 + React 19 + TS 5 + Tailwind 4 | schnellster DX, kleines Bundle (~80 kB gzipped) |
| Upload-Endpoint | Supabase Edge Function (Deno) | nah am Storage, signed-URL-Erzeugung, kein eigener Server |
| Objektspeicher | Supabase Storage (S3-kompatibel) | RLS-fähig, signed URLs out-of-the-box |
| Trigger | `pg_notify` + Database Webhook | Push statt Polling — Latenz < 200 ms |
| Workflow-Engine | n8n (self-hosted, 11 Nodes) | visuelle Pipeline, Fehler-Branches, Retry |
| Vision-LLM | Claude Sonnet 4.5 (`messages.create` mit `image`) | beste OCR-Qualität für deutsche Formulare + Handschrift |
| DB | Postgres 15 mit RLS | Single Source of Truth für `apl.antrag_einreichung` |

---

## Architektur

```
[Bürger:in / Browser]
   │
   │  POST /functions/v1/upload-antragspdf  (multipart, JWT-anon)
   ▼
┌─────────────────────────────────────────┐
│ Edge Function "upload-antragspdf"       │
│  - MIME-Check  (application/pdf)        │
│  - Size-Limit  (≤ 10 MB)                │
│  - SHA-256 Hash → datei_path            │
│  - PUT Storage-Bucket "einreichungen"   │
│  - INSERT apl.antrag_einreichung        │
└─────────────────────────────────────────┘
   │ pg_notify "einreichung_neu"
   ▼
┌─────────────────────────────────────────┐
│ Supabase Database Webhook → n8n          │
└─────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────┐
│ n8n Workflow "ue0-ocr-pipeline"         │
│  1. signed-URL holen                    │
│  2. PDF → Claude Vision (JSON-Schema)   │
│  3. Output parsen + validieren          │
│  4. UPDATE apl.antrag_einreichung       │
│     SET extrahiert_jsonb = …            │
└─────────────────────────────────────────┘
   │
   ▼
[Frontend pollt GET status alle 2 s]
   │   wenn status='fertig':
   ▼
[Redirect → antrag.butscher.cloud/?prefill=<id>]
```

---

## Sequenz-Diagramm

```
Browser              Edge Fn         Storage    Postgres       n8n            Claude
   │                    │              │           │             │              │
 1 │── POST upload ────▶│              │           │             │              │
 2 │                    │── PUT pdf ──▶│           │             │              │
 3 │                    │── INSERT einreichung ───▶│             │              │
 4 │◀─── 201 + id ──────│              │           │             │              │
 5 │                    │              │           │── webhook ─▶│              │
 6 │                    │              │           │             │── signed_url▶│ (Storage)
 7 │                    │              │           │             │◀─ pdf bytes ─│
 8 │                    │              │           │             │── messages.create(image) ─▶│
 9 │                    │              │           │             │◀─── JSON-Schema-Response ──│
10 │                    │              │           │◀─ UPDATE ───│              │
11 │── GET status (Poll, ≤ 2 s) ──────────────────▶│             │              │
12 │◀── status='fertig', extrahiert_jsonb ─────────│             │              │
13 │── Redirect ?prefill=<id> ─────────────────▶ UE1 Webformular                │
```

<!-- Speaker-Notiz: Schritt 8 ist der eigentliche „KI-Moment".
Claude bekommt das PDF als base64-encodiertes Bild und einen
JSON-Schema-Prompt. -->

---

## Datenmodell

```sql
-- Migration 060: apl.antrag_einreichung (UE0-Eingang)
CREATE TABLE apl.antrag_einreichung (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  datei_path    TEXT NOT NULL,           -- Storage-Pfad
  datei_hash    TEXT NOT NULL,           -- SHA-256 (Dedup)
  status        TEXT NOT NULL            -- 'eingegangen' | 'in_ocr' |
                  CHECK (status IN ('eingegangen','in_ocr',
                                    'fertig','fehler')),
  extrahiert_jsonb JSONB,                -- KI-Output, validiert
  fehlermeldung TEXT,
  eingereicht_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  abgeholt_am   TIMESTAMPTZ
);

CREATE INDEX ON apl.antrag_einreichung (status, eingereicht_am DESC);

-- RLS: anon kann INSERT, nicht SELECT (DSGVO)
ALTER TABLE apl.antrag_einreichung ENABLE ROW LEVEL SECURITY;
CREATE POLICY ins_anon ON apl.antrag_einreichung
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY sel_self ON apl.antrag_einreichung
  FOR SELECT TO anon USING (id::text = current_setting(
    'request.jwt.claim.einreichung_id', true));

-- Storage-Bucket "einreichungen"
INSERT INTO storage.buckets (id,name,public) VALUES
  ('einreichungen','einreichungen', false);
```

---

## Kern-Mechanismus — Schema-Forcing bei Claude Vision

```python
# n8n-Node "claude-ocr" (Python-Function)
response = anthropic.messages.create(
    model="claude-sonnet-4-5-20250929",
    max_tokens=2048,
    system="""Extrahiere aus dem PDF folgende Felder als JSON,
strikt diesem Schema folgend:
{
  "fb":             "I"|"II"|"III"|"IV",
  "antragsteller":  {"name": str, "ansprechpartner": str,
                     "telefon": str, "email": str},
  "adresse":        {"strasse": str, "plz": str, "ort": str},
  "bank":           {"iban": str, "bic": str, "name": str},
  ...
}

REGELN:
1. Wenn ein Feld nicht erkennbar ist: leerer String "" — NICHT raten.
2. IBAN bitte ohne Leerzeichen, Großbuchstaben.
3. Erfinde keine Felder, die nicht im Schema stehen.
4. Antworte AUSSCHLIESSLICH mit dem JSON, kein Fließtext.""",
    messages=[{
        "role": "user",
        "content": [
            {"type": "image", "source": {"type": "base64",
              "media_type": "application/pdf", "data": pdf_b64}},
            {"type": "text", "text": "Hier ist der Antrag."}
        ]
    }]
)
extrahiert = json.loads(response.content[0].text)
```

**Warum funktioniert das:**
- JSON-Schema im System-Prompt zwingt deterministische Struktur
- „Erfinde nichts" + leere Strings vermeiden Halluzinationen
- Nachgelagerte Validierung (IBAN-Mod-97, FB-Whitelist) fängt Reste

---

## Sicherheits- & Schutzschicht

| Schicht | Mechanismus | Schutz vor |
|---|---|---|
| Upload | MIME-Check `application/pdf`, Magic-Bytes | Malware-Uploads |
| Upload | Größenlimit 10 MB (Edge Function + Nginx) | DoS, Speicher-Overflow |
| Upload | SHA-256-Hash als Dedup-Key | doppelte Speicherung, Anti-Replay |
| Storage | Bucket `public=false` + signed URLs (TTL 10 min) | Direktzugriff, Hot-Linking |
| RLS | `apl.antrag_einreichung` SELECT nur für eigene `id` | DSGVO §5 Datenminimierung |
| Vision-Aufruf | „Erfinde nichts" im System-Prompt | OCR-Halluzination |
| Validierung | IBAN-Mod-97, FB ∈ {I,II,III,IV} nach Parse | KI-Drift |
| AI-Act Art. 13 | UI-Banner „KI liest Ihr Dokument (Anthropic, USA)" | Transparenz-Pflicht |
| AI-Act Art. 50 | „Sonnet 4.5" wird in der Bestätigung genannt | KI-Kennzeichnung |

---

## Performance & Skalierung

| Metrik | Wert | Anmerkung |
|---|---|---|
| Upload-Roundtrip | ~ 350 ms | Edge Function nah am Storage |
| OCR-Latenz (1 Seite) | 8–12 s | Claude Sonnet 4.5 Vision |
| OCR-Latenz (3 Seiten) | 15–25 s | linear mit Seitenzahl |
| Frontend-Poll-Intervall | 2 s | Trade-off UX ↔ DB-Last |
| Kosten pro Antrag | ~ 0,02–0,04 € | Vision-Input dominiert |
| Throughput n8n | 5 OCR / Min (Standard) | bei Bedarf horizontal skalierbar |
| Storage-Footprint | ~ 200 kB ⌀ pro PDF | nach 30 d → Cold-Tier |

**Bottlenecks & Mitigationen:**
- Vision ist serial-blockierend → n8n-Queue mit `concurrency=3`
- PDF > 10 Seiten → Vorabsplitting + chunked OCR
- Anthropic-Outage → Fallback auf Tesseract-OCR (Qualität schlechter)

---

## Live-Demo

🌐 **<https://upload.butscher.cloud/>**

1. Demo-PDF hochladen (`demo-antrag-pfarrei-st-albert.pdf`)
2. Status-Seite mit Live-Spinner beobachten
3. Nach ~15 s Auto-Redirect zu UE1 mit Prefill
4. UE1 zeigt vorausgefüllte Felder → Bürger:in bestätigt

<small>Demo-PDFs im Repo: <code>ue0/demo-pdfs/</code></small>

<!-- Speaker-Notiz: Browser vorher öffnen, Demo-PDF lokal kopiert
haben. Status-Texte während des Uploads laut vorlesen. -->

---

## Chancen

- **Sofort-Einstieg** für jede Verwaltung — keine Formular-Reise nötig
- **Niedrige Lernkurve** für Bürger:innen (PDF kennen sie)
- **Schnelle Entlastung** der Sachbearbeitenden (kein Abtippen)
- **Multi-Tenancy** — gleicher Pipeline-Code für viele Antragsarten
- **Wiederverwendbar** — Pattern für jede „PDF → Daten"-Aufgabe
- **Auditierbar** — Original-PDF bleibt revisionssicher im Storage

---

## Einschränkungen / Grenzen

- Bürger:innen **brauchen weiterhin das PDF** — also Vorwissen, wo es
  zu finden ist
- **Keine Live-Validierung** beim Ausfüllen (Tippfehler erst in UE1
  sichtbar)
- **Keine Mehrsprachigkeit** — das amtliche PDF ist deutsch
- **OCR-Genauigkeit ≠ 100 %** — Handschrift, schlechte Scans schwanken
- Bei schlecht ausgefüllten PDFs erzeugt UE0 ggf. mehr Korrekturlast
  als UE1 nativ

> **Konsequenz:** UE0 macht nur Sinn als **Brücke zu UE1+**.

---

## Voraussetzungen / Risiken

**Technisch:**
- Storage-Bucket mit RLS + signed URLs (10 min TTL)
- Vision-fähiges LLM (Claude Sonnet 4.5 oder GPT-4o)
- n8n oder gleichwertige Workflow-Engine
- Database-Webhook für Push-Trigger

**Organisatorisch:**
- DSFA (Antrags-PDFs an US-Cloud!)
- Klare Aufklärung „Ihre Daten werden von KI gelesen"
- Fallback-Pfad ohne KI muss erhalten bleiben
- AV-Vertrag mit Anthropic / Cloud-Anbieter

**Risiken:**
- OCR-Halluzination → IBAN-Verwechslung → Auszahlung an Falsche
- Mitigation: Bürger:in muss in UE1 jedes Feld bestätigen

---

## Selbstreflexion

> Beantworten Sie für sich diese 4 Fragen:

1. **Macht es für *jedes* Antragsverfahren Sinn, UE0 vor UE1 zu
   schalten — oder gibt es Anti-Patterns?**
2. **Wie würden Sie Bürger:innen den KI-Einsatz transparent
   kommunizieren, ohne Vertrauen zu verlieren?**
3. **Welcher Schritt im Datenfluss ist am riskantesten — und wieso?**
4. **Wenn das OCR ein Feld falsch erkennt: wer haftet — Bürger:in, Amt,
   Cloud-Anbieter, niemand?**

---

## Übungsfragen

**Frage 1:** Was passiert, wenn Claude ein Feld nicht sicher erkennen kann?
<small>(a) Antrag wird abgelehnt · (b) leerer String, Bürger:in
korrigiert · (c) Claude rät · (d) System hängt</small>

**Frage 2:** Welche Komponente erzeugt die `einreichung_id`?
<small>(a) n8n · (b) Frontend · (c) Edge Function · (d) Claude Vision</small>

**Frage 3:** Warum ist UE0 ohne UE1 wenig sinnvoll?
<small>(a) Kosten · (b) ohne Korrekturoberfläche bleiben OCR-Fehler
unentdeckt · (c) Datenschutz · (d) Performance</small>

<!-- Speaker-Notiz: Lösungen: 1=b, 2=c, 3=b. -->

---

## Mitmach-Aufgaben (Vertiefung)

| Code | Titel | Aufwand | ⭐ |
|---|---|---|---|
| A | Eigenes Demo-PDF erstellen und durchlaufen lassen | 30 Min | ⭐ |
| B | OCR-Prompt um neues Feld erweitern (z.B. „Zweck-Kategorie") | 60 Min | ⭐⭐ |
| C | n8n-Workflow um Anlage-1-Branch erweitern | 90 Min | ⭐⭐⭐ |
| D | OCR-Genauigkeit gegen 5 Vergleichs-PDFs benchmarken | 2 h | ⭐⭐⭐ |

Detail: **`ue0/upload-portal/04-aufgaben.md`**

---

## Materialien & Ressourcen

| Ressource | Pfad / URL |
|---|---|
| 🌐 **Live-Demo** | <https://upload.butscher.cloud/> |
| 📚 **Selbstlern-Modul (HTML)** | [`selbstlern.html`](./selbstlern.html) |
| 📝 **Konzept-Markdown** | [`01-konzept.md`](./01-konzept.md) |
| ⚖️ **Vorteile / Voraussetzungen** | [`02-vorteile-voraussetzungen.md`](./02-vorteile-voraussetzungen.md) |
| 🛠 **Dozent-Walkthrough** | [`03-walkthrough.md`](./03-walkthrough.md) |
| ✏️ **Studi-Aufgaben** | [`04-aufgaben.md`](./04-aufgaben.md) |
| 💻 **Quellcode** | `ue0/upload-portal/` + `supabase/functions/upload-antragspdf/` + n8n-Workflow `ue0-ocr-pipeline` |

---

<!-- _class: lead -->

# Brücke zu UE1

UE0 erzeugt strukturierte Daten — aber nur, wenn das PDF gut ausgefüllt
ist. **Die nächste Stufe** löst das, indem Bürger:innen direkt
strukturiert eingeben können: **UE1 — Mehrsprachiges Webformular**
mit Live-Validierung, Stepper und Multi-FB-Wizard.

> **Frage zum Mitnehmen:** Was passiert, wenn UE0 und UE1
> nebeneinander angeboten werden — wer wählt was, und warum?
