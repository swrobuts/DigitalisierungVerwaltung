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
  .twocol { columns: 2; column-gap: 32px; }
---

<!-- _class: lead -->

<span class="pill">REIFEGRADSTUFE 0</span>

# PDF-Upload mit KI-OCR

**Vom E-Mail-Anhang zur strukturierten Erfassung — ohne dass
Bürger:innen etwas Neues lernen müssen.**

<small>Fallstudie AHP Würzburg · Modul Innovationsmanagement BBA · Dr. Robert Butscher · 2026</small>

<!-- Speaker-Notiz: Die Stufe, die fast jede Verwaltung sofort hochziehen
kann, ohne ein Formular zu bauen. „Weicher Einstieg" in die
Digitalisierung. -->

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

> **Didaktischer Kniff:** Wir trennen *Eingang* (UE0) vom
> *strukturierten Antrag* (UE1) — und KI ist die Brücke.

---

## Architektur

```
[Bürger:in]
   │  1. Drag&Drop PDF
   ▼
[Edge Function `upload-antragspdf`]
   ├─ MIME + Größe validieren
   ├─ PDF in Storage-Bucket
   └─ einreichung_id (Tracking)
   │  2. DB-Trigger → n8n-Webhook
   ▼
[n8n-Workflow (11 Nodes)]
   ├─ PDF aus Storage laden
   ├─ Claude Vision OCR mit JSON-Schema-Prompt
   ├─ Antwort parsen, Defaults ergänzen
   └─ UPDATE antrag_einreichung SET extrahiert_jsonb=…
   │  3. Frontend pollt → "fertig"
   ▼
[Auto-Redirect → UE1 mit ?prefill=<id>]
```

Jede Schicht hat **genau eine Verantwortung**.

---

## Kern-Mechanismus — Schema-Forcing bei Claude Vision

```python
SYSTEM_PROMPT = """Extrahiere aus dem PDF folgende Felder als JSON:
{
  "fb": "I"|"II"|"III"|"IV",
  "antragsteller": {"name": str, "ansprechpartner": str, ...},
  "bank": {"iban": str, "bic": str, "name": str},
  ...
}
Wenn ein Feld nicht erkennbar ist: leere String "". Erfinde nichts."""
```

**Warum funktioniert das:**
- JSON-Schema zwingt Claude in eine deterministische Struktur
- „Erfinde nichts" + leere Strings vermeiden Halluzinationen
- Nachgelagerte Validierung (IBAN-Checksumme, FB-Whitelist) fängt
  Reste-Fehler ab

---

## Live-Demo

🌐 **<https://upload.butscher.cloud/>**

1. Demo-PDF hochladen (`demo-antrag-pfarrei-st-albert.pdf`)
2. Status-Seite mit Live-Spinner beobachten
3. Nach ~15 s Auto-Redirect zu UE1 mit Prefill
4. UE1 zeigt vorausgefüllte Felder → Bürger:in bestätigt

<small>Demo-PDFs im Repo: <code>ue0/demo-pdfs/</code></small>

<!-- Speaker-Notiz: Browser vorher öffnen, Demo-PDF lokal kopiert haben.
Status-Texte während des Uploads laut vorlesen: „lädt", „KI extrahiert",
„fertig". Wenn vorhanden, auch ein handschriftliches PDF zeigen. -->

---

## Chancen

- **Sofort-Einstieg** für jede Verwaltung — keine Formular-Reise nötig
- **Niedrige Lernkurve** für Bürger:innen (PDF kennen sie)
- **Schnelle Entlastung** der Sachbearbeitenden (kein Abtippen)
- **Multi-Tenancy** — gleicher Pipeline-Code für viele Antragsarten
- **Wiederverwendbar** — Pattern für jede „PDF → Daten"-Aufgabe in der
  Verwaltung (Rechnungen, Belege, Formulare)

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
> Stand-alone hilft es wenig.

---

## Voraussetzungen / Risiken

**Technisch:**
- Storage-Bucket mit RLS, signed URLs
- Vision-fähiges LLM (Claude Sonnet 4.5 oder GPT-4o)
- Workflow-Engine (n8n) für PDF→OCR→DB-Pipeline

**Organisatorisch:**
- Datenschutz-Folgenabschätzung (Antrags-PDFs an US-Cloud!)
- Klare Aufklärung: „Ihre Daten werden von KI gelesen"
- Fallback-Pfad ohne KI muss erhalten bleiben

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

**Frage 1:** Was passiert, wenn Claude ein Feld nicht sicher erkennen
kann?
<small>(a) Antrag wird abgelehnt · (b) leerer String, Bürger:in
korrigiert · (c) Claude rät · (d) System hängt</small>

**Frage 2:** Welche Komponente erzeugt die einreichung_id?
<small>(a) n8n · (b) Frontend · (c) Edge Function · (d) Claude Vision</small>

**Frage 3:** Warum ist UE0 ohne UE1 wenig sinnvoll?
<small>(a) Kosten · (b) ohne Korrekturoberfläche bleiben OCR-Fehler
unentdeckt · (c) Datenschutz · (d) Performance</small>

<!-- Speaker-Notiz: Lösungen: 1=b, 2=c, 3=b. Nach jeder Frage 15 s
Bedenkzeit, dann auflösen. -->

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
| 💻 **Quellcode** | `ue0/upload-portal/` + `supabase/functions/upload-antragspdf/` |

---

<!-- _class: lead -->

# Brücke zu UE1

UE0 erzeugt strukturierte Daten — aber nur, wenn das PDF gut ausgefüllt
ist. **Die nächste Stufe** löst das, indem Bürger:innen direkt
strukturiert eingeben können: **UE1 — Mehrsprachiges Webformular**
mit Live-Validierung, Stepper und Multi-FB-Wizard.

> **Frage zum Mitnehmen:** Was passiert, wenn UE0 und UE1
> nebeneinander angeboten werden — wer wählt was, und warum?
