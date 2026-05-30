---
marp: true
theme: default
paginate: true
header: "UE3 · KI-Sachbearbeitung · Reifegradstufe 3"
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

<span class="pill">REIFEGRADSTUFE 3</span>

# KI-Sachbearbeitung

KI schlägt vor, Mensch entscheidet. Adversarieller Zweitprüfer, Halluzinations-Schutz, Compliance-Cockpit. Drei Backend-KI-Komponenten + 5 Frontend-Cards.

<small>Fallstudie AHP Würzburg · Modul Innovationsmanagement BBA · Dr. Robert Butscher</small>

---

## UE2 vs. UE3 — der Sprung

UE2 hat die Verwaltungs-IT geliefert (Inbox, Workflow, Audit-Trail).
Aber die **fachliche Prüfung** macht weiterhin der Mensch komplett:

- 35-seitige Förderrichtlinie pro Antrag durchgehen
- Vorjahresantrag aus dem Aktenkeller holen
- Träger googeln (existiert? gemeinnützig?)
- Bescheid in Word freitexten, juristisch argumentieren

UE3: **KI als kompetente Mitarbeiterin, nicht als Spielzeug.**

---

## Reifegradstufen — wo wir sind

| Stufe | Was neu ist | Bürger | Amt |
|---|---|---|---|
| UE0 | PDF-Upload + KI-OCR | = | ↓↓ |
| UE1 | Webformular | ↑ | ↓↓↓ |
| UE2 | Sachbearbeiter-UI (manuell) | = | ↓ |
| **UE3** (heute) | **KI-Vorschlag (Mensch entscheidet)** | = | ↓↓↓ |
| UE4 | Konversationeller Agent | ↓↓ | ↓↓↓ |

UE3 erbt die UE2-Struktur (Inbox, Magic-Link, Workflow) und
**füllt sie mit KI-Empfehlungs-Cards** auf.

---

## Drei KI-Komponenten im Backend

```
[Antrag in Inbox]
   |
   v
[1. Erst-KI] (claude-sonnet-4-5)
   |  System-Prompt mit Sachbearbeiter-Rolle
   |  + Doctree-Auszug der einschlägigen § (semantische Suche)
   |  + Antrag als JSON, Output-Schema-Forcing
   v
[2. Zweit-KI] (claude-opus-4-7, ADVERSARIELL)
   |  „Finde 3 Gründe, warum die Erstprüfung falsch sein könnte"
   v
[Dissens-Berechnung]
   |  cluster: konsens / inhaltlich_unterschiedlich / gegensätzlich
   v
[3. Externe Validierung] (Perplexity, optional)
   |  Träger-Recherche mit zitierten Quellen
   v
[Quellen-Validator]
   |  Filtert Sätze mit nicht-existierenden § -Referenzen
   v
[Bescheid-Render mit Word-Template]
```

---

## Live-Demo

🌐 **<https://ki.butscher.cloud/login>**

1. Magic-Link einloggen
2. Inbox: FBIII-DEMO-C29F50 öffnen
3. „KI-Prüfung starten" — progressive Status-Updates beobachten
4. Erst-KI-Card lesen, Begründung pro Paragraph
5. „Zweit-Prüfung" auslösen → Dissens-Card
6. „Externe Validierung" → Perplexity-Quellen
7. „Empfehlung übernehmen" → Word-Bescheid wird generiert

---

## Was UE3 gewinnt

| Aspekt | UE2 | UE3 |
|---|---|---|
| Fachliche Prüfung | Mensch liest 35 S. Richtlinie | KI extrahiert pro § eine Begründung |
| 4-Augen-Prinzip | zweite Person (falls da) | Adversarielle Zweit-KI, immer |
| Vorjahresvergleich | manuelle Akte | automatische Delta-Bars |
| Risiko-Priorisierung | Eingangsreihenfolge | Inbox nach Risiko-Score sortiert |
| Träger-Recherche | googeln | Perplexity mit zitierten Quellen |
| Bescheid-Schreiben | Word, eigene Argumentation | Jinja-Template + KI-Begründung |
| Halluzinations-Schutz | n/a | Quellen-Validator gegen `norm_statement.ref` |

---

## Halluzinations-Schutz — wichtigster Mechanismus

```python
# pruefung/src/pruefung/quellen_validator.py
def filter_halluzinationen(bescheid_text, refs_db):
    for satz in extract_saetze_mit_refs(bescheid_text):
        if satz.ref not in refs_db:
            log_warning(f"Halluzinierter Ref: {satz.ref}")
            entferne_satz(satz)
    return bescheid_text
```

> **Strukturierte Doctrees > naives RAG-on-PDF.**
> Wenn die § im Doctree mit Refs gepflegt sind, kann man halluzinierte
> Refs hart rausfiltern. Bei naivem PDF-Chunking ist das nicht möglich.

---

## Compliance-Cockpit (AI Act Art. 12, 13, 14)

🌐 **<https://ki.butscher.cloud/compliance>**

Drei Tabs:

1. **Aufsichts-Metriken**
   - Adoption-Quote (60–80% gesund, 100% = Automation Bias!)
   - Dissens-Häufigkeit Erst-KI vs Zweit-KI
   - Bescheid-Renderzeit
   - CO₂ + Cost-Tracking pro LLM-Call

2. **Regelkatalog Stufe A** — Toggle-Liste der aktiven Norm-Statements

3. **KI-Provider** — Anthropic vs. LM Studio (lokal),
   Cost-Tracking, AI-Act-Transparenz-Dokumente

> **Das ist die echte AI-Act-konforme Hochrisiko-KI-Aufsicht.**

---

## ⚖️ AI Act Art. 9, 12, 13, 14, 43, 50

- **Art. 9** (Risikomanagement-System): Risiko-Score pro Antrag
- **Art. 12** (Logging): Adoption-Tracking, Dissens-Log, Audit-Trail
- **Art. 13** (Transparenz Bürger): KI-Hinweis im Bescheid-Fuß
- **Art. 14** (menschliche Aufsicht): Sachbearbeiter:in entscheidet
- **Art. 43** (Konformitätsbewertung): Compliance-Cockpit als Beleg
- **Art. 50** (KI-Transparenz): Sachbearbeiter:in weiß explizit:
  „Das ist Claude Sonnet 4.5"

> Alle 6 Pflichten dokumentiert in
> [`rechtskonforme-ki-nutzung.html`](./public/rechtskonforme-ki-nutzung.html).

---

## Adoption-Tracking — die wichtigste Telemetrie

`apl.ki_override` speichert pro Sachbearbeiter:in:

| Spalte | Beispiel |
|---|---|
| `original_vorschlag` | „bewilligen, 4000 €" |
| `final_entscheidung` | „bewilligen, 3500 €" |
| `wurde_geaendert` | true |
| `aenderungs_grund` | „Wochenplan fehlt → Pauschale reduziert" |

**Adoption-Quote** = Anteil unveränderter Übernahmen.
**0%** = KI nutzlos. **100%** = Automation Bias!
**60–80%** = gesund.

---

## Code-Walkthrough (6 Stellen, je 3 Min)

1. **`pruefung/bescheid_subsumtion.py`** — Erst-KI mit Prompt-Aufbau
2. **`pruefung/zweitpruefer_ki.py`** — Adversarielle Zweit-KI
3. **`pruefung/quellen_validator.py`** — Halluzinations-Schutz
4. **`ue3/src/pages/AntragDetail.tsx`** — Empfehlungs-Cards
5. **`ue3/src/pages/AdoptionDashboard.tsx`** — Lern-Telemetrie
6. **`ue3/src/pages/ComplianceStatus.tsx`** — AI-Act-Cockpit

> Code-Tour-Faden: **wie kommt eine KI-Empfehlung sicher beim
> Sachbearbeitenden an, ohne dass jemand etwas blind übernimmt?**

---

## Mitmach-Aufgaben

- **A** — Neue Norm-Regel einpflegen + Doctree neu indexieren
  · 45 Min · ⭐⭐
- **B** — Bescheid-Template um „Rechtsbehelf-Hinweise" erweitern
  · 90 Min · ⭐⭐⭐
- **C** — Adoption-Dashboard interpretieren + Auswertung schreiben
  · 30 Min · ⭐
- **D** — LM Studio lokal einbinden (Datenschutz-Variante!)
  · 2 h · ⭐⭐⭐

Detail: **`ue3/sachbearbeitung-ki/04-aufgaben.md`**

---

<!-- _class: lead -->

# Fragen?

**Nächste Stunde:** UE4 — CIVA, der konversationelle Agent.
Bürger:in chattet, Antrag entsteht im Gespräch.

<small>Materialien: <code>ue3/sachbearbeitung-ki/{README, 01-konzept, 02-vorteile-voraussetzungen, 03-walkthrough, 04-aufgaben, slides, selbstlern}</code></small>
