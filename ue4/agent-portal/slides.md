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
Stufe. Hier ist die KI direkt vor der Bürger:in — alle
Halluzinations-Schutzwälle werden nochmal scharf gestellt. -->

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

## Architektur

```
[Bürger:in chattet]
   │
   ▼
[Anthropic Tool-Use-Loop: Claude Sonnet 4.5]
   │
   │   Tool 1: klassifiziere_foerderbereich  (Sub-Call Haiku)
   │   Tool 2: get_pflichtfelder              (aus FB-Plugin)
   │   Tool 3: validate_field                 (Email/IBAN/PLZ)
   │   Tool 4: submit_antrag                  (DB-Insert)
   │
   ▼
[apl.antraege → UE2/UE3-Inbox]
```

System-Prompt mit 5 harten Regeln + Tool-Whitelist + Frontend-Filter
= **3-Schichten-Halluzinations-Schutz**.

---

## Kern-Mechanismus — 3 Schutzschichten

```
[Schicht 1: System-Prompt]
   „Du erfindest KEINE Förderbereiche.
    Du nennst KEINE Förderhöhen. Du zitierst KEINE §."

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

<!-- Speaker-Notiz: Den Halluzinations-Test unbedingt vorführen —
das ist der „Aha"-Moment. Bonus: in Englisch oder Türkisch chatten. -->

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
- LLM mit Tool-Use-Fähigkeit (Claude Sonnet, GPT-4, Llama 3.3 70B)
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

<!-- Speaker-Notiz: Lösungen: 1=b, 2=d, 3=a. „Defense-in-Depth"
ist das Schlüsselkonzept der ganzen UE. -->

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
| 💻 **Quellcode** | `ue4/agent-portal/` + `pruefung/src/pruefung/agent_*.py` |

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
