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

**KI schlägt vor, Mensch entscheidet. Adversarieller Zweitprüfer,
Halluzinations-Schutz, Compliance-Cockpit. Drei KI-Komponenten +
fünf Empfehlungs-Cards im Frontend.**

<small>Fallstudie AHP Würzburg · Modul Innovationsmanagement BBA · Dr. Robert Butscher · 2026</small>

<!-- Speaker-Notiz: Die komplexeste und folgenreichste Stufe.
Hier passiert die echte Innovation: KI wird Mitarbeiterin,
nicht Spielzeug. -->

---

## Lernziele

Nach dieser UE können Sie:

1. **Wissen** — was eine adversarielle Zweit-KI ist und warum sie
   mehr ist als „LLM zweimal aufrufen".
2. **Verstehen** — wie Halluzinations-Schutz mit Doctree + Quellen-
   Validator funktioniert.
3. **Anwenden** — eine neue Norm-Regel einpflegen und beobachten,
   wie die KI sie aufgreift.
4. **Beurteilen** — was Adoption-Quoten über Automation Bias
   verraten und wann die KI zu mächtig wird.

---

## Ausgangslage — UE2 hat die IT, nicht die Inhalte

Mit UE2 läuft die Verwaltung digital — aber:

- Sachbearbeitende lesen pro Antrag eine **35-seitige Richtlinie**
- **Vorjahresantrag** aus dem Aktenkeller suchen
- **Träger googeln** (existiert? gemeinnützig?)
- **Bescheid** in Word **frei schreiben**, juristisch argumentieren
- Bei Krankheit fehlt Wissen, Übergabe ist Erzählung

> **UE2 verwaltet den Antrag. Die fachliche Arbeit macht der Mensch
> komplett alleine.**

---

## Problemstellung

| Schmerzpunkt | Wirkung |
|---|---|
| 35-seitige Richtlinie pro Antrag im Kopf | Fehler, Inkonsistenz zwischen Sachbearbeitenden |
| 4-Augen-Prinzip nur, wenn 2. Person da | bei Krankheit/Urlaub ausgehebelt |
| Bescheid frei in Word | sprachliche Drift, unterschiedliche Strenge |
| Vorjahresvergleich manuell | wird oft weggelassen |
| Träger-Recherche zeitraubend | unterbleibt bei Routine |
| Risiko-Priorisierung „Bauchgefühl" | hochriskante Anträge nicht vorgezogen |

> **Kernproblem:** Die Inhaltliche Prüfung skaliert nicht — und ist
> nicht konsistent.

---

## Reifegradmodell — wo wir stehen

| Stufe | Was neu ist | Bürger | Amt |
|---|---|---|---|
| UE0 | PDF-Upload + KI-OCR | = | ↓↓ |
| UE1 | Strukturiertes Webformular | ↑ | ↓↓↓ |
| UE2 | Sachbearbeiter-Inbox (manuell) | = | ↓ |
| **UE3** (jetzt) | **KI-Empfehlung (Mensch entscheidet)** | **=** | **↓↓↓** |
| UE4 | Konversationeller Agent | ↓↓ | ↓↓↓ |

> UE3 erbt die UE2-Struktur und **füllt sie mit KI-Empfehlungs-Cards**.

---

## Herangehensweise

**Idee:** Die KI ist Mitarbeiterin, nicht Black Box.

1. **Erst-KI** subsumiert pro § der Richtlinie eine Begründung
2. **Adversarielle Zweit-KI** sucht aktiv nach Gründen, warum die
   Erstprüfung falsch sein könnte
3. **Dissens-Berechnung** zwischen beiden
4. **Externe Validierung** (Perplexity) für Träger-Recherche mit Quellen
5. **Quellen-Validator** filtert halluzinierte § -Referenzen hart raus
6. **Adoption-Tracking** misst, wie oft die KI-Empfehlung übernommen
   wird → Aufsicht sieht Automation Bias

> **„KI schlägt vor, Mensch entscheidet" — und wir messen, ob der
> Mensch wirklich entscheidet.**

---

## Architektur

```
[Antrag in Inbox]
   │
   ▼
[1. Erst-KI] (Claude Sonnet 4.5)
   │  System-Prompt + Doctree-Auszug der einschlägigen §
   │  + Antrag als JSON, Output-Schema-Forcing
   ▼
[2. Zweit-KI] (Claude Opus, ADVERSARIELL)
   │  „Finde 3 Gründe, warum die Erstprüfung falsch sein könnte"
   ▼
[Dissens-Berechnung]
   │  cluster: konsens / inhaltlich_unterschiedlich / gegensätzlich
   ▼
[3. Externe Validierung] (Perplexity, optional)
   │  Träger-Recherche mit zitierten Quellen
   ▼
[Quellen-Validator]
   │  Filtert Sätze mit nicht-existierenden § -Referenzen
   ▼
[Bescheid-Render mit Word-Template]
```

---

## Kern-Mechanismus — Halluzinations-Schutz

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
> Nur weil die § im Doctree mit Refs gepflegt sind, kann man
> halluzinierte Refs **hart rausfiltern**. Bei PDF-Chunking unmöglich.

**Robert-Regel (verbatim):** „Es darf NIE etwas erfunden oder
hinzugefügt werden, was weder in der Rechtsgrundlage noch in den PDFs
enthalten ist."

---

## Live-Demo

🌐 **<https://ki.butscher.cloud/login>**

1. Magic-Link einloggen
2. Inbox: `FBIII-DEMO-C29F50` öffnen
3. „KI-Prüfung starten" → progressive Status-Updates
4. Erst-KI-Card lesen, Begründung pro § prüfen
5. „Zweit-Prüfung" auslösen → Dissens-Card
6. „Externe Validierung" → Perplexity mit Quellen
7. „Empfehlung übernehmen" → Word-Bescheid wird generiert

🌐 **<https://ki.butscher.cloud/compliance>** — Aufsichts-Cockpit

<!-- Speaker-Notiz: Vor der VL einmal selbst durchklicken — die
Zweit-KI braucht 8-15 s, das ist eine spürbare Pause. Vorher
sagen: „jetzt findet KI 2 aktiv Gründe gegen KI 1". -->

---

## Chancen

- **Konsistenz** — KI-Begründung pro § immer im gleichen Schema
- **4-Augen-Prinzip immer** (adversarielle Zweit-KI)
- **Sachbearbeitende werden Aufsicht** — entscheiden statt schreiben
- **Risiko-Priorisierung** über Risiko-Score in der Inbox
- **Halluzinations-Schutz** schafft Vertrauen für Audit
- **AI-Act-konforme Hochrisiko-KI-Aufsicht** im Compliance-Cockpit
- **Kosten transparent** pro Bescheid (CO₂ + €)

---

## Einschränkungen / Grenzen

- **Korrelierter Bias** — „Claude vs. Claude" ist nur teil-diverse
  4-Augen-Prüfung
- **Adoption 100 %** = Automation Bias (Mensch klickt nur durch)
- **Doctree-Pflege** ist Code-Arbeit — Bürger-Service muss begleiten
- **LLM-Kosten** skalieren mit Antragsvolumen
- **Latenz** Erst-KI + Zweit-KI + Validierung → 30-60 s pro Antrag
- **Datenschutz** Antragsinhalt geht an US-Cloud (LM Studio als
  Alternative vorgesehen)

---

## Voraussetzungen / Risiken

**Technisch:**
- Strukturierter Doctree mit allen § und Refs gepflegt
- LLM-Backend (Anthropic ODER LM Studio lokal)
- Quellen-Validator als Hard-Gate vor Bescheid-Render
- Adoption-Tracking-Tabelle (`apl.ki_override`)

**Organisatorisch:**
- Schulung: „KI ist Vorschlag, nicht Autorität"
- Aufsichts-Rolle (Dezernat, externes Audit)
- Regelkatalog Stufe A: welche Regeln aktiv?
- AI-Act-Doku (Art. 9, 12, 13, 14, 43, 50)

**Risiken:**
- Halluzinierter § rutscht durch → Bescheid wird rechtswidrig
- Mitigation: Quellen-Validator + Bescheid-Review-Pflicht

---

## Selbstreflexion

> Beantworten Sie für sich diese 4 Fragen:

1. **Wenn die Adoption-Quote von 70 % auf 95 % steigt — was bedeutet
   das, und wie reagieren Sie als Aufsicht?**
2. **Ist „Claude vs. Claude" wirklich 4-Augen-Prinzip — oder nur
   Theater? Welche echten Diversitäts-Mechanismen würden Sie ergänzen?**
3. **Welche Stufen-Verschiebung wäre verantwortungsbar — und welche
   nicht (vollautomatischer Bescheid)?**
4. **Welche Felder der Verwaltung sind für UE3 GUT geeignet —
   welche schlecht?**

---

## Übungsfragen

**Frage 1:** Was schützt UE3 vor halluzinierten § -Zitaten?
<small>(a) System-Prompt · (b) Output-Schema-Forcing · (c) Quellen-
Validator gegen <code>norm_statement.ref</code> · (d) Zweit-KI</small>

**Frage 2:** Welche Adoption-Quote ist „gesund"?
<small>(a) 100 % — KI ist perfekt · (b) 0 % — Mensch entscheidet
selbst · (c) 60-80 % — KI hilft, Mensch reviewt · (d) egal</small>

**Frage 3:** Was macht die Zweit-KI?
<small>(a) wiederholt die Erstprüfung · (b) sucht aktiv Gegenargumente ·
(c) ist Backup, falls 1. abstürzt · (d) übersetzt für Bürger:in</small>

<!-- Speaker-Notiz: Lösungen: 1=c, 2=c, 3=b. „60-80 % ist gesund,
100 % ist Automation Bias" ist der Leit-Satz dieser UE. -->

---

## Mitmach-Aufgaben (Vertiefung)

| Code | Titel | Aufwand | ⭐ |
|---|---|---|---|
| A | Neue Norm-Regel einpflegen + Doctree neu indexieren | 45 Min | ⭐⭐ |
| B | Bescheid-Template um „Rechtsbehelf-Hinweise" erweitern | 90 Min | ⭐⭐⭐ |
| C | Adoption-Dashboard interpretieren + Auswertung schreiben | 30 Min | ⭐ |
| D | LM Studio lokal einbinden (Datenschutz-Variante) | 2 h | ⭐⭐⭐ |

Detail: **`ue3/sachbearbeitung-ki/04-aufgaben.md`**

---

## Materialien & Ressourcen

| Ressource | Pfad / URL |
|---|---|
| 🌐 **Live-Demo** | <https://ki.butscher.cloud/login> |
| 🛡 **Compliance-Cockpit** | <https://ki.butscher.cloud/compliance> |
| 📚 **Selbstlern-Modul (HTML)** | [`selbstlern.html`](./selbstlern.html) |
| 📝 **Konzept-Markdown** | [`01-konzept.md`](./01-konzept.md) |
| ⚖️ **Vorteile / Voraussetzungen** | [`02-vorteile-voraussetzungen.md`](./02-vorteile-voraussetzungen.md) |
| 🛠 **Dozent-Walkthrough** | [`03-walkthrough.md`](./03-walkthrough.md) |
| ✏️ **Studi-Aufgaben** | [`04-aufgaben.md`](./04-aufgaben.md) |
| 💻 **Quellcode** | `ue3/sachbearbeitung-ki/` + `pruefung/src/pruefung/` |

---

<!-- _class: lead -->

# Brücke zu UE4

UE3 hilft dem Amt. **Die nächste Stufe** dreht den Spieß um und hilft
auch der Bürger:in. **UE4 — CIVA**: konversationeller Agent. Antrag
entsteht im Gespräch, kein Formular, kein PDF.

> **Frage zum Mitnehmen:** Wenn UE3 die KI ins Amt gebracht hat —
> was passiert, wenn die KI vor der Bürger:in steht? Wo verläuft
> dann die Grenze zwischen Service und Manipulation?
