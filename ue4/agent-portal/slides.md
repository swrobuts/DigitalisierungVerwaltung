---
marp: true
theme: default
paginate: true
header: "UE4 · CIVA — der konversationelle Agent · Reifegradstufe 4"
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

<span class="pill">REIFEGRADSTUFE 4</span>

# CIVA — der Agent

**Konversation statt Formular. Anthropic-Tool-Use-Loop,
3-Schichten-Halluzinations-Schutz, gleiche Plugin-Wahrheit wie UE1–UE3.
Die Brücke zu „Agentic Government".**

<small>Fallstudie AHP Würzburg · Modul Innovationsmanagement BBA · Dr. Robert Butscher · 2026</small>

<!-- Speaker-Notiz: Die spannendste und gleichzeitig riskanteste
Stufe. Hier ist die KI direkt vor der Bürger:in. -->

---

## Lernziele

Nach dieser UE können Sie:

1. **Wissen** — was einen Agenten (Tool-Use, Autonomie) von einem
   Chatbot unterscheidet.
2. **Verstehen** — wie 3-Schichten-Halluzinations-Schutz im Code
   konkret aussieht (Prompt, Tool, Frontend).
3. **Anwenden** — den System-Prompt oder ein Tool um eine neue
   harte Regel erweitern.
4. **Beurteilen** — wann ein Agent vor der Bürger:in steht und
   wann sich das verbietet.

---

## Ausgangslage — UE1 bis UE3 entlasten das Amt, nicht die Bürger:in

- UE1 hat das Formular gebaut — aber Bürger:in muss FB raten
- UE2 / UE3 entlasten die Sachbearbeitenden — Bürger:in spürt das nicht
- Wer kein Vorwissen über Verwaltungs-Begriffe hat, scheitert weiterhin
- „Welche Pflichtfelder gelten für mich?" bleibt eine Studie der Richtlinie
- Multilingual ja — aber die Begriffe sind und bleiben Verwaltungs-Jargon

> **Bis UE3 ist die Tür zur Verwaltung digitaler — aber sie ist
> immer noch eine Tür mit einem Formular davor.**

---

## Problemstellung

| Schmerzpunkt | Wirkung |
|---|---|
| Bürger:in muss FB selbst wählen | falsche FB-Wahl → Antrag falsch |
| Pflichtfelder im Voraus lesen | überfordert, Abbruch |
| Validierung erst nach Submit | Trial & Error |
| Verwaltungs-Sprache schreckt ab | Migrant:innen, Bildungsferne ausgeschlossen |
| Kein „Verstehst du mich?"-Dialog | starres Frage-Antwort |
| Keine Erklärung „warum brauchst du das?" | Misstrauen |

> **Kernproblem:** Das Formular zwingt Bürger:innen in die Sprache
> der Verwaltung. UE4 dreht das um.

---

## Reifegradmodell — wo wir stehen

| Stufe | Was neu ist | Bürger | Amt |
|---|---|---|---|
| UE0 | PDF-Upload + KI-OCR | = | ↓↓ |
| UE1 | Strukturiertes Webformular | ↑ | ↓↓↓ |
| UE2 | Sachbearbeiter-Inbox (manuell) | = | ↓ |
| UE3 | KI-Empfehlung (Mensch entscheidet) | = | ↓↓↓ |
| **UE4** (jetzt) | **Konversationeller Agent** | **↓↓** | **↓↓↓** |

> UE4 ist die **Eingangstür vor UE2/UE3**. Der Antrag landet in
> derselben `apl.antraege` wie ein UE1-Antrag.

---

## Herangehensweise

**Idee:** Bürger:in spricht — der Agent übersetzt.

1. **Bürger:in beschreibt frei**, was sie/er vorhat
2. **Agent klassifiziert** den richtigen FB (Tool 1)
3. **Agent fragt adaptiv** Pflichtfelder ab (Tool 2)
4. **Live-Validierung** im Dialog (Tool 3 — IBAN, E-Mail, PLZ)
5. **Agent submittet** nach Bestätigung (Tool 4)
6. **Sidebar zeigt live**, was der Agent verstanden hat

> **Defense-in-Depth gegen Halluzinationen:** 3 Schichten
> (System-Prompt + Tool-Whitelist + Frontend-Filter).

---

## Tech-Stack & Tools

| Komponente | Wahl | Begründung |
|---|---|---|
| Frontend | Vite 6 + React 19 + TS 5 | konsistent mit UE1 |
| Backend | FastAPI + `asyncio` + Anthropic SDK 0.40 | echte Async-Pipeline, Stream-Support |
| Haupt-LLM | Claude Sonnet 4.5 (`tool_use`-Block) | beste Tool-Use-Reasoning |
| Klassifikations-LLM | Claude Haiku 4.5 (Sub-Call) | 5× schneller, 10× billiger bei trivialer Aufgabe |
| Prompt-Caching | `cache_control: ephemeral` auf System + Tools | ~ 75 % Token-Cache-Hit-Rate |
| Parallel-Dispatch | `asyncio.gather` für mehrere Tool-Calls pro Turn | halbiert Wall-Time bei 3-4 Tools |
| Plugin-System | `packages/foerderbereiche/` (geteilt mit UE1/UE3) | EINE Wahrheit |
| Logging | `apl.agent_session_log` pro Tool-Call | AI-Act Art. 12 |
| Lokal-Alternative | LM Studio mit Llama 3.3 70B (Tool-Use-fähig) | Datenschutz-Option |

---

## Architektur

```
[Bürger:in / Chat-UI]
   │  POST /api/agent/chat
   │  { session_id, history, user_message, current_draft }
   ▼
┌────────────────────────────────────────┐
│  FastAPI `agent_chat_endpoint`         │
│   │                                     │
│   ▼                                     │
│  agent_chat.run_agent_turn():           │
│    while not end_turn:                  │
│      Anthropic.messages.create(         │
│        system=cached_blocks,            │
│        tools=cached_tools,              │
│        messages=history)                │
│      if stop_reason == 'tool_use':      │
│        asyncio.gather([                 │
│          dispatch_tool(b) for b in …    │
│        ])                                │
│      else: break                        │
└────────────────────────────────────────┘
   │
   │  4 Tools (alle mit ALLOWED_FBS-Whitelist):
   │   1. klassifiziere_foerderbereich (Sub-Call Haiku)
   │   2. get_pflichtfelder              (FB-Plugin)
   │   3. validate_field                 (IBAN/Email/PLZ)
   │   4. submit_antrag                  (DB-Insert)
   ▼
[apl.antraege] → UE2/UE3-Inbox
[apl.agent_session_log] (Audit)
```

---

## Sequenz-Diagramm

```
Browser            FastAPI            Anthropic-API         Postgres
   │                  │                    │                    │
 1 │ POST /api/agent/chat ▶│                │                    │
 2 │                  │── messages.create(system+tools+hist) ──▶│
 3 │                  │◀── tool_use(klassifiziere, args) ──────│
 4 │                  │── parallel asyncio.gather:              │
 5 │                  │    └─▶ Haiku-Sub-Call (Klassifikation) ▶│
 6 │                  │      ◀── FB='II', konfidenz=0.92 ──────│
 7 │                  │── INSERT apl.agent_session_log ────────▶│
 8 │                  │── messages.create(tool_result) ────────▶│
 9 │                  │◀── tool_use(get_pflichtfelder, args) ──│
10 │                  │── Plugin lookup (deterministisch) ──   │
11 │                  │── messages.create(tool_result) ────────▶│
12 │                  │◀── assistant_message "Wie heißt Ihre…" │
13 │◀── 200 { msg, draft, tool_trace[] } ──│                    │
14 │ … weitere Turns …                     │                    │
15 │                  │◀── tool_use(submit_antrag, draft) ──   │
16 │                  │── plugin.validiere(draft) — Hard-Gate  │
17 │                  │── INSERT apl.antraege ─────────────────▶│
18 │◀── 200 { antrag_nr } ─────────────────│                    │
```

<!-- Speaker-Notiz: Step 5 — der Haiku-Sub-Call läuft PARALLEL zu
allen anderen Tool-Calls dank asyncio.gather. -->

---

## Datenmodell

```sql
-- apl.agent_session — eine Konversation
CREATE TABLE apl.agent_session (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  modell          TEXT NOT NULL,                  -- z.B. 'claude-sonnet-4-5-…'
  klassif_modell  TEXT,                            -- z.B. 'claude-haiku-4-5'
  total_tokens_input  INT DEFAULT 0,
  total_tokens_output INT DEFAULT 0,
  total_kosten_eur    NUMERIC(8,4) DEFAULT 0,
  antrag_id       UUID REFERENCES apl.antraege(id) -- gesetzt nach Submit
);

-- apl.agent_session_log — Turn-by-Turn-Audit
CREATE TABLE apl.agent_session_log (
  id                BIGSERIAL PRIMARY KEY,
  session_id        UUID NOT NULL REFERENCES apl.agent_session(id),
  turn_nr           INT NOT NULL,
  user_message      TEXT,
  assistant_message TEXT,
  tool_calls_json   JSONB,                  -- [{name, input, output, ms}]
  latency_ms        INT,
  input_tokens      INT,
  output_tokens     INT,
  cache_read_tokens INT,                    -- prompt-cache hit
  cache_write_tokens INT,
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON apl.agent_session_log (session_id, turn_nr);
```

---

## Kern-Mechanismus — Tool-Use-Loop mit Prompt-Caching

```python
# pruefung/src/pruefung/agent_chat.py
async def run_agent_turn(history, user_msg):
    system_blocks = [{
        "type": "text",
        "text": SYSTEM_PROMPT,
        "cache_control": {"type": "ephemeral"},      # ← Cache!
    }]
    tools_with_cache = [
        *TOOLS[:-1],
        {**TOOLS[-1], "cache_control": {"type": "ephemeral"}},
    ]

    history.append({"role": "user", "content": user_msg})
    while True:
        resp = await client.messages.create(
            model="claude-sonnet-4-5-20250929",
            system=system_blocks,
            tools=tools_with_cache,
            messages=history,
            max_tokens=2048,
        )
        history.append({"role": "assistant", "content": resp.content})

        if resp.stop_reason != "tool_use":
            return resp                              # end_turn

        # Parallel-Dispatch aller Tool-Calls dieses Turns
        tool_blocks = [b for b in resp.content if b.type == "tool_use"]
        results = await asyncio.gather(*[
            dispatch_tool(b) for b in tool_blocks
        ])
        history.append({
            "role": "user",
            "content": [{"type": "tool_result",
                         "tool_use_id": b.id,
                         "content": json.dumps(r)}
                        for b, r in zip(tool_blocks, results)],
        })
```

> Cache-Hit reduziert Input-Tokens um ~ 75 %. `asyncio.gather` halbiert
> Wall-Time bei mehreren Tool-Calls pro Turn.

---

## Sicherheits- & Schutzschicht

| Schicht | Mechanismus | Schutz vor |
|---|---|---|
| **1. System-Prompt** | „Du erfindest KEINE FBs, KEINE §, KEINE Höhen" | LLM-Plausibilitätsverstöße |
| **2. Tool-Whitelist** | `ALLOWED_FBS = {'I','II','III','IV'}` im Tool-Wrapper | LLM ignoriert Prompt |
| **3. Submit-Validierung** | `plugin.validiere(draft)` vor INSERT | unvollständiger Draft |
| **4. Frontend `parseDraft`** | filtert Felder, die nicht im Plugin-Schema sind | falls Backend + LLM beide kompromittiert |
| Rate-Limit | 30 Turns / Session, 10 Sessions / IP / h | DoS, Token-Burn |
| Off-Topic-Filter | System-Prompt + Klassifikations-Check | KFZ, Wohngeld etc. |
| AI-Act Art. 12 | jeder Turn in `apl.agent_session_log` | Auditierbarkeit |
| AI-Act Art. 13 | Chat-Header „Sie chatten mit KI" | Bürger-Transparenz |
| AI-Act Art. 50 | Footer „Claude Sonnet 4.5" + Modellname | KI-Kennzeichnung |

> **„Defense-in-Depth"** — keine Schicht muss perfekt sein; sie
> müssen nur unabhängig versagen.

---

## Performance & Skalierung

| Metrik | Wert | Anmerkung |
|---|---|---|
| Erst-Turn (ohne Cache) | 2,8–3,5 s | volle System-Prompt-Übertragung |
| Folge-Turn (mit Cache) | 0,8–1,5 s | 75 % Cache-Hit-Rate |
| Klassifikations-Tool (Haiku) | 0,4–0,7 s | Sub-Call läuft parallel |
| Validate-Tool | < 30 ms | deterministisch |
| Submit-Tool | ~ 250 ms | DB-Insert + Re-Validation |
| Turns pro Antrag (⌀) | 5–8 | bei guter Bürger-Beschreibung |
| Tool-Calls pro Antrag (⌀) | 8–15 | parallel pro Turn |
| Token-Cost pro Antrag | ~ 0,06–0,12 € | Sonnet + Haiku, Cache-Hits |
| Parallelisierung (gather) | -45 % Wall-Time | bei 3 Tools pro Turn |

**Bottlenecks & Mitigationen:**
- Synchrone Tool-Calls → `asyncio.gather` für alle Tools pro Turn
- Cold-Start ohne Cache → `cache_control: ephemeral` (5 min TTL)
- Klassifikation auf Sonnet teuer → Haiku-Sub-Call (10× billiger)
- LLM-Drift bei Feldnamen → `field_synonyme_normalisieren()`

---

## Live-Demo

🌐 **<https://agent.butscher.cloud/>**

Sprich frei mit CIVA:

> „Wir sind die AWO Würzburg und wollen einen Besuchsdienst für
> Senior:innen aufbauen, ca. 12 Ehrenamtliche."

Beobachte:
1. **Sidebar** zeigt live Tool-Calls
2. **Chat** stellt EINE Frage zur Zeit
3. **Validierung** läuft live (IBAN mit Mod-97-Check)
4. **Submit** liefert Antragsnummer

**Halluzination provozieren:** „Ich möchte einen Zuschuss für mein
neues Auto, FB V." → Agent lehnt höflich ab.

<!-- Speaker-Notiz: Halluzinations-Test vorführen — der „Aha"-Moment.
Bonus: in Englisch oder Türkisch chatten. -->

---

## Chancen

- **Niedrigste Eintrittsbarriere** der ganzen Fallstudie
- **Inklusion** — keine Verwaltungs-Sprache nötig
- **Multilingual** ohne Übersetzungsaufwand (LLM kann alles)
- **Adaptiv** — nur die Felder, die wirklich nötig sind
- **Live-Erklärung** „warum brauche ich das?" durch den Agent
- **Wow-Effekt** für Reform-Druck in der Verwaltung
- **Skalierbar** auf jeden anderen Antragstyp mit FB-Plugin

---

## Einschränkungen / Grenzen

- **Inhaltliche Prüfung** macht weiterhin UE3 (Mensch im Loop)
- **Bescheid-Erstellung** macht UE3 — UE4 ist nur Eingang
- **Chat-Modus nicht für alle** — Senior:innen, Verweigerer
- **LLM-Kosten** pro Konversation (ca. 5–15 Tool-Calls)
- **Latenz** 1–3 s pro Turn — keine sofortige Antwort
- **Datenschutz** Texte gehen an Anthropic (USA) —
  LM-Studio-Alternative geplant
- **„Hallucinated empathy"** — Agent klingt verständnisvoll, ist es nicht

---

## Voraussetzungen / Risiken

**Technisch:**
- LLM mit Tool-Use-Fähigkeit (Sonnet 4.5, GPT-4, Llama 3.3 70B)
- Prompt-Caching für Performance
- Plugin-System geteilt mit UE1/UE3
- Audit-Logging pro Tool-Call (`apl.agent_session_log`)

**Organisatorisch:**
- AI-Act-Hinweis im Chat-Footer (Art. 13 + 50)
- Datenschutz-Folgenabschätzung (Hochrisiko-KI!)
- Fallback auf UE1 (klassisches Formular) muss bleiben
- Service-Telefon für Fälle, wo der Agent nicht weiterkommt

**Risiken:**
- Hallucinated FB → falscher Antrag in der DB
- Mitigation: 3-Schichten-Schutz + UE3-Mensch im Loop

---

## Selbstreflexion

> Beantworten Sie für sich diese 4 Fragen:

1. **Wenn die Bürger:in dem Agent persönliche Probleme schildert —
   wie würden Sie die Grenze zwischen „Antragsdialog" und
   „digitaler Sozialarbeiter" definieren?**
2. **Welche der 3 Schutzschichten würden Sie als allerletzte
   aufgeben — und warum?**
3. **Wann lohnt sich ein Agent — und wann ist ein Formular besser?**
4. **Wenn Bürger:innen anfangen, den Agent zu manipulieren
   („höhere Förderung als nötig"): was sind die Frühwarnsignale?**

---

## Übungsfragen

**Frage 1:** Was unterscheidet einen Agent von einem Chatbot?
<small>(a) längere Antworten · (b) Werkzeug-Aufrufe (Tool-Use)
und Aktionen · (c) höhere Kosten · (d) Mehrsprachigkeit</small>

**Frage 2:** Welche Schicht ist die LETZTE Verteidigungslinie?
<small>(a) System-Prompt · (b) Tool-Validierung Backend ·
(c) Submit-Endpoint · (d) <code>parseDraft</code> im Frontend</small>

**Frage 3:** Warum Claude Haiku statt Sonnet für die Klassifikation?
<small>(a) schneller + billiger bei einfacher Aufgabe ·
(b) höhere Qualität · (c) bessere Tool-Use-Fähigkeit ·
(d) bessere Mehrsprachigkeit</small>

<!-- Speaker-Notiz: Lösungen: 1=b, 2=d, 3=a. -->

---

## Mitmach-Aufgaben (Vertiefung)

| Code | Titel | Aufwand | ⭐ |
|---|---|---|---|
| A | System-Prompt um 6. harte Regel ergänzen + pytest | 45 Min | ⭐⭐ |
| B | Neues Pflichtfeld in FB-II-Plugin (Agent fragt es ab) | 60 Min | ⭐⭐ |
| C | Tool-Use-Loop verstehen, Token-Cost messen | 45 Min | ⭐⭐⭐ |
| D | LM Studio lokal einbinden (Datenschutz!) | 2 h | ⭐⭐⭐ |
| E | Voice-Input via Web Speech API | 3 h | ⭐⭐⭐⭐ |

Detail: **`ue4/agent-portal/04-aufgaben.md`**

---

## Materialien & Ressourcen

| Ressource | Pfad / URL |
|---|---|
| 🌐 **Live-Demo** | <https://agent.butscher.cloud/> |
| 📚 **Selbstlern-Modul (HTML)** | [`selbstlern.html`](./selbstlern.html) |
| 📝 **Konzept-Markdown** | [`01-konzept.md`](./01-konzept.md) |
| ⚖️ **Vorteile / Voraussetzungen** | [`02-vorteile-voraussetzungen.md`](./02-vorteile-voraussetzungen.md) |
| 🛠 **Dozent-Walkthrough** | [`03-walkthrough.md`](./03-walkthrough.md) |
| ✏️ **Studi-Aufgaben** | [`04-aufgaben.md`](./04-aufgaben.md) |
| 💻 **Quellcode** | `ue4/agent-portal/` + `pruefung/src/pruefung/{agent_chat,agent_tools}.py` |

---

<!-- _class: lead -->

# Rückblick & Ausblick

**Damit endet die Fallstudie:** UE0 → UE1 → UE2 → UE3 → UE4.
Reifegrad 0 bis 4 am gleichen Use Case (AHP Würzburg).

**Wo geht es weiter?**
- Reifegrad 5: vollautomatische Bewilligung (mit menschlichem
  Stichproben-Audit) — heute juristisch im Graubereich
- Voice-First / Multi-Modal — Bürger:in fotografiert,
  Agent zieht Daten
- Cross-Verwaltung-Agent — ein Agent für viele Ämter

> **Frage zum Mitnehmen:** Welche der 5 Stufen ist die wichtigste,
> wenn das Budget nur für eine reicht? Welche ist die
> politisch heikelste?
