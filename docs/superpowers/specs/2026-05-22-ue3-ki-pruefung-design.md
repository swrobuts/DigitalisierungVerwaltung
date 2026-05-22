# UE3 — KI-gestützte Prüfung von APL2-Anträgen

**Stand:** 2026-05-22 (vormittags)
**Autor:** swrobuts (mit Claude Opus 4.7)
**Vorgänger-Specs:**
- `2026-05-17-roadmap-5-ue-digitalisierung-verwaltung.md` (Roadmap)
- `2026-05-19-endvision-intent-driven-buergerjourney-design.md` (End-Vision, UE3-Schneidung)
- `2026-05-18-ue2-sachbearbeiter-workflow.md` (UE2-Vorgänger des GUI-Forks)
**Status:** Entwurf zur Freigabe

## 1. Vision

UE3 ist der Sprung von „Software speichert + verwaltet Anträge" (UE2) zu „Software liest die Rechtsgrundlage und prüft den Antrag dagegen". Drei Prüf-Ebenen (strukturell, Cross-Field-Ontologie, Richtlinien-Konformität via RAG) liefern ein **archivierbares Prüfprotokoll** mit Verstößen, Hinweisen und Zitaten aus der AHP-Förderrichtlinie. Der Sachbearbeiter behält die finale Entscheidung — UE3 ist Empfehlung mit Begründung, keine Auto-Bewilligung.

Didaktischer Kern: Studis sehen direkt vergleichend, was Stufe 2 (`amt.butscher.cloud`) gegenüber Stufe 3 (`amt-ki.butscher.cloud`) gewinnt. Beide GUIs bleiben parallel live.

## 2. Roadmap-Position

| | UE2 (live) | UE3 (diese Spec) |
|---|---|---|
| **GUI-Subdomain** | `amt.butscher.cloud` | `amt-ki.butscher.cloud` (Fork von UE2) |
| **Sachbearbeiter sieht** | Inbox, Detail, Status-Buttons | + Prüf-Button + Prüfungs-Ergebnis-Karte + PDF-Download |
| **Backend** | nur Supabase | + `pruefung.butscher.cloud` (Python FastAPI) |
| **Orchestrierung** | direktes DB-CRUD | n8n-Workflow als Dirigent zwischen GUI ↔ FastAPI ↔ DB |
| **Wissen** | nichts | AHP-Richtlinie als PageIndex-Doc-Tree in `apl2.ahp_doctree` |
| **Datenmodell** | bestehend | + `ahp_plaene`, `ahp_doctree`, `ontologie_rules`, `pruefprotokoll` (Migrationen 019–021) |

## 3. Architektur

```
┌─────────────────────────────────────────────────────────────┐
│  UE3-GUI amt-ki.butscher.cloud (Fork von UE2)               │
│  → AntragDetail-Page bekommt Button [🔍 Antrag prüfen]      │
│  ← Live-Ergebnis-Karte (Verstöße/Hinweise/Zitate, klappbar) │
│  ← [📄 Protokoll als PDF herunterladen]                     │
└──────────────────┬──────────────────────────────────────────┘
                   │ POST /webhook/pruefung-start { antrag_id }
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  n8n.butscher.cloud — Workflow „APL2-Prüfung"               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 1. Webhook (Trigger)                                │    │
│  │ 2. Antrag aus DB holen (postgrest-Node)             │    │
│  │ 3. POST → pruefung/api/pruefen                      │    │
│  │ 4. Ergebnis in apl2.pruefprotokoll INSERT           │    │
│  │ 5. POST → pruefung/api/pdf (mit protokoll_id)       │    │
│  │ 6. pdf_storage_path zurück in pruefprotokoll        │    │
│  │ 7. Response an GUI: { ergebnis, pdf_storage_path }  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Plus 2 weitere Workflows:                                  │
│  - Trigger „Status → in_pruefung" (pg_net → n8n) → s.o.     │
│  - Cron monatlich → pruefung/api/rebuild-doctree            │
└──────────────────┬──────────────────────────────────────────┘
                   │ /api/pruefen { antrag_id }
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  pruefung.butscher.cloud — Python FastAPI · Docker          │
│  Subdomain via Traefik, TLS via mytlschallenge              │
│  Network: root_default (gleich wie supabase/amt/amt-ki)     │
│                                                             │
│  Endpoints:                                                 │
│  - POST /api/pruefen   → 3-Layer-Result als JSON            │
│  - POST /api/pdf       → weasyprint-PDF in Storage          │
│  - POST /api/rebuild-doctree → PageIndex-Build aus AHP-PDF  │
│                                                             │
│  Layer A: strukturell (Pydantic-Validators)                 │
│  Layer B: Ontologie (json-logic-py + apl2.ontologie_rules)  │
│  Layer C: PageIndex-RAG                                     │
│    - apl2.ahp_doctree (JSONB-Tree)                          │
│    - anthropic SDK + Tool-Use (list/get/search)             │
│    - Output: Verstöße + Zitate + section_path              │
└─────────────────────────────────────────────────────────────┘
```

**Continuity:** Schema `apl2` bleibt erhalten. UE3 nutzt SERVICE_ROLE_KEY (wie Edge Function in UE1), Sachbearbeiter-Auth bleibt JWT-basiert. UE2-GUI auf `amt.butscher.cloud` bleibt unangetastet — Studis sollen vergleichen können.

## 4. Die drei Prüf-Layer

### 4.1 Layer A — Strukturell

Verteidigung in die Tiefe gegenüber dem Frontend. Pydantic-Modelle in FastAPI:

```python
class AntragPruefungInput(BaseModel):
    antragsnummer: str
    iban: str = Field(min_length=15)
    plz: constr(pattern=r"^\d{5}$")
    email: EmailStr
    haushaltsjahr: int = Field(ge=2020, le=2030)
    # + Cross-Constraint-Validators (z.B. BIC-Pflicht wenn IBAN ≠ DE)
```

Verstöße sind hart und deterministisch. Kein LLM-Aufruf.

### 4.2 Layer B — Ontologie via JSON-Logic

Regeln in `apl2.ontologie_rules`. Format [JSON-Logic](https://jsonlogic.com), Auswertung via Python-Lib `json-logic-py`. Beispiel siehe § 5.

Vorteil:
- Neue Regeln per SQL-INSERT, kein Code-Deploy
- Studis erweitern als Hands-on-Aufgabe
- Verstöße referenzieren `paragraph_ref` aus der AHP-Richtlinie

Pro Antrag iteriert FastAPI über alle aktiven Regeln des `plan_id`, evaluiert JSON-Logic gegen Antrag-Payload, sammelt Verstöße + Hinweise.

### 4.3 Layer C — PageIndex-RAG + Claude Tool-Use

**Doc-Tree-Build (offline / Cron):**
1. AHP-Förderrichtlinie-PDF → Section-Erkennung via Heading-Hierarchie (`pypdfium2` + Heuristik)
2. Pro Section: ID, title, parent_id, content, path (z.B. `§ 4.2.1`)
3. Rekursive Tree-Struktur in `tree_jsonb`
4. Versioned per `version`-String (PDF-Datum)

**Prüf-Flow zur Laufzeit:**
1. FastAPI lädt aktuellen Doc-Tree aus `apl2.ahp_doctree`
2. Claude API mit System-Prompt + Antrag-Payload + Tool-Definitionen:
   - `list_sections(parent_id)` → Sub-Sections eines Knotens
   - `get_section(section_id)` → Volltext einer Section
   - `search(query, max_results=5)` → BM25/Volltextsuche im Tree
3. Claude navigiert iterativ, sucht relevante §§ für jeden Aspekt des Antrags
4. **Structured Output** via Tool-Use:

```json
{
  "befunde": [
    {
      "schwere": "verstoss",
      "feld": "miete_jahr_euro",
      "beschreibung": "Geltend gemachte Jahresmiete übersteigt Förderhöchstgrenze.",
      "zitat": "Mietkosten werden bis maximal 12.000 € pro Jahr gefördert.",
      "section_path": "§ 4.2.1",
      "konfidenz": 0.92
    }
  ]
}
```

**Pointe für Lehre:** PageIndex respektiert die natürliche Hierarchie der Richtlinie. Der Agent „liest" das Dokument so, wie ein Jurist es lesen würde — nicht als shuffled Chunks. Bonus-Hands-on: Vergleich gegen naive Vector-Search-RAG.

## 5. Datenmodell — Migrationen 019–021

### Migration 019 — AHP-Pläne + Doc-Tree

```sql
create table apl2.ahp_plaene (
  id text primary key,
  bezeichnung text not null,
  paragraph_in_richtlinie text,
  aktiv boolean not null default true,
  created_at timestamptz default now()
);

insert into apl2.ahp_plaene (id, bezeichnung, paragraph_in_richtlinie) values
  ('APL2', 'Altentagesstätten — Betriebs- und Personalkostenzuschüsse', '§ 4');

create table apl2.ahp_doctree (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  built_at timestamptz not null default now(),
  tree_jsonb jsonb not null,
  source_file text,
  unique (version)
);

create index idx_doctree_version on apl2.ahp_doctree(version desc);
grant select on apl2.ahp_plaene, apl2.ahp_doctree to authenticated, anon, service_role;
```

### Migration 020 — Ontologie-Regeln (+ 5 Seed-Regeln)

```sql
create table apl2.ontologie_rules (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null references apl2.ahp_plaene(id),
  rule_name text not null,
  beschreibung text,
  condition_jsonb jsonb not null,
  fehler_msg_de text not null,
  schwere text not null check (schwere in ('verstoss', 'hinweis')),
  paragraph_ref text,
  aktiv boolean not null default true,
  created_at timestamptz default now(),
  unique (plan_id, rule_name)
);

create index idx_ontologie_rules_plan_aktiv on apl2.ontologie_rules(plan_id, aktiv);

insert into apl2.ontologie_rules (plan_id, rule_name, beschreibung, condition_jsonb, fehler_msg_de, schwere, paragraph_ref) values
  ('APL2', 'miete_xor_unentgeltlich', 'Wenn unentgeltlich, dann Miete = 0',
    '{"if":[{"==":[{"var":"raeume_unentgeltlich"},"ja"]},{"==":[{"var":"miete_jahr_euro"},0]},true]}',
    'Räume sind als unentgeltlich angegeben, aber es wird Miete geltend gemacht.',
    'verstoss', '§ 4.2 AHP-Richtlinie'),
  ('APL2', 'mindestens_eine_kostenposition', 'Kostennachweis erforderlich',
    '{"or":[{">":[{"var":"betriebskosten_vorjahr_euro"},0]},{">":[{"var":"personalkosten_vorjahr_euro"},0]}]}',
    'Mindestens eine Kostenposition muss angegeben sein.',
    'verstoss', '§ 4.1 AHP-Richtlinie'),
  ('APL2', 'wochenplan_min_1_tag', 'Mindestens 1 Öffnungstag',
    '{">=":[{"var":"oeffnungstage_count"},1]}',
    'Eine Altentagesstätte muss mindestens an einem Wochentag geöffnet sein.',
    'verstoss', '§ 4 AHP-Richtlinie'),
  ('APL2', 'plausible_personalkosten', 'Personalkosten plausibel',
    '{"<":[{"var":"personalkosten_pro_oeffnungstag"},2000]}',
    'Personalkosten pro Öffnungstag scheinen ungewöhnlich hoch — bitte prüfen.',
    'hinweis', '§ 4.1 AHP-Richtlinie'),
  ('APL2', 'haushaltsjahr_in_range', 'Haushaltsjahr plausibel',
    '{"and":[{">=":[{"var":"haushaltsjahr"},2024]},{"<=":[{"var":"haushaltsjahr"},2027]}]}',
    'Haushaltsjahr außerhalb des plausiblen Bereichs.',
    'verstoss', '§ 1 AHP-Richtlinie');

grant select on apl2.ontologie_rules to authenticated, anon, service_role;
```

### Migration 021 — Prüfprotokoll + Storage

```sql
create table apl2.pruefprotokoll (
  id uuid primary key default gen_random_uuid(),
  antrag_id uuid not null references apl2.antraege(id) on delete cascade,
  geprueft_am timestamptz not null default now(),
  geprueft_von text,
  doctree_version text,
  ergebnis_jsonb jsonb not null,
  pdf_storage_path text,
  duration_ms integer
);

create index idx_pruefprotokoll_antrag on apl2.pruefprotokoll(antrag_id, geprueft_am desc);

insert into storage.buckets (id, name, public) values
  ('pruefprotokolle', 'pruefprotokolle', false)
on conflict (id) do nothing;

create policy "sachbearbeiter_select_pruefprotokoll" on storage.objects
  for select to authenticated
  using (bucket_id = 'pruefprotokolle' and apl2.current_user_role() is not null);

alter table apl2.pruefprotokoll enable row level security;
create policy "sachbearbeiter_select_pruefprotokoll_table" on apl2.pruefprotokoll
  for select to authenticated using (apl2.current_user_role() is not null);

grant insert, select, update on apl2.pruefprotokoll to service_role;
grant select on apl2.pruefprotokoll to authenticated;
```

### Tree-JSONB-Schema

```typescript
interface DocNode {
  id: string;          // stable, z.B. "sec_4_2_1"
  title: string;       // "§ 4.2.1 Mietkosten"
  path: string;        // "§ 4.2.1"
  level: number;       // Heading-Tiefe 1..5
  content: string;     // Plain-Text der Section (ohne Kinder)
  children: DocNode[];
}
```

## 6. UE3-GUI — amt-ki.butscher.cloud (Fork von UE2)

### 6.1 Repo-Struktur

```
ue3/sachbearbeitung-ki/
├─ package.json                # Fork von ue2/sachbearbeiter
├─ vite.config.ts
├─ tsconfig.json
├─ index.html                  # Title: "Sachbearbeitung KI — APL 2"
├─ src/                        # ALLES aus ue2/sachbearbeiter kopiert
│  ├─ ...
│  └─ components/
│     └─ PruefungsCard.tsx     # NEU
│  └─ hooks/
│     └─ usePruefung.ts        # NEU — fetch + cache
└─ docker/
   ├─ docker-compose.yml       # Subdomain amt-ki.butscher.cloud
   └─ nginx.conf
```

### 6.2 Neue UI-Elemente

**In AntragDetail-Page** (zusätzlich zu UE2-Status-Buttons):

- Neuer Card-Block „🔍 Prüfung" rechts:
  - Button „Antrag prüfen" — disabled wenn schon Prüfung läuft
  - Falls vorherige Prüfung existiert: „Letzte Prüfung: vor 5 Min · 2 Verstöße · 1 Hinweis"
  - Klick öffnet Detail-Tab mit Befunden + PDF-Link

- Neuer Tab/Accordion „Prüfungs-Befunde":
  ```
  Layer A (Strukturell)
    ✓ Alle Pflichtfelder gefüllt
  Layer B (Ontologie-Regeln)
    ✗ § 4.2 — Räume sind unentgeltlich, aber Miete > 0  [Verstoß]
    ⚠ § 4.1 — Personalkosten/Öffnungstag ungewöhnlich   [Hinweis]
  Layer C (Richtlinien-Konformität via RAG)
    ✗ § 4.2.1 — Jahresmiete übersteigt Förderhöchstgrenze (Konfidenz 92%)
        Zitat: „Mietkosten werden bis maximal 12.000 € pro Jahr gefördert."
  ```

- „📄 Protokoll als PDF" — Button mit signed-URL-Download

### 6.3 Tech-Stack

Identisch zu UE2 (Vite 6, React 19, Tailwind 4, eigene ui-Stand-Ins). Nur Erweiterung um `PruefungsCard` + Hook.

## 7. n8n-Workflows

### 7.1 Workflow „APL2-Prüfung" (manueller Trigger via GUI)

Webhook → DB-Read → FastAPI-Call → DB-Write Protokoll → FastAPI-PDF → DB-Update mit pdf_path → Response. Export als JSON in `supabase/webhooks/n8n-apl2-pruefung.json`.

### 7.2 Workflow „Auto-Prüfung bei Status-Wechsel"

`pg_net`-Trigger auf `apl2.antraege` wenn Status → `in_pruefung` → ruft denselben Workflow 7.1 — User sieht später das Ergebnis ohne expliziten Klick. Konfiguration via GUC `app.n8n_pruefung_webhook`.

### 7.3 Workflow „Doc-Tree-Rebuild" (Cron, monatlich)

n8n-Schedule-Trigger (1× pro Monat, 1. um 03:00) → POST `pruefung/api/rebuild-doctree` → FastAPI liest AHP-PDF aus `materialien/`, baut Tree neu, schreibt in `apl2.ahp_doctree` mit neuer Version.

## 8. Tech-Stack FastAPI-Service

```toml
# pyproject.toml
python = "^3.12"
fastapi = "^0.115"
uvicorn = {extras = ["standard"], version = "^0.32"}
anthropic = "^0.39"           # Claude API SDK
pydantic = "^2.9"
httpx = "^0.27"               # für Supabase REST + Storage
json-logic-py = "^1.0"        # Ontologie-Auswertung
pypdfium2 = "^4.30"           # PDF → Text + Headings
weasyprint = "^63"            # PDF-Rendering aus HTML
jinja2 = "^3.1"               # PDF-Template
pytest = "^8"
ruff = "^0.7"                 # Linter + Formatter
```

**Container:** `python:3.12-slim` + WeasyPrint-System-Deps (fonts, cairo, pango). Multi-Stage-Build analog UE2-Pattern.

## 9. Deployment

### DNS (Robert manuell)
- A-Record `amt-ki.butscher.cloud` → `72.61.83.18`
- A-Record `pruefung.butscher.cloud` → `72.61.83.18`

### Subdomains-Setup
- Traefik-Labels in beiden Docker-Compose-Files (`amt-ki-frontend`, `pruefung-service`)
- TLS via `mytlschallenge`, Network `root_default`

### Edge-Function-Anbindung
Nicht nötig — UE3-Backend ist FastAPI, nicht Edge Function.

### Anthropic-API-Key
ENV-Var `ANTHROPIC_API_KEY` in `/root/pruefung/.env`. NICHT ins Repo.

### Migration 022 (Folge-Migration)
GUC `app.n8n_pruefung_webhook` setzen analog UE2:
```sql
alter database postgres set app.n8n_pruefung_webhook = 'https://n8n.butscher.cloud/webhook/apl2-pruefung';
```
Via `supabase_admin` (postgres-User ist nicht Superuser).

## 10. Hands-on-Aufgabe für Studis (UE3-Lehrveranstaltung)

Studis erweitern die Ontologie um eine **neue Regel:**
1. SQL: `INSERT INTO apl2.ontologie_rules ...` mit eigener JSON-Logic
2. Live im UE3-GUI prüfen, ob die Regel triggert
3. Diskussion: Wann ist eine Regel Cross-Field (Layer B) vs. Richtlinien-Frage (Layer C)?
4. **Bonus:** Mit naivem Vector-RAG-Ansatz vergleichen (selbe AHP-PDF, anderes Backend), zeigen warum PageIndex die bessere Treffer-Qualität liefert.

## 11. Akzeptanzkriterien

- [ ] User klickt Prüf-Button in `amt-ki.butscher.cloud` → sieht live-Befunde + PDF-Download
- [ ] PDF wird in Storage abgelegt + ist über signed-URL herunterladbar
- [ ] Ontologie-Regel-Verstöße werden korrekt erkannt (5 Seed-Regeln getestet)
- [ ] PageIndex-RAG liefert für „Miete > Höchstgrenze"-Szenario einen Verstoß mit korrektem Zitat
- [ ] Doc-Tree-Rebuild-Cron funktioniert (manuell via n8n-Execute-Workflow-Button validierbar)
- [ ] Status-Wechsel → in_pruefung triggert automatisch denselben Workflow
- [ ] UE2 (`amt.butscher.cloud`) bleibt funktional unverändert — Studis können vergleichen
- [ ] Prüfprotokoll-Audit-Trail in `apl2.pruefprotokoll` zeigt jeden Lauf mit Dauer + Doctree-Version

## 12. Nicht im Scope (für UE4/UE5)

- **Belege-Extraktion aus Anlagen** (PDF → strukturierte Felder) — kommt in UE4 mit Claude Vision
- **Naturlanguage-Bürger-Chat** über die AHP-Richtlinie — UE4
- **Schema-getriebene Form-Generierung** für die anderen 10 AHP-Pläne — UE5
- **Auto-Bewilligung** ohne Sachbearbeiter — bewusst nicht (Verwaltungs-Verantwortung beim Menschen)
- **Multi-Tenant** — bleibt ausgeschlossen

## 13. Offene Fragen für Implementierung

1. **PageIndex-Build-Strategie:** Eigene Python-Adaption oder VectifyAI/PageIndex direkt als Dependency? — Empfehlung: eigene schlanke Adaption (das Original ist mehr Demo als Library), inspiriert von der Methode. Tree-Build via `pypdfium2` + Heading-Heuristik.
2. **BM25 vs. Embeddings für `search()`-Tool:** BM25 ist deterministisch + ohne externe API. Embeddings (z.B. `sentence-transformers` oder Anthropic-Voyage) bringen semantische Treffer. — Empfehlung: BM25 für MVP, Embeddings als Bonus-Hands-on.
3. **WeasyPrint vs. ReportLab für PDF:** WeasyPrint nimmt HTML+CSS, ReportLab ist programmatisch. — Empfehlung: WeasyPrint (Jinja-Template ist lesbarer und für Studis nachvollziehbar).
4. **Claude-Modell-Wahl:** `claude-3.5-sonnet` reicht, oder `claude-4-sonnet` (falls verfügbar) für besseres Tool-Use? — TBD je nach API-Stand.
5. **Realtime-Update im GUI:** Prüfung dauert 5–15s — soll der UE3-Detail-Status live updaten (postgres-changes-Subscription auf `pruefprotokoll`)? — Empfehlung: ja, analog UE2-Inbox-Realtime.

## 14. Akzeptanzkriterien dieser Spec

- [x] Robert nickt § 1–§ 3 ab (erfolgt im Brainstorming 2026-05-22)
- [x] Spec committed
- [ ] Roadmap-Spec wird upgedatet (UE3-Beschreibung)
- [ ] Nächster Schritt: writing-plans-Skill für Implementation-Plan, mit Phase 0 (Backup, DNS-Check, AHP-PDF-Verfügbarkeit) als erster Task
- [ ] Vor jedem destruktiven VPS-Schritt Robert-OK einholen
