# 01 — Konzept: Vom Formular zum Agenten

## Warum diese Stufe?

UE0 bis UE3 haben den Antragsprozess Schritt für Schritt digital gemacht:
PDF-Upload (UE0) → klassisches Webformular (UE1) → Sachbearbeiter-Inbox (UE2)
→ KI-gestützte Prüfung (UE3). Aber für die Bürger:in fühlt sich der Anfang
immer noch nach „Formular ausfüllen" an: man muss vorher wissen, welcher
Förderbereich passt, welche Felder Pflicht sind, wie eine IBAN auszusehen
hat. UE4 dreht das um:

> **Reifegrad 4 — Konversation statt Formular.**
> Die Bürger:in beschreibt in eigenen Worten, was sie vorhat. Der Agent
> klassifiziert, fragt nach, validiert, fasst zusammen, reicht ein.

Der Agent ist kein Chat-Spielzeug, sondern eine echte autonome Komponente
mit Werkzeugen (Tool-Use). Er verwendet exakt dieselben Plugin-IDs und
Pflichtfeld-Listen wie UE1–UE3 — keine Parallel-Welt, keine doppelte
Wahrheit.

## Konzeptskizze

```mermaid
flowchart LR
    U[Bürger:in] -- Chat --> A[Agent „CIVA"]
    A -- Tool 1 --> K[klassifiziere_foerderbereich<br/>LLM mit Whitelist]
    A -- Tool 2 --> P[get_pflichtfelder<br/>aus Plugin]
    A -- Tool 3 --> V[validate_field<br/>Email/IBAN/PLZ]
    A -- Tool 4 --> S[submit_antrag<br/>apl.antraege]
    S --> DB[(Supabase)]
    DB -. Übernahme .-> UE2[UE2/UE3-Inbox]
```

## Was der Agent NICHT darf

1. Förderbereiche erfinden (V/X/…)
2. Pflichtfelder erfinden, die nicht im Plugin stehen
3. Förderhöhen nennen
4. Paragraphen zitieren
5. Off-topic-Wünsche „passend machen"

Diese fünf Regeln sind **dreifach abgesichert**:
- im System-Prompt (`agent_chat.SYSTEM_PROMPT`),
- in der Tool-Output-Validierung (`agent_tools.py: ALLOWED_FBS` etc.),
- im Frontend (`agent-api.ts: parseDraft` filtert nochmal).

## Was die Stufe gewinnt — und was sie kostet

**Gewinn**
- Niedrigschwelliger Zugang (kein Vorwissen über FBs nötig)
- Adaptive Pflichtfeld-Abfrage (statt 1-zu-1-Formular für jeden FB)
- Live-Validierung im Dialog
- Wow-Effekt für die VL — die Brücke zu „Agentic Government"

**Kosten / Risiken**
- LLM-Tokens pro Konversation (typisch 5–15 Tool-Calls × Claude Sonnet)
- Latenz: 1–3 Sekunden pro Agent-Turn
- Halluzinations-Risiko (deshalb die dreifache Absicherung)
- UX-Risiko: Bürger:innen, die kein Chatten mögen, brauchen weiterhin UE1
