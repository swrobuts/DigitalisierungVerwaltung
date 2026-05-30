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

Konversation statt Formular. Anthropic-Tool-Use-Loop, 3-Schichten-Halluzinations-Schutz, Plugin-System teilt sich die Wahrheit mit UE1–UE3.

<small>Fallstudie AHP Würzburg · Modul Innovationsmanagement BBA · Dr. Robert Butscher</small>

---

## UE3 vs. UE4 — der Sprung

UE3 macht KI **im Amt** (KI-Sachbearbeitung).
UE4 macht KI **beim Bürger** — der Antrag entsteht im Gespräch.

- UE0–UE3: Bürger:in muss FB raten, Pflichtfelder durchgehen, PDFs hochladen
- UE4: Bürger:in beschreibt frei, Agent klassifiziert, fragt adaptiv,
  validiert live, submittet

> **Reifegrad 4** = Bürger:in muss nichts mehr „über die Verwaltung"
> wissen — der Agent übersetzt.

---

## Reifegradstufen — wo wir sind

| Stufe | Was neu ist | Bürger | Amt |
|---|---|---|---|
| UE0 | PDF-Upload + KI-OCR | = | ↓↓ |
| UE1 | Webformular | ↑ | ↓↓↓ |
| UE2 | Sachbearbeiter-UI (manuell) | = | ↓ |
| UE3 | KI-Vorschlag (Mensch entscheidet) | = | ↓↓↓ |
| **UE4** (heute) | **Konversationeller Agent** | **↓↓** | **↓↓↓** |

UE4 ist die **Eingangstür** vor UE2/UE3. Der von CIVA erzeugte Antrag
durchläuft denselben Workflow wie ein UE1-Antrag.

---

## CIVA in einem Bild

```
[Bürger:in chattet frei]
   |
   v
[Anthropic Tool-Use-Loop: Sonnet 4.5]
   |
   |  Tool 1: klassifiziere_foerderbereich  (Sub-Call Haiku)
   |  Tool 2: get_pflichtfelder              (aus FB-Plugin)
   |  Tool 3: validate_field                 (Email/IBAN/PLZ)
   |  Tool 4: submit_antrag                  (DB-Insert)
   |
   v
[apl.antraege → UE2/UE3-Inbox]
```

System-Prompt mit 5 harten Regeln + Tool-Whitelist + Frontend-Filter
= **Defense-in-Depth gegen Halluzinationen**.

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

---

## Halluzinations-Schutz — 3 Schichten

```
[Schicht 1: System-Prompt]
   „Du darfst keine FBs erfinden, keine Förderhöhen nennen,
    keine § zitieren, keine Pflichtfelder erfinden …"

[Schicht 2: Tool-Output-Validierung]
   ALLOWED_FBS = {'I', 'II', 'III', 'IV'}
   if vorschlag not in ALLOWED_FBS:
       raise ToolError("FB nicht in Whitelist")

[Schicht 3: Frontend parseDraft]
   for field in plugin.pflichtfelder:
       cleaned[field] = raw[field]     # alles andere fliegt raus
```

> **Eine Schicht reicht nicht.** LLMs halluzinieren — Punkt.

---

## Was UE4 gewinnt

| Aspekt | UE1 (Formular) | UE4 (Agent) |
|---|---|---|
| FB-Auswahl | Bürger:in muss raten | Agent klassifiziert |
| Pflichtfelder | statisch, alle auf einmal | adaptiv, eines nach dem anderen |
| Validierung | nach Submit | live im Dialog |
| Sprache | 4 fixe | jede LLM-Sprache |
| Erklärung | n/a | Agent erklärt, was er braucht |
| Zugänglichkeit | mittel | hoch (geringe Schreibhürde) |

---

## Was UE4 NICHT macht

- **Inhaltliche Prüfung:** UE3 (KI-Subsumtion)
- **Bescheid-Erstellung:** UE3 (Word + Quellen-Validator)
- **Akten-Sichtbarkeit:** UE2 (Sachbearbeiter-Inbox)
- **Audit-Trail / RLS:** DB-Layer aus UE2

UE4 ist die **Eingangstür**, nicht die ganze Bearbeitung.
Der Antrag landet in derselben `apl.antraege`, wird wie ein UE1-Antrag
weiterverarbeitet.

---

## Performance-Tricks im Code

```python
# pruefung/src/pruefung/agent_chat.py
system_blocks = [{
    "type": "text", "text": SYSTEM_PROMPT,
    "cache_control": {"type": "ephemeral"}     # ← Prompt-Cache
}]

# Parallel-Dispatch mehrerer Tool-Calls
results = await asyncio.gather(*[
    dispatch_tool(b) for b in tool_blocks
])

# Klassifikation mit Haiku statt Sonnet (5× schneller, 10× billiger)
model = os.getenv("ANTHROPIC_KLASSIFIKATIONS_MODEL", "claude-haiku-4-5")
```

> Latenz pro Turn: 3.0s → 0.8s. Kosten pro Antrag: −60 %.

---

## ⚖️ AI Act Art. 9, 12, 13, 14, 50

- **Art. 9** Risikomanagement: dokumentierter Halluzinations-Schutz
- **Art. 12** Logging: `apl.agent_session_log` mit jedem Tool-Call
- **Art. 13** Transparenz Bürger:in: Chat-Header „Sie sprechen mit KI"
- **Art. 14** menschliche Aufsicht: UE2/UE3 entscheidet final
- **Art. 50** KI-Kennzeichnung: Footer nennt das Modell

> UE4 = Hochrisiko-KI (Anhang III Nr. 5b „Zugang zu öffentlichen
> Leistungen"). Alle Pflichten sind in der Demo sichtbar.

---

## Code-Walkthrough (5 Stellen)

1. **`pruefung/agent_chat.py`** — System-Prompt + Tool-Use-Loop
2. **`pruefung/agent_tools.py`** — 4 Tools mit Whitelist-Validierung
3. **`pruefung/foerderbereiche/*.py`** — Plugin-System (eine Wahrheit)
4. **`ue4/agent-portal/src/lib/agent-api.ts`** — `parseDraft` als 3. Schicht
5. **`ue4/agent-portal/src/components/Sidebar.tsx`** — Tool-Trace live

> Code-Tour-Faden: **wie verhindert der Agent, dass er Quatsch in die
> DB schreibt — auf jeder einzelnen Code-Schicht?**

---

## Mitmach-Aufgaben

- **A** — System-Prompt um 6. Regel ergänzen + pytest dafür · 45 Min · ⭐⭐
- **B** — Neues Pflichtfeld in FB-II-Plugin, Agent fragt es ab · 60 Min · ⭐⭐
- **C** — Tool-Use-Loop verstehen, Token-Cost messen · 45 Min · ⭐⭐⭐
- **D** — LM Studio lokal einbinden (Datenschutz!) · 2 h · ⭐⭐⭐
- **E** — Voice-Input via Web Speech API · 3 h · ⭐⭐⭐⭐

Detail: **`ue4/agent-portal/04-aufgaben.md`**

---

<!-- _class: lead -->

# Fragen?

**Damit endet die Fallstudie:**
UE0 → UE1 → UE2 → UE3 → UE4. Reifegrad 0 bis 4 am gleichen Use Case.

<small>Materialien: <code>ue4/agent-portal/{README, 01-konzept, 02-vorteile-voraussetzungen, 03-walkthrough, 04-aufgaben, slides, selbstlern}</code></small>
