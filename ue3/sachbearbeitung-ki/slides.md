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
| 4-Augen-Prinzip nur wenn 2. Person da | bei Krankheit/Urlaub ausgehebelt |
| Bescheid frei in Word | sprachliche Drift, unterschiedliche Strenge |
| Vorjahresvergleich manuell | wird oft weggelassen |
| Träger-Recherche zeitraubend | unterbleibt bei Routine |
| Risiko-Priorisierung „Bauchgefühl" | hochriskante Anträge nicht vorgezogen |

> **Kernproblem:** Die inhaltliche Prüfung skaliert nicht — und ist
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

## Tech-Stack & Tools

| Komponente | Wahl | Begründung |
|---|---|---|
| Backend | FastAPI (Python 3.12) + `uvicorn` + `asyncio` | LLM-SDK-Reife in Python, Stream-Support |
| Erst-KI | Claude Sonnet 4.5 (`messages.create`, JSON-Schema) | beste Subsumtions-Qualität, deterministisches JSON |
| Zweit-KI | Claude Opus 4.7 mit adversariellem Prompt | bewusst anderes Modell für Diversität |
| Embeddings | Voyage AI `voyage-3` (1024-dim) | beste DE-Embeddings für juristische Texte |
| Vektor-DB | Postgres `pgvector` (HNSW Index) | keine zusätzliche Infra, Transaktions-Konsistenz |
| Externe Recherche | Perplexity `llama-3.1-sonar-large` (mit Citations) | echte Web-Quellen statt LLM-Wissen |
| Bescheid-Render | `docxtpl` + Jinja2 → Word | Word ist der Verwaltungs-Standard |
| Quellen-Validator | Regex + Set-Diff gegen `apl.norm_statement.ref` | hart, deterministisch — keine LLM-Schicht |
| Lokal-Alternative | LM Studio (OpenAI-API-kompatibel) | Datenschutz-Option |
| Frontend | UE2-Stack + 5 KI-Cards (React) | konsistente UX |

---

## Architektur

```
[Antrag in Inbox (UE2/UE3-Frontend)]
   │  POST /api/pruefung
   ▼
┌──────────────────────────────────────────┐
│  FastAPI `pruefung-service`               │
│                                            │
│  ┌─ doctree_navigate ─────────────────┐    │
│  │  pgvector-Search auf               │    │
│  │  apl.norm_statement.embedding      │    │
│  └────────────────────────────────────┘    │
│                                            │
│  ┌─ erst_ki  (Sonnet 4.5)  ───────────┐    │
│  │  System+Doctree+Antrag → JSON      │    │
│  └────────────────────────────────────┘    │
│                                            │
│  ┌─ zweit_ki  (Opus, adversariell) ───┐    │
│  │  „Finde 3 Gründe …" → JSON         │    │
│  └────────────────────────────────────┘    │
│                                            │
│  ┌─ dissens_berechnung ───────────────┐    │
│  │  konsens|inhaltlich|gegensätzlich  │    │
│  └────────────────────────────────────┘    │
│                                            │
│  ┌─ extern_validierung (Perplexity) ──┐    │
│  └────────────────────────────────────┘    │
│                                            │
│  ┌─ quellen_validator ────────────────┐    │
│  │  refs ⊂ norm_statement.ref ?       │    │
│  └────────────────────────────────────┘    │
│                                            │
│  ┌─ bescheid_render (Jinja → docx) ───┐    │
│  └────────────────────────────────────┘    │
└──────────────────────────────────────────┘
   │  201 + Bescheid-URL
   ▼
[Frontend → Empfehlungs-Cards]
```

---

## Sequenz-Diagramm

```
SB-Browser    FastAPI       Postgres     Anthropic     Perplexity
   │             │             │             │             │
 1 │ POST /api/pruefung (antrag_id) ▶│       │             │
 2 │             │── doctree_navigate (vector) ▶│           │
 3 │             │◀── top-k §-Statements ───│             │
 4 │             │── erst_ki (Sonnet 4.5) ──────▶│         │
 5 │             │◀── JSON: pro § Begründung ───│         │
 6 │             │── INSERT apl.pruefung (erst_ki_json)    │
 7 │◀── 200 { erst_ki } ─────│              │             │
 8 │             │             │             │             │
 9 │ POST /api/pruefung/ki-zweitpruefung ──▶│             │
10 │             │── zweit_ki (Opus, adversarial) ▶│       │
11 │             │◀── JSON: 3 Gegenargumente ──│         │
12 │             │── compute_dissens (cluster) │             │
13 │             │── UPDATE apl.pruefung (zweit_ki_json, dissens_cluster)
14 │◀── 200 { zweit_ki, dissens_cluster } ─│             │
15 │             │             │             │             │
16 │ POST /api/antrag/{id}/validiere-extern ▶│            │
17 │             │── Perplexity-Query mit Träger-Name ───────▶│
18 │             │◀── Antwort + Citations ─────────────────│
19 │             │── INSERT apl.extern_validierung          │
20 │◀── 200 { quellen[] } ──│              │             │
21 │             │             │             │             │
22 │ POST /api/bescheid (übernehmen) ──▶│                  │
23 │             │── render (Jinja+docxtpl)                 │
24 │             │── quellen_validator: filter halluc. refs │
25 │             │── INSERT apl.bescheid + signed URL       │
26 │◀── 201 { docx_url } ───│             │             │
27 │             │── INSERT apl.ki_override (orig vs final) │
```

<!-- Speaker-Notiz: Step 11 ist der Show-Moment. Opus widerspricht
Sonnet bewusst. Cluster „gegensätzlich" zwingt Sachbearbeiter:in
zur Entscheidung. -->

---

## Datenmodell

```sql
-- apl.norm_statement — Doctree mit Embeddings
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE apl.norm_statement (
  id          BIGSERIAL PRIMARY KEY,
  ref         TEXT NOT NULL,                -- z.B. „§ 2.3.4"
  fb          TEXT, variante TEXT,
  text        TEXT NOT NULL,
  embedding   vector(1024),                 -- voyage-3
  aktiv       BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX ON apl.norm_statement
  USING hnsw (embedding vector_cosine_ops);
CREATE UNIQUE INDEX ON apl.norm_statement (ref);

-- apl.pruefung — KI-Prüfungen pro Antrag
CREATE TABLE apl.pruefung (
  id                BIGSERIAL PRIMARY KEY,
  antrag_id         UUID NOT NULL REFERENCES apl.antraege(id),
  erst_ki_json      JSONB,                  -- Pro §: Begründung, Bewertung
  zweit_ki_json     JSONB,                  -- 3 Gegenargumente
  dissens_cluster   TEXT                    -- konsens|inhaltlich|gegensätzl.
                      CHECK (dissens_cluster IN
                        ('konsens','inhaltlich_unterschiedlich','gegensaetzlich')),
  llm_provider      TEXT,                   -- anthropic | lmstudio
  ki_kosten_eur     NUMERIC(8,4),
  ki_latenz_ms      INT,
  erstellt_am       TIMESTAMPTZ DEFAULT now()
);

-- apl.ki_override — Adoption-Tracking
CREATE TABLE apl.ki_override (
  id                  BIGSERIAL PRIMARY KEY,
  antrag_id           UUID NOT NULL,
  sachbearbeiter      TEXT NOT NULL,
  original_vorschlag  JSONB NOT NULL,
  final_entscheidung  JSONB NOT NULL,
  wurde_geaendert     BOOLEAN NOT NULL,
  aenderungs_grund    TEXT,
  entschieden_am      TIMESTAMPTZ DEFAULT now()
);
```

---

## Kern-Mechanismus — Halluzinations-Schutz

```python
# pruefung/src/pruefung/quellen_validator.py
import re
from typing import Iterable

REF_PATTERN = re.compile(r"§\s*\d+(\.\d+)*(\.\d+)*")

def filter_halluzinationen(
    bescheid_text: str,
    erlaubte_refs: set[str],
) -> tuple[str, list[str]]:
    """Filtert Sätze mit nicht-existierenden § -Refs aus dem Bescheid.

    Returns (bereinigter_text, liste_halluzinierter_refs).
    """
    bereinigt: list[str] = []
    halluc: list[str] = []
    for satz in bescheid_text.split('. '):
        refs = REF_PATTERN.findall(satz)
        if refs and not all(r in erlaubte_refs for r in refs):
            halluc.append(satz)
            continue          # Satz wird verworfen
        bereinigt.append(satz)
    return '. '.join(bereinigt), halluc

# Aufruf vor Bescheid-Render (Hard-Gate):
erlaubt = {r['ref'] for r in db.fetch_all(
    "SELECT ref FROM apl.norm_statement WHERE aktiv = true")}
text, halluc = filter_halluzinationen(ki_output, erlaubt)
if halluc:
    log.warning("Halluzinierte Refs entfernt", extra={'refs': halluc})
```

> **Strukturierte Doctrees > naives RAG-on-PDF.**
> Nur weil die § im Doctree mit `ref` gepflegt sind, kann man
> halluzinierte Refs **hart rausfiltern**. Bei PDF-Chunking unmöglich.

**Robert-Regel (verbatim):** „Es darf NIE etwas erfunden oder
hinzugefügt werden, was weder in der Rechtsgrundlage noch in den PDFs
enthalten ist."

---

## Sicherheits- & Schutzschicht

| Schicht | Mechanismus | Schutz vor |
|---|---|---|
| Eingabe | JSON-Schema-Forcing im Anthropic-Call | inkonsistentes LLM-Output |
| Modell | Sonnet 4.5 + Opus 4.7 (verschiedene Hersteller-Familien) | korrelierter Bias |
| Adversarial-Prompt | „Finde 3 Gründe gegen die Erstprüfung" | KI-Selbstbestätigung |
| Doctree-Whitelist | Nur Refs aus `apl.norm_statement` zugelassen | halluzinierte § |
| Quellen-Validator | Hard-Gate vor `apl.bescheid`-Insert | rechtswidrige Bescheide |
| AI-Act Art. 12 | Logging pro Call: Modell, Tokens, Kosten | Auditierbarkeit |
| AI-Act Art. 13 | Bescheid-Footer: „Vorbereitet von Claude Sonnet 4.5" | Bürger-Transparenz |
| AI-Act Art. 14 | Sachbearbeiter:in muss `apl.ki_override` ausfüllen | menschliche Aufsicht |
| AI-Act Art. 50 | Modellname im Compliance-Cockpit + Bescheid | KI-Kennzeichnung |
| Adoption-Tracking | Aufsichts-Alarm bei Adoption > 90 % | Automation Bias |

---

## Performance & Skalierung

| Metrik | Wert | Anmerkung |
|---|---|---|
| Doctree-Search (pgvector) | ~ 80 ms | HNSW Index, top-k=8 |
| Erst-KI (Sonnet 4.5) | 4–8 s p50 | dominanter Posten |
| Zweit-KI (Opus 4.7) | 6–12 s p50 | bewusst langsameres Modell |
| Externe Validierung (Perplexity) | 5–10 s | Web-Crawl-Dauer |
| Bescheid-Render | ~ 300 ms | Jinja + docxtpl, kein LLM mehr |
| **Gesamt pro Antrag** | **30–60 s** | sequentiell, parallelisierbar |
| Kosten pro Antrag | ~ 0,12–0,18 € | Sonnet + Opus + Perplexity |
| Token-Cache-Hit | ~ 75 % auf System-Prompt | Anthropic Prompt-Caching |

**Bottlenecks & Mitigationen:**
- Sequentielle KI-Calls → optional `asyncio.gather` (Erst + Zweit parallel)
- Lange Bescheid-Texte → Streaming-Response, UI zeigt Progress
- LM Studio-Fallback bei Outage → `LLM_PROVIDER=lmstudio` Env-Switch

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

<!-- Speaker-Notiz: Zweit-KI braucht 8-15 s, das ist eine spürbare
Pause — vorher ansagen: „jetzt findet KI 2 aktiv Gründe gegen KI 1". -->

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
- **Latenz** 30–60 s pro Antrag (sequenzielle Calls)
- **Datenschutz** Antragsinhalt geht an US-Cloud (LM Studio als
  Alternative vorgesehen)

---

## Voraussetzungen / Risiken

**Technisch:**
- Strukturierter Doctree mit allen § und Refs gepflegt
- LLM-Backend (Anthropic ODER LM Studio lokal)
- pgvector + HNSW-Index für Doctree-Search
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
<small>(a) 100 % · (b) 0 % · (c) 60-80 % · (d) egal</small>

**Frage 3:** Was macht die Zweit-KI?
<small>(a) wiederholt die Erstprüfung · (b) sucht aktiv Gegenargumente ·
(c) ist Backup, falls 1. abstürzt · (d) übersetzt für Bürger:in</small>

<!-- Speaker-Notiz: Lösungen: 1=c, 2=c, 3=b. -->

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
| 💻 **Quellcode** | `ue3/sachbearbeitung-ki/` + `pruefung/src/pruefung/{bescheid_subsumtion,zweitpruefer_ki,quellen_validator,extern_validierung}.py` |

---

<!-- _class: lead -->

# Brücke zu UE4

UE3 hilft dem Amt. **Die nächste Stufe** dreht den Spieß um und hilft
auch der Bürger:in. **UE4 — CIVA**: konversationeller Agent. Antrag
entsteht im Gespräch, kein Formular, kein PDF.

> **Frage zum Mitnehmen:** Wenn UE3 die KI ins Amt gebracht hat —
> was passiert, wenn die KI vor der Bürger:in steht? Wo verläuft
> dann die Grenze zwischen Service und Manipulation?
