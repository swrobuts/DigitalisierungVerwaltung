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
  .pill {
    display: inline-block; padding: 4px 12px; border-radius: 999px;
    background: #AD0E36; color: white; font-size: 14px;
    letter-spacing: 0.06em; font-weight: 600;
  }
  blockquote {
    border-left: 4px solid #AD0E36;
    background: #FBE9EE;
    padding: 12px 20px;
  }
---

<!-- _class: lead -->

<span class="pill">REIFEGRADSTUFE 0</span>

# PDF-Upload-Portal mit KI-OCR

Vom E-Mail-Anhang zur strukturierten Erfassung — ohne dass die Bürger:in etwas Neues lernen muss.

<small>Fallstudie AHP Würzburg · Modul Innovationsmanagement BBA · Dr. Robert Butscher</small>

---

## Heute: der PDF-Mail-Prozess

1. Bürger:in lädt das offizielle Antrags-PDF herunter
2. Füllt es am Computer oder handschriftlich aus
3. Scannt es ein, hängt es an eine Mail, schickt sie ans Amt
4. Mensch im Amt druckt die Mail aus, heftet sie ab
5. Mensch im Amt tippt die Felder ins Fachverfahren ab

> **Typische Fehlerquellen:** Zahlendreher, übersehene Felder, unleserliche Handschrift, fehlende Anlagen.

**Wichtig:** das ist kein exotischer Sonderfall — das ist der Mainstream in deutschen Ämtern 2026.

---

## Reifegradstufen in dieser Fallstudie

| Stufe | Was neu ist | Bürger-Aufwand | Amt-Aufwand |
|---|---|---|---|
| **UE0** (heute) | PDF-Upload + KI-OCR | = | ↓↓ |
| UE1 | Webformular (strukturierte Eingabe) | ↑ | ↓↓↓ |
| UE2 | Sachbearbeiter-UI (manuelle Prüfung) | = | ↓ |
| UE3 | KI-Vorschlag (Empfehlung, Mensch entscheidet) | = | ↓↓↓ |
| UE4 | Konversationeller Agent (Chat statt Formular) | ↓↓ | ↓↓↓ |

Jede Stufe baut auf die vorige auf. UE0 ist der „weiche Einstieg".

---

## UE0 in einem Bild

```
[Bürger:in]
   |
   | 1. Lädt ausgefülltes PDF hoch (Drag & Drop)
   v
[Edge Function `upload-antragspdf`]
   ├ validiert MIME + Größe
   ├ speichert PDF in Storage-Bucket
   └ erzeugt Tracking-Eintrag (einreichung_id)
   |
   | 2. DB-Trigger → n8n-Webhook
   v
[n8n-Workflow (11 Nodes)]
   ├ lädt PDF aus Storage
   ├ ruft Claude Vision OCR mit JSON-Schema-Prompt
   ├ parst Antwort, ergänzt Defaults
   └ UPDATE antrag_einreichung mit extrahiert_jsonb
   |
   | 3. Frontend pollt → sieht "fertig"
   v
[Auto-Redirect → UE1-Webformular mit ?prefill=<einreichung_id>]
```

**Didaktische Botschaft:** jede Schicht hat genau eine Verantwortung.

---

## Live-Demo

🌐 **<https://upload.butscher.cloud/>**

1. Demo-PDF hochladen (`demo-antrag-pfarrei-st-albert.pdf`)
2. Status-Seite mit Live-Spinner beobachten
3. Nach ~15 s Auto-Redirect zu UE1 mit Prefill
4. UE1 zeigt vorausgefüllte Felder, Bürger:in bestätigt

<small>Demo-PDFs im Repo unter `ue0/demo-pdfs/`</small>

<!--
SPEAKER NOTES:
Vor der Demo: Browser bereithalten, Demo-PDF lokal kopiert.
Während des Uploads: Status-Texte vorlesen — „lädt PDF", „KI extrahiert Felder", „fertig".
Bei Handschrift-Demo zusätzlich: explizit auf die Felder-Treffsicherheit hinweisen.
-->

---

## Was UE0 konkret gewinnt

| Aspekt | PDF-Mail heute | UE0 |
|---|---|---|
| Eingangsweg | Mail / Brief | strukturierter Upload |
| Erfassungsfehler | hoch | niedrig (Vision-OCR) |
| Doppelte Erfassung | ja (Bürger + Amt) | nein (Bürger bestätigt) |
| Status für Bürger:in | „warte auf Antwort" | Tracking + Auto-Redirect |
| Akzeptanz | hoch | gleich hoch (PDF bleibt) |

---

## Was UE0 nicht löst

- Bürger:in **braucht weiterhin das PDF** — muss es erst beschaffen
- Keine Live-Validierung beim Ausfüllen (Tippfehler in der IBAN merkt
  der/die Bürger:in erst im UE1-Schritt)
- Keine Mehrsprachigkeit beim Ausfüllen (PDF ist deutsch; UE1 wäre
  mehrsprachig)
- OCR-Restfehler bleiben möglich — UE1 ist deshalb bewusst der
  „Kontrollieren-und-Korrigieren"-Schritt
- Keine semantische Prüfung gegen die Förderrichtlinie (kommt in UE3)
- Keine automatisierte Bescheid-Erstellung (kommt in UE3)

---

## ⚖️ DSGVO &amp; AI Act

**Claude Vision (Anthropic) verarbeitet die PDFs in den USA.**

Für eine echte Verwaltungs-Anwendung wäre nötig:

- DPF / AVV mit Anthropic + TIA durchgeführt, **ODER**
- EU-gehosteter Vision-LLM (Mistral Pixtral via Scaleway,
  AWS Bedrock EU), **ODER**
- Self-hosted Vision-Modell (Llama 3.2 Vision via LM Studio)

> Die **Demo** nutzt Claude für Lehrzwecke; das wird im Footer offen gemacht.

**Diskussionspunkt:** Was bedeutet das für Total Cost of Ownership?
EU-LLM ist teurer und oft langsamer, dafür AVV-bereit.

---

## Code-Walkthrough (5 Stellen, je 2-3 Min)

1. **Frontend** `src/views/fb-upload.ts` —
   UI mit zwei Boxen (Pflicht/Optional), Drag &amp; Drop, FormData
2. **Edge Function** `upload-antragspdf/index.ts` —
   MIME-Check, Storage-Upload, Tracking-Insert
3. **Migration** `047_ue0_pdf_einreichung.sql` —
   Tabelle, RLS, DB-Trigger via `pg_notify`
4. **n8n-Workflow** `n8n-ue0-pdf-ocr.json` —
   11 Nodes, IF-Switch für optionale Anlage 1
5. **Status-Polling** `src/views/status.ts` —
   3-Sek-Polling, dann Auto-Redirect zu UE1

---

## Beispiel: Claude-Vision-Prompt (n8n)

```json
{
  "model": "claude-sonnet-4-5",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "image", "source": {"type": "base64",
        "media_type": "application/pdf",
        "data": "{{ $node['Storage'].json.base64 }}"
      }},
      {"type": "text", "text":
        "Extrahiere alle Felder aus diesem Antrags-PDF.\n" +
        "Schema:\n{\n  einrichtung: string,\n  ansprechpartner: string,\n" +
        "  iban: string,\n  monatliche_miete: number | null,\n  ...\n}\n" +
        "WICHTIG: leere Felder als null, nicht 0 oder \"\".\n" +
        "Nur valides JSON, keinen Erklärtext."
      }
    ]
  }]
}
```

Das **Schema im Prompt** ist der wichtigste Halluzinations-Schutz — Claude weiß genau, was zurückkommen muss.

---

## Mitmach-Aufgaben

- **A** — OCR-Prompt verbessern (15 Min): `null` statt `0` bei leerer Miete
- **B** — Neues Anlagen-Feld „Programm-Flyer" durch alle 4 Schichten ziehen (60 Min)
- **C** — Wartedauer via Supabase Realtime statt Polling optimieren (45 Min)
- **D** — Eigene Supabase-Instanz hochziehen, komplett deployen (2-3 h)

Detail-Anleitung: **`ue0/upload-portal/04-aufgaben.md`**

---

<!-- _class: lead -->

# Fragen?

**Nächste Stunde:** UE1 — das strukturierte Webformular, in das UE0 mündet

<small>
Materialien: <code>ue0/upload-portal/{README, 01-konzept, 02-vorteile-voraussetzungen, 03-walkthrough, 04-aufgaben, slides, selbstlern}</code>
</small>
