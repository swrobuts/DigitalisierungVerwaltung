# 03 — Walkthrough: CIVA von außen nach innen

> Dozent-Tour, ~25 Min. Ziel: am Ende kannst du an 5 Stellen
> im Code zeigen, **wo** der Agent klassifiziert, **wo** Halluzination
> verhindert wird und **wo** der Antrag in die DB geht.

## Schritt 1 — Live-Demo (5 Min)

🌐 **<https://agent.butscher.cloud/>**

Sag dem Agent:

> „Hallo, wir sind die AWO Würzburg und wollen einen Besuchsdienst
> für Senior:innen aufbauen, ca. 12 Ehrenamtliche."

Beobachte:

1. **Sidebar links**: zeigt live, was der Agent verstanden hat
   (FB-Vorschlag, Pflichtfelder, Validierungs-Status)
2. **Chat rechts**: Agent stellt EINE Frage zur Zeit
3. **Footer**: AI-Act-Hinweis („Sie chatten mit Claude Sonnet 4.5")

Nach 6–8 Turns hat der Agent alle Pflichtfelder, fragt nach
Submit-Bestätigung. Bei „Ja" → Antragsnummer.

## Schritt 2 — Backend-Code (10 Min)

### 2a. System-Prompt mit harten Regeln

📂 **`pruefung/src/pruefung/agent_chat.py`** → `SYSTEM_PROMPT`

```python
SYSTEM_PROMPT = """Du bist CIVA, der KI-Agent für die Antragstellung
der Stadt Würzburg im Programm AHP 2.

HARTE REGELN (nicht verhandelbar):
1. Du erfindest KEINE Förderbereiche. Whitelist: I, II, III, IV.
2. Du nennst KEINE konkreten Förderhöhen.
3. Du zitierst KEINE Paragraphen.
4. Du erfindest KEINE Pflichtfelder, die nicht aus get_pflichtfelder kommen.
5. Off-topic-Wünsche (KFZ, Wohngeld) lehnst du höflich ab.
..."""
```

**Was zeigen:** Diese 5 Regeln stehen im Prompt UND werden in den Tools
nochmal hart validiert. Defense-in-Depth.

### 2b. Tool-Use-Loop mit Prompt-Caching

📂 **`pruefung/src/pruefung/agent_chat.py`** → `run_agent_turn`

```python
system_blocks = [{
    "type": "text",
    "text": SYSTEM_PROMPT,
    "cache_control": {"type": "ephemeral"}   # ← Caching!
}]

tools_with_cache = [
    *tools[:-1],
    {**tools[-1], "cache_control": {"type": "ephemeral"}}
]

while iterations < MAX_ITERATIONS:
    response = anthropic.messages.create(
        model="claude-sonnet-4-5-20250929",
        system=system_blocks,
        tools=tools_with_cache,
        messages=history,
    )
    if response.stop_reason == "tool_use":
        # Parallel-Dispatch via asyncio.gather
        results = await asyncio.gather(*[
            dispatch_tool(b) for b in tool_blocks
        ])
        ...
```

**Was zeigen:** Cache-Hits reduzieren Latenz von 3s auf 0,8s; Parallelisierung
spart bei 3-4 Tools nochmal die Hälfte.

### 2c. Klassifikations-Tool mit Whitelist

📂 **`pruefung/src/pruefung/agent_tools.py`** → `tool_klassifiziere_foerderbereich`

```python
ALLOWED_FBS = {"I", "II", "III", "IV"}

async def tool_klassifiziere_foerderbereich(beschreibung: str) -> dict:
    # Sub-Call an Haiku 4.5 mit Few-Shot-Beispielen
    resp = anthropic.messages.create(
        model=os.getenv("ANTHROPIC_KLASSIFIKATIONS_MODEL", "claude-haiku-4-5"),
        system=FB_KLASSIFIKATIONS_PROMPT,
        messages=[{"role": "user", "content": beschreibung}]
    )
    vorschlag = parse_fb(resp)

    if vorschlag not in ALLOWED_FBS:
        raise ToolError(f"FB '{vorschlag}' nicht in Whitelist {ALLOWED_FBS}")

    return {"fb": vorschlag, "begruendung": ..., "konfidenz": ...}
```

**Was zeigen:**
- **Sub-Modell:** Haiku ist 5× schneller + 10× billiger als Sonnet
  für die simple Klassifikations-Aufgabe
- **Whitelist:** auch wenn das LLM „FB V" zurückgibt, wird der Tool-Call
  abgelehnt — der Agent kann gar keinen erfundenen FB an die DB schicken

### 2d. Pflichtfeld-Tool aus Plugin-System

📂 **`pruefung/src/pruefung/agent_tools.py`** → `tool_get_pflichtfelder`

```python
def tool_get_pflichtfelder(fb: str, variante: str | None = None) -> list[dict]:
    plugin = load_foerderbereich_plugin(fb)
    return plugin.get_pflicht_felder(variante=variante)
```

**Was zeigen:** Plugin-System unter `pruefung/src/pruefung/foerderbereiche/`
ist die EINE Quelle der Wahrheit. UE1, UE3 und UE4 lesen aus denselben
Modulen. Wenn FB-III-C eine neue Pflicht braucht → einmal im Plugin, alle
Stufen profitieren.

### 2e. Submit-Tool mit Defense-in-Depth

📂 **`pruefung/src/pruefung/agent_tools.py`** → `tool_submit_antrag`

```python
async def tool_submit_antrag(draft: dict) -> dict:
    # Validierung Schicht 2
    if draft["fb"] not in ALLOWED_FBS:
        raise ToolError("Submit blockiert: ungültiger FB")
    plugin = load_foerderbereich_plugin(draft["fb"])
    fehlende = plugin.validiere(draft)
    if fehlende:
        raise ToolError(f"Submit blockiert: Pflichtfelder offen: {fehlende}")

    # DB-Insert
    antrag = await db.insert("apl.antraege", draft, service_role=True)
    return {"antragsnummer": antrag.id}
```

**Was zeigen:** Auch wenn der Agent halluziniert und einen unvollständigen
Draft submitten will — das Tool weist es zurück, bevor die DB
es zu sehen bekommt.

## Schritt 3 — Frontend-Code (5 Min)

### 3a. Tool-Trace-Sidebar

📂 **`ue4/agent-portal/src/components/Sidebar.tsx`**

```tsx
{toolTrace.map(t => (
  <div key={t.id}>
    <span className="badge">{t.tool_name}</span>
    <pre>{JSON.stringify(t.input, null, 2)}</pre>
    <pre>{JSON.stringify(t.output, null, 2)}</pre>
  </div>
))}
```

**Was zeigen:** Bürger:in sieht in Echtzeit, was der Agent intern macht.
Das ist Transparenz im Sinn von AI-Act Art. 13.

### 3b. parseDraft als 3. Verteidigungsschicht

📂 **`ue4/agent-portal/src/lib/agent-api.ts`** → `parseDraft`

```ts
export function parseDraft(raw: unknown, fb: FB): Draft {
  const plugin = PLUGINS[fb];                 // gleiches Schema wie Backend
  const cleaned: Draft = {};
  for (const field of plugin.pflichtfelder) {
    cleaned[field] = raw[field];              // unbekannte Felder fliegen raus
  }
  return cleaned;
}
```

**Was zeigen:** Selbst wenn Backend + LLM beide kompromittiert wären
und Phantasie-Felder schicken — Frontend filtert sie auf der letzten
Meile raus.

## Schritt 4 — Adoption + Aufsicht (3 Min)

📂 **`pruefung/src/pruefung/main.py`** → `agent_chat_endpoint`

Jeder Turn loggt nach `apl.agent_session_log`:

| Spalte | Beispiel |
|---|---|
| `session_id` | uuid |
| `user_message` | „Wir sind die AWO …" |
| `tool_calls_json` | `[{tool: klassifiziere, input: ..., output: ...}]` |
| `model` | claude-sonnet-4-5-20250929 |
| `latency_ms` | 1840 |
| `input_tokens` | 1200 |
| `output_tokens` | 240 |

Aus diesem Log generiert das **Compliance-Cockpit** (`/compliance`) eine
Tabelle „Agent-Sessions der letzten 7 Tage" — Abbruch-Quote, durchschnittliche
Tool-Calls pro Session, FB-Verteilung.

## Schritt 5 — was als nächstes (2 Min)

- **LM Studio lokal** (`llm_client.py` `ANTHROPIC_BASE_URL` umstellen)
- **Voice-Eingabe** (Whisper) — UE5-Vorausblick
- **Multi-Modal**: Bürger:in fotografiert das alte Vereins-Dokument,
  Agent zieht Daten raus

Detail siehe **`04-aufgaben.md`**.
