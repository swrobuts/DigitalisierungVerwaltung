# UE4 — Agent-Portal (`agent.butscher.cloud`)

> **Reifegradstufe 4 (autonomer Agent):** Bürger:innen reden konversational mit einem KI-Assistenten („Anna"). Der Agent klassifiziert selbständig den Förderbereich, fragt nur die wirklich benötigten Pflichtfelder ab, validiert Eingaben (E-Mail, IBAN, PLZ) und reicht den Antrag nach Bestätigung ein. Kein klassisches Formular, kein PDF-Upload — der Agent erledigt den Papierkram.

## Was diese Stufe gegenüber UE0–UE3 gewinnt

- **Konversationelle UX:** Bürger:innen beschreiben in eigenen Worten, was sie fördern lassen möchten — der Agent übersetzt das in den AHP-Förderbereich.
- **Adaptiv:** Pflichtfelder werden je nach FB (und FB-III-Variante) dynamisch abgefragt, nicht als statisches Formular.
- **Eingebauter Halluzinations-Schutz** (oberste Priorität, siehe unten).
- **Transparenz:** Sidebar zeigt live, was der Agent verstanden hat und welche Pflichtfelder noch offen sind.

## Halluzinations-Schutz (nicht verhandelbar)

Der Agent darf — und kann technisch — niemals:
1. einen Förderbereich erfinden (Whitelist I/II/III/IV in `agent_tools.py` und nochmal in `agent-api.ts`),
2. Felder erfinden, die nicht im FB-Plugin `get_pflicht_felder()` stehen,
3. konkrete Förderhöhen nennen (steht im Bescheid, nicht im Chat),
4. Paragraphen (§) zitieren (steht im Bescheid),
5. außerhalb des AHP-Themas „raten" — off-topic-Wünsche (KFZ, Wohngeld …) werden höflich abgelehnt.

Diese fünf Regeln stehen sowohl im System-Prompt (`agent_chat.SYSTEM_PROMPT`) als auch hart codiert in der Tool-Output-Validierung (`agent_tools.py`) und als zweite Verteidigungsschicht im Frontend (`agent-api.ts: parseDraft`).

## Stack

- Frontend: Vite 6, React 19, Tailwind 4, TypeScript 5
- Backend: FastAPI (`pruefung/`) — `/api/agent/chat` mit Anthropic Tool-Use-Loop
- Tests: Vitest (Frontend, 18 Tests); pytest (Backend, 25 Tests)
- Deployment: Docker Multi-Stage → Nginx → Traefik

## Schnellstart (lokal)

```bash
# Frontend
cd ue4/agent-portal
pnpm install
pnpm dev                     # http://localhost:5175
pnpm test                    # 18 Tests
pnpm build                   # Production-Build

# Backend (in zweitem Terminal)
cd ../../pruefung
uv sync
uv run pytest tests/test_agent_chat.py        # 25 Tests
uv run uvicorn pruefung.main:app --reload     # http://localhost:8000
```

## Demo-Szenario (für die VL)

> „Hallo, wir sind die AWO Würzburg und wollen einen Besuchsdienst für Senior:innen aufbauen."

1. Agent ruft `klassifiziere_foerderbereich` → FB II (Pauschale Förderung Ehrenamt)
2. Agent bestätigt FB beim User
3. Agent fragt nacheinander Pflichtfelder ab (Einrichtung → Ansprechpartner → Adresse → IBAN → Bank-Verbindung → Ehrenamt-Titel → Helfer-Zahlen)
4. Bei IBAN-Eingabe: `validate_field` läuft (Mod-97-Check)
5. Wenn alle Pflichtfelder gesetzt: Agent fragt nach Submit-Bestätigung
6. Nach Bestätigung: `submit_antrag` → Antragsnummer wird angezeigt

## Architektur

```
Browser (agent.butscher.cloud)
   │  POST /api/agent/chat
   │  { session_id, history, user_message, current_draft }
   ▼
pruefung.main:agent_chat_endpoint
   │
   ▼
pruefung.agent_chat.run_agent_turn  ← System-Prompt mit 5 harten Regeln
   │
   │   Anthropic Tool-Use-Loop:
   │      • klassifiziere_foerderbereich (LLM-Sub-Call mit Whitelist)
   │      • get_pflichtfelder           (deterministisch aus Plugin)
   │      • validate_field              (deterministisch)
   │      • submit_antrag               (DB-Insert via service_role)
   ▼
{ assistant_message, updated_draft, next_action, tool_trace }
```

## Deploy

Siehe `DEPLOY_TODO_UE4.md` im Repo-Root für die exakten Schritte (Subdomain anlegen, Backend neu bauen, Frontend-Container starten).
