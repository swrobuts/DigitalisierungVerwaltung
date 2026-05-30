# 02 — Vorteile, Grenzen, Voraussetzungen

## Was UE4 gegenüber UE0–UE3 gewinnt

| Aspekt | UE1 (Webformular) | UE4 (Agent CIVA) |
|---|---|---|
| Einstieg | Bürger:in muss FB selbst wählen | Agent klassifiziert aus Freitext |
| Pflichtfelder | statisches Formular pro FB | adaptiv, nur was wirklich nötig ist |
| Validierung | erst nach Submit | live im Dialog (IBAN, E-Mail, PLZ) |
| Sprache | 4 fixe Sprachen | jede Sprache, die das LLM versteht |
| Fragen offen? | nirgends | Agent erklärt, was er braucht und warum |
| Wow-Effekt | „ist halt ein Formular" | echte Konversation, Agentic UX |

> **Kernidee:** Nicht die Bürger:in passt sich dem Formular an,
> sondern der Agent passt sich der Bürger:in an.

## Was UE4 NICHT leistet (= bleibt bei UE2/UE3)

- **Inhaltliche Prüfung:** macht UE3 (KI-Subsumtion)
- **Bescheid-Erstellung:** macht UE3 (Word-Template + Quellen-Validator)
- **Akten-Sichtbarkeit:** macht UE2 (Sachbearbeiter-Inbox)
- **Audit-Trail / RLS:** macht das DB-Layer aus UE2

UE4 ist die **Eingangstür** — alles dahinter ist UE0–UE3.
Der von CIVA erzeugte Antrag landet in derselben `apl.antraege`-Tabelle
und durchläuft denselben Workflow.

## Halluzinations-Schutz — die 3 Verteidigungsschichten

```
[Schicht 1: System-Prompt]
   „Du darfst KEINE Förderhöhen nennen,
    KEINE § zitieren, KEINE FBs erfinden …"

[Schicht 2: Tool-Output-Validierung in agent_tools.py]
   ALLOWED_FBS = {'I', 'II', 'III', 'IV'}
   if vorschlag not in ALLOWED_FBS:
       raise ToolError("FB nicht in Whitelist")

[Schicht 3: Frontend in agent-api.ts]
   parseDraft() filtert nochmal alle Felder,
   die nicht im Plugin-Schema sind
```

**Warum dreifach?**
LLMs halluzinieren. Punkt. Ein System-Prompt allein ist Plausibilitätswunsch,
keine Garantie. Erst die Kombination aus Prompt + harter Tool-Validierung
+ Frontend-Filter macht das System produktionsreif.

## Technische Voraussetzungen

| Schicht | Komponente | Warum nötig |
|---|---|---|
| LLM-Backend | Anthropic API (Sonnet 4.5) ODER LM Studio lokal | Tool-Use-Loop |
| Klassifikation | Haiku 4.5 (separater Call) | schneller, billiger |
| Plugin-System | `pruefung/src/pruefung/foerderbereiche/` | Pflichtfeld-Liste pro FB |
| DB | Supabase mit `apl.antraege` + RLS | Antrags-Persistierung |
| Prompt-Caching | `cache_control: ephemeral` in System-Block | reduziert Latenz + Cost |

## Organisatorische Voraussetzungen

1. **AI-Act-Hinweis im Chat-Footer**: „Du sprichst mit Claude Sonnet 4.5,
   einem KI-Agenten der Anthropic. Antworten sind generiert."
2. **Datenschutz-Hinweis vor erster Eingabe**: Welche Daten gehen an
   welchen US-Anbieter? Alternative LM Studio anbieten?
3. **Fallback-Pfad**: Bürger:in muss jederzeit auf UE1 (klassisches
   Formular) umsteigen können — Chat ist nie Pflicht.
4. **Service-Telefon / Mensch erreichbar**: für die Fälle, in denen
   der Agent nicht weiterkommt.

## Rechtliche Einordnung (AI Act)

UE4 ist **Hochrisiko-KI** (Anhang III Nr. 5b — „Zugang zu öffentlichen
Leistungen"). Pflichten:

- **Art. 9** Risikomanagement: dokumentierter Halluzinations-Schutz
- **Art. 13** Transparenz: Bürger:in erfährt im Chat-Header explizit:
  „Das ist eine KI"
- **Art. 14** menschliche Aufsicht: Sachbearbeiter:in entscheidet final
  (UE2/UE3-Pfad)
- **Art. 50** KI-Kennzeichnung: Footer-Hinweis nennt das Modell
- **Art. 12** Logging: jeder Tool-Call wird in `apl.agent_session_log`
  protokolliert

## Wann UE4 NICHT sinnvoll ist

- Wenn der Antragsprozess hochstandardisiert ist (z.B. einfaches
  Wohngeld-Formular mit 5 Feldern) — UE1 reicht
- Wenn Bürger:innen den Chat-Modus nicht annehmen (z.B. Senior:innen
  ohne Smartphone-Affinität)
- Wenn Datenschutz-Bedenken eine US-Cloud ausschließen UND kein
  performantes lokales LLM verfügbar ist
- Wenn die Verwaltung nicht bereit ist, die AI-Act-Pflichten zu
  dokumentieren

> UE4 ist die spannendste, aber auch die anspruchsvollste Stufe.
> Erst bauen, wenn UE0–UE3 stabil laufen.
