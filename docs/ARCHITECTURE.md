# Architektur — DigitalisierungVerwaltung Reifegradmodell

Lernfallstudie für die Vorlesung *Innovationsmanagement / Digitalisierung der
Verwaltung* (THWS, Prof. Dr. Robert Butscher). Use Case: Allgemeines
Förderprogramm „Arbeit mit alten Menschen" (APL 2), Stadt Würzburg.

## Reifegradstufen → Übungseinheiten

| UE  | Reifegrad | Domain                            | Tech-Stack                     |
| --- | --------- | --------------------------------- | ------------------------------ |
| UE0 | 0 — Papier-Digitalisierung | Bürger lädt ausgefüllten PDF-Antrag hoch, n8n + Claude Vision OCR füllt den DB-Stub vor | Vanilla-TS / Vite, n8n, Supabase Storage |
| UE1 | 1 — Webformular ohne KI    | Bürger befüllt mehrstufiges Webformular, submitted ans Backend                          | React 19 / Vite, AntragContext, Multi-Sprache |
| UE2 | 2 — Sachbearbeitung manuell | Sachbearbeiter:in sieht Anträge in der Inbox, prüft pro Sektion, kann Bescheid manuell freigeben | React 19, identisches Layout zu UE3 (ohne KI) |
| UE3 | 3 — KI-gestützte Sachbearbeitung | Wie UE2 + KI-Bescheidvorschlag (Claude), Hard-Fail-Validator, Compliance-Cockpit | React 19, `pruefung`-Backend, Anthropic Claude |
| UE4 | 4 — Agentisches Antragsformular  | Konversationsbot „Anna" führt Bürger durch den Antrag, übergibt validiert ans Webformular | React 19 + Anthropic Tool-Use |

## Workspace-Struktur (pnpm)

```
packages/
├── data-layer/           # Supabase-Client, getAntrag/getFb*/listHelfer
├── foerderbereiche/      # FB-Konfig als Daten (Pflichtfelder, Validierungs-Regeln, FB-III-Varianten)
└── antrag-renderer/      # NEU 2026-05-26: Schema + read-only AntragViewer (UE2/UE3)

ue0/upload-portal/        # Vanilla-TS, Bürger-Upload + Sprachpicker
ue1/webformular/          # React: Bürger-Wizard, 5 Sprachen, FB-spezifische Phasen
ue2/sachbearbeiter/       # React: manuelle Prüfung, SektionPruefung, Bescheid-Workflow
ue3/sachbearbeitung-ki/   # React: UE2 + KI-Bescheid, Compliance-Cockpit, Smart-Upload
ue4/agent-portal/         # React: Chat-Bot Anna, Hand-off zu UE1

pruefung/                 # Python FastAPI Backend:
                          #   - LLM-Provider-Abstraktion (Claude / LM-Studio)
                          #   - Hard-Fail-Validator (ahp_norm_statements)
                          #   - Doctree-Pipeline (PDF → OCR → Norm-Aussagen)
                          #   - Agent-Chat (UE4-Backend)

supabase/migrations/      # 069 SQL-Migrationen, kanonisches Schema `apl.*`
supabase/webhooks/        # n8n-Workflows (UE0 OCR, Multi-FB)

scripts/                  # dv-fast-deploy.sh, setup-fast-deploy.sh, demo-reset.sh
materialien/wuerzburg-2026/  # Original-Antrags-PDFs (Quelle der Wahrheit)
```

## Datenfluss

```
                        ┌────────────────────────────────────────────┐
  ┌─── Bürger ──┐       │                                            │
  │ UE0 Upload  │──┐    │                                            │
  │   (PDF)     │  │    │                                            │
  └─────────────┘  │    │                                            │
                   ▼    ▼                                            │
              ┌───────────┐  ┌─────────────────┐  ┌──────────────┐  │
              │   n8n     │→ │  Claude Vision  │→ │ apl.antrag_  │  │
              │  Workflow │  │      OCR        │  │ einreichung  │  │
              └───────────┘  └─────────────────┘  └──────────────┘  │
                                                          │          │
                                                          ▼          │
                                                  ┌──────────────┐   │
  ┌─── Bürger ──┐                                 │ apl.antraege │   │
  │ UE1 Form    │ ─────────── /submit-antrag ───→ │  + fb_i/ii/  │   │
  │ (Web/TR)    │ ←── prefill ───────────────────│  iii/iv-Tab. │   │
  └─────────────┘                                 └──────────────┘   │
        ▲                                                  │          │
        │                                                  │          │
  ┌── Bürger ──┐         ┌────────── Bescheid ───────────┐│          │
  │ UE4 Anna   │ ── Hand-off ──→ UE1 (vorausgefüllt)     ││          │
  │ Chatbot    │                                          ▼▼          │
  └────────────┘                                  ┌──────────────┐   │
                                                  │ Inbox /      │   │
                                                  │ AntragDetail │   │
  ┌── Sachbearbeitung ──────────────────────────→ │ (UE2 manuell │←──┘
  │ UE2/UE3                                       │  / UE3 KI)   │
  └───────────────────────────────────────────────└──────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │ pruefung-API │
                   │ /api/bescheid│  + Hard-Fail-Validator
                   │ Claude LLM   │  + Quellen-Validierung (Halluzinations-Schutz)
                   └──────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │ apl.bescheide│
                   └──────────────┘
```

## Layering

**Frontend-Pakete:**
- `@dv/foerderbereiche` ← Konfig pro FB (welche Felder pflicht? welche Anlagen?)
- `@dv/data-layer` ← PostgREST-Wrapper, exportiert Row-Types
- `@dv/antrag-renderer` ← read-only Anzeige-Komponenten (UE2/UE3)

**Apps importieren:** alle drei Pakete via `workspace:*`.

## Auth-Flow (UE2/UE3)

Self-hosted Supabase mit GoTrue (Magic-Link). Drei wichtige Konfig-Punkte:

1. **`AUTH_REDIRECT` ableiten aus `window.location.origin`** — sonst landet
   die Session beim Login auf `ki.butscher.cloud` auf der falschen Domain
   `amt-ki.butscher.cloud`. Siehe `ue3/.../src/lib/supabase.ts` Kommentar.

2. **`flowType: "implicit"`** im `createClient()` — self-hosted GoTrue
   liefert `#access_token=…` im URL-Fragment (Implicit), nicht `?code=…`
   wie PKCE. Mismatch führt zu „callback_timeout"-Endlos-Loop.

3. **`apl.current_user_role()`-Function** muss `auth.jwt() ->> 'email'`
   nutzen (PostgREST/Supabase-Style), nicht das alte
   `current_setting('request.jwt.claim.email', true)`. Siehe Migration
   `069_apl_service_role_schema_usage.sql`.

## Deploy-Modi

**Klassisch (~20 Min, vollständig isoliert):**
```bash
cd /opt/pruefung/repo/ue3/sachbearbeitung-ki/docker
docker compose build --no-cache amt-ki-frontend
docker compose up -d --force-recreate amt-ki-frontend
```

**Fast-Deploy (<60 Sek, für Code-Änderungen ohne neue Deps):**
```bash
# Einmal-Setup auf VPS:
bash scripts/setup-fast-deploy.sh
# Danach pro Frontend-Update auf dem Mac:
./scripts/dv-fast-deploy.sh ue3
```

Details: `scripts/setup-fast-deploy.sh` mountet
`/opt/dv-dist/{ue2,ue3}` als read-only Volume in den nginx-Container.
`dv-fast-deploy.sh` baut lokal mit `pnpm build` und rsynct die `dist/`.

## Wenn man ein neues Feld ergänzt — Checklist

Damit Bürger (UE1) und Sachbearbeiter (UE2/UE3) IMMER dieselben Felder sehen,
muss eine Änderung an FÜNF Stellen synchron laufen:

1. **DB-Schema**: Migration in `supabase/migrations/`
2. **TypeScript-Type**: `packages/data-layer/src/db-types.ts`
3. **Anzeige-Schema**: `packages/antrag-renderer/src/schemas/fb-*.schema.ts`
4. **Coverage-Test**: `packages/antrag-renderer/tests/field-coverage.test.ts`
   (sonst schlägt CI an — das ist gewollt)
5. **UE1-Editor**: `ue1/.../src/pages/Phase2FB*.tsx` + `state/AntragContext.tsx`
   + ggf. `lib/submit.ts` für DB-Mapping

UE2 + UE3 brauchen **nichts**. Das Schema propagiert automatisch.

## Materialien (Source of Truth für die Fachdomäne)

Alles unter `materialien/wuerzburg-2026/`:
- `antrag-ahp-1-aufbau.pdf` — FB I Originalantrag
- `antrag-ahp-2-engagement.pdf` — FB II
- `antrag-ahp-3-bewaehrte-strukturen.pdf` — FB III (4 Varianten A/B/C/D)
- `antrag-ahp-4-schwerpunkt.pdf` — FB IV
- `anlage-ahp-2-helferliste.pdf` — Helfer-Liste-Vorlage
- `richtlinie-…pdf` — Förderrichtlinie

**Regel:** Es darf NIE etwas erfunden oder hinzugefügt werden, was weder in
der Rechtsgrundlage noch in den PDFs enthalten ist (Halluzinations-Schutz).
