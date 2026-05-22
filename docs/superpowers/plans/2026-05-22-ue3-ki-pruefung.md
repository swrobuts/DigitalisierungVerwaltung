# UE3 KI-gestützte Prüfung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full UE3 pipeline — DB-Migrations (Ontologie+Doctree+Protokoll), Python FastAPI mit 3 Prüf-Layern (strukturell/JSON-Logic/PageIndex-RAG), n8n-Orchestrator-Workflow, PDF-Generierung, und ein eigenständiges UE3-GUI als Fork von UE2 auf `amt-ki.butscher.cloud`.

**Architecture:** UE3-GUI (Fork von UE2) ruft via n8n-Webhook einen FastAPI-Service. FastAPI evaluiert 3 Layer (Pydantic, JSON-Logic gegen `apl2.ontologie_rules`, Claude API mit Tool-Use über `apl2.ahp_doctree`), schreibt Audit in `apl2.pruefprotokoll` und generiert PDF via weasyprint nach Storage-Bucket. Continuity: UE2-GUI auf `amt.butscher.cloud` bleibt unverändert.

**Tech Stack:** Python 3.12 · FastAPI · uvicorn · anthropic SDK · pypdfium2 · weasyprint · json-logic-py · pytest · httpx · Vite/React/TS (für GUI-Fork) · Tailwind 4 · Docker · Traefik · n8n · Supabase Postgres+Storage.

**Vorgänger-Spec:** `docs/superpowers/specs/2026-05-22-ue3-ki-pruefung-design.md`

**Repo-Variable:** `REPO="/Users/robert/Library/CloudStorage/OneDrive-Persönlich/Vorlesungen/Übergreifend/Fallstudien/DigitalisierungVerwaltung"`

**VPS:** `ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud`

---

## Phase 0 — Vorbereitung

### Task 0.1: VPS-Backup vor Migrationen

- [ ] **Step 1: pg_dumpall**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "
  TS=\$(date +%Y-%m-%d-%H%M)
  mkdir -p /root/backups/\${TS}-pre-ue3
  docker exec supabase-db pg_dumpall -U postgres > /root/backups/\${TS}-pre-ue3/full-dump.sql
  ls -lh /root/backups/\${TS}-pre-ue3/
"
```
Expected: full-dump.sql ~3.3 GB.

- [ ] **Step 2: Robert OK einholen** vor Phase 1 (additive Migrationen) — Pflicht aus Spec §14.

### Task 0.2: DNS-Records prüfen

- [ ] **Step 1: DNS dig**

```bash
dig +short amt-ki.butscher.cloud
dig +short pruefung.butscher.cloud
```
Expected: beide `72.61.83.18`. Falls nicht: Robert legt A-Records an (DNS-Provider).

### Task 0.3: Anthropic API Key prüfen

- [ ] **Step 1: ENV checken**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "ls -la /root/pruefung/ 2>/dev/null || echo 'noch nicht da'"
```
Falls Verzeichnis nicht da: wird in Phase 8 angelegt. Robert legt dort `.env` mit `ANTHROPIC_API_KEY=sk-ant-…` an (nicht ins Repo).

---

## Phase 1 — DB-Migrationen 019-022

### Task 1.1: Migration 019 — ahp_plaene + ahp_doctree

**Files:** Create `supabase/migrations/019_ahp_plaene_und_doctree.sql`.

- [ ] **Step 1: Migration schreiben**

```sql
-- 019_ahp_plaene_und_doctree.sql
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
grant insert, update on apl2.ahp_doctree to service_role;
notify pgrst, 'reload schema';
```

- [ ] **Step 2: Anwenden + verify**

```bash
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/019_ahp_plaene_und_doctree.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 < /tmp/019_ahp_plaene_und_doctree.sql"
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c 'select id, bezeichnung from apl2.ahp_plaene;'"
```
Expected: 1 Zeile mit APL2.

- [ ] **Step 3: Commit**

```bash
cd "$REPO" && git add supabase/migrations/019_ahp_plaene_und_doctree.sql && git commit -m "feat(supabase): Migration 019 — ahp_plaene + ahp_doctree für UE3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 1.2: Migration 020 — ontologie_rules mit 5 Seeds

**Files:** Create `supabase/migrations/020_ontologie_rules.sql`.

- [ ] **Step 1: Migration schreiben (komplettes File, siehe Spec § 5)**

```sql
-- 020_ontologie_rules.sql
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
notify pgrst, 'reload schema';
```

- [ ] **Step 2: Anwenden + verify**

```bash
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/020_ontologie_rules.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 < /tmp/020_ontologie_rules.sql"
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c 'select rule_name, schwere from apl2.ontologie_rules order by rule_name;'"
```
Expected: 5 Zeilen.

- [ ] **Step 3: Commit**

```bash
cd "$REPO" && git add supabase/migrations/020_ontologie_rules.sql && git commit -m "feat(supabase): Migration 020 — ontologie_rules + 5 Seed-Regeln APL2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 1.3: Migration 021 — pruefprotokoll + Storage

**Files:** Create `supabase/migrations/021_pruefprotokoll_und_storage.sql`.

- [ ] **Step 1: Migration schreiben**

```sql
-- 021_pruefprotokoll_und_storage.sql
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

drop policy if exists "sachbearbeiter_select_pruefprotokoll" on storage.objects;
create policy "sachbearbeiter_select_pruefprotokoll" on storage.objects
  for select to authenticated
  using (bucket_id = 'pruefprotokolle' and apl2.current_user_role() is not null);

alter table apl2.pruefprotokoll enable row level security;
create policy "sachbearbeiter_select_pruefprotokoll_table" on apl2.pruefprotokoll
  for select to authenticated using (apl2.current_user_role() is not null);

grant insert, select, update on apl2.pruefprotokoll to service_role;
grant select on apl2.pruefprotokoll to authenticated;
notify pgrst, 'reload schema';
```

- [ ] **Step 2: Anwenden + Bucket verifizieren**

```bash
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/021_pruefprotokoll_und_storage.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 < /tmp/021_pruefprotokoll_und_storage.sql"
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c \"select id, public from storage.buckets where id='pruefprotokolle';\""
```

- [ ] **Step 3: Commit**

```bash
cd "$REPO" && git add supabase/migrations/021_pruefprotokoll_und_storage.sql && git commit -m "feat(supabase): Migration 021 — pruefprotokoll + Storage-Bucket

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 1.4: Migration 022 — n8n-Webhook-GUC

**Files:** Create `supabase/migrations/022_n8n_pruefung_webhook_guc.sql`.

- [ ] **Step 1: Migration schreiben**

```sql
-- 022_n8n_pruefung_webhook_guc.sql
-- Setzt App-GUC für n8n-Webhook der UE3-Prüfung.
-- Muss mit supabase_admin gesetzt werden (postgres-User hat keine SUPERUSER-Rechte).
alter database postgres set app.n8n_pruefung_webhook = 'https://n8n.butscher.cloud/webhook/apl2-pruefung';
```

- [ ] **Step 2: Anwenden mit supabase_admin**

```bash
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/022_n8n_pruefung_webhook_guc.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < /tmp/022_n8n_pruefung_webhook_guc.sql"
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -d postgres -c 'show app.n8n_pruefung_webhook;'"
```
Expected: `https://n8n.butscher.cloud/webhook/apl2-pruefung`.

- [ ] **Step 3: Commit**

```bash
cd "$REPO" && git add supabase/migrations/022_n8n_pruefung_webhook_guc.sql && git commit -m "feat(supabase): Migration 022 — GUC app.n8n_pruefung_webhook (via supabase_admin)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — FastAPI Skeleton

### Task 2.1: Verzeichnisstruktur + pyproject.toml

**Files:**
- Create: `pruefung/pyproject.toml`
- Create: `pruefung/src/pruefung/__init__.py`
- Create: `pruefung/src/pruefung/main.py`
- Create: `pruefung/tests/__init__.py`
- Create: `pruefung/tests/test_health.py`
- Create: `pruefung/.gitignore`

- [ ] **Step 1: Verzeichnis + pyproject**

```bash
mkdir -p "$REPO/pruefung/src/pruefung" "$REPO/pruefung/tests"
```

`pruefung/pyproject.toml`:
```toml
[project]
name = "pruefung"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.32",
  "anthropic>=0.39",
  "pydantic[email]>=2.9",
  "httpx>=0.27",
  "json-logic-py>=1.0",
  "pypdfium2>=4.30",
  "weasyprint>=63",
  "jinja2>=3.1",
]

[project.optional-dependencies]
dev = ["pytest>=8", "pytest-asyncio>=0.24", "ruff>=0.7"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
pythonpath = ["src"]

[tool.ruff]
line-length = 100
```

`pruefung/.gitignore`:
```
__pycache__/
*.pyc
.venv/
.pytest_cache/
.ruff_cache/
dist/
build/
*.egg-info/
.env
```

- [ ] **Step 2: Health-Endpoint**

`pruefung/src/pruefung/__init__.py`: (leer)

`pruefung/src/pruefung/main.py`:
```python
"""FastAPI-Service für UE3 KI-gestützte Prüfung von APL2-Anträgen."""
from fastapi import FastAPI

app = FastAPI(title="UE3 APL2-Prüfung", version="0.1.0")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 3: Smoke-Test**

`pruefung/tests/test_health.py`:
```python
from fastapi.testclient import TestClient
from pruefung.main import app

client = TestClient(app)


def test_health_returns_ok():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
```

- [ ] **Step 4: Install + Run**

```bash
cd "$REPO/pruefung" && python3.12 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]" && pytest -v
```
Expected: `test_health_returns_ok PASSED`.

- [ ] **Step 5: Commit**

```bash
cd "$REPO" && git add pruefung/ && git commit -m "feat(ue3): FastAPI-Skeleton + Health-Endpoint + Tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 2.2: Pydantic-Modelle

**Files:** Create `pruefung/src/pruefung/models.py`.

- [ ] **Step 1: Failing Test**

`pruefung/tests/test_models.py`:
```python
from pruefung.models import Befund, PruefungsErgebnis


def test_befund_minimal():
    b = Befund(schwere="verstoss", layer="A", feld="iban", beschreibung="ungültig")
    assert b.schwere == "verstoss"
    assert b.layer == "A"


def test_pruefungs_ergebnis_aggregiert():
    r = PruefungsErgebnis(
        befunde=[
            Befund(schwere="verstoss", layer="A", feld="iban", beschreibung="ungültig"),
            Befund(schwere="hinweis", layer="B", feld="personalkosten", beschreibung="hoch"),
        ],
        doctree_version="2025-03-27",
        duration_ms=123,
    )
    assert r.anzahl_verstoesse() == 1
    assert r.anzahl_hinweise() == 1
    assert r.pruefungsstatus() == "rueckfrage"  # mindestens 1 Verstoss
```

- [ ] **Step 2: Implementation**

`pruefung/src/pruefung/models.py`:
```python
"""Pydantic-Modelle für UE3-Prüfung. Werden auch im Frontend-Output erwartet."""
from typing import Literal
from pydantic import BaseModel, Field

Schwere = Literal["verstoss", "hinweis"]
LayerName = Literal["A", "B", "C"]


class Befund(BaseModel):
    schwere: Schwere
    layer: LayerName
    feld: str | None = None
    beschreibung: str
    zitat: str | None = None
    section_path: str | None = None
    paragraph_ref: str | None = None
    konfidenz: float | None = None  # nur Layer C


class PruefungsErgebnis(BaseModel):
    befunde: list[Befund] = Field(default_factory=list)
    doctree_version: str | None = None
    duration_ms: int | None = None

    def anzahl_verstoesse(self) -> int:
        return sum(1 for b in self.befunde if b.schwere == "verstoss")

    def anzahl_hinweise(self) -> int:
        return sum(1 for b in self.befunde if b.schwere == "hinweis")

    def pruefungsstatus(self) -> Literal["ok", "rueckfrage", "eskalation"]:
        if self.anzahl_verstoesse() == 0:
            return "ok"
        if self.anzahl_verstoesse() < 3:
            return "rueckfrage"
        return "eskalation"


class PruefungsRequest(BaseModel):
    antrag_id: str
    geprueft_von: str | None = None
```

- [ ] **Step 3: Test + Commit**

```bash
cd "$REPO/pruefung" && source .venv/bin/activate && pytest tests/test_models.py -v
cd "$REPO" && git add pruefung/ && git commit -m "feat(ue3): Pydantic-Modelle Befund + PruefungsErgebnis (TDD)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 2.3: DB-Client (Supabase REST via httpx)

**Files:** Create `pruefung/src/pruefung/db.py`.

- [ ] **Step 1: Failing Test**

`pruefung/tests/test_db.py`:
```python
import os
import pytest
from pruefung.db import SupabaseClient


def test_init_requires_envs(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(RuntimeError):
        SupabaseClient.from_env()


def test_init_with_envs(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "http://x")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "k")
    c = SupabaseClient.from_env()
    assert c.url == "http://x"
    assert c.key == "k"
```

- [ ] **Step 2: Implementation**

`pruefung/src/pruefung/db.py`:
```python
"""Supabase REST + Storage-Client (direkter httpx, keine ESM-Klimmzüge wie in UE1)."""
import os
from typing import Any
import httpx


class SupabaseClient:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.key = key
        self._headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept-Profile": "apl2",
            "Content-Profile": "apl2",
        }

    @classmethod
    def from_env(cls) -> "SupabaseClient":
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein")
        return cls(url, key)

    async def select(self, table: str, query: str = "select=*") -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(f"{self.url}/rest/v1/{table}?{query}", headers=self._headers)
            r.raise_for_status()
            return r.json()

    async def insert(self, table: str, rows: list[dict] | dict) -> list[dict]:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                f"{self.url}/rest/v1/{table}",
                json=rows if isinstance(rows, list) else [rows],
                headers={**self._headers, "Prefer": "return=representation"},
            )
            r.raise_for_status()
            return r.json()

    async def upload_storage(self, bucket: str, path: str, content: bytes, content_type: str) -> str:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(
                f"{self.url}/storage/v1/object/{bucket}/{path}",
                content=content,
                headers={**self._headers, "Content-Type": content_type, "x-upsert": "true"},
            )
            r.raise_for_status()
            return path
```

- [ ] **Step 3: Test + Commit**

```bash
cd "$REPO/pruefung" && source .venv/bin/activate && pytest tests/test_db.py -v
cd "$REPO" && git add pruefung/ && git commit -m "feat(ue3): SupabaseClient (httpx) — select/insert/upload_storage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — Layer A (Strukturell)

### Task 3.1: Layer-A-Implementation + Test

**Files:**
- Create: `pruefung/src/pruefung/layer_a_strukturell.py`
- Create: `pruefung/tests/test_layer_a.py`

- [ ] **Step 1: Failing Test**

```python
# tests/test_layer_a.py
from pruefung.layer_a_strukturell import check_strukturell


def test_alle_pflichten_ok():
    antrag = {
        "antragsnummer": "APL2-2026-X-1",
        "iban": "DE89370400440532013000",
        "plz": "97070",
        "email": "x@y.de",
        "haushaltsjahr": 2026,
    }
    befunde = check_strukturell(antrag)
    assert befunde == []


def test_iban_kaputt_meldet_verstoss():
    antrag = {
        "antragsnummer": "X", "iban": "ABC", "plz": "97070", "email": "x@y.de", "haushaltsjahr": 2026,
    }
    b = check_strukturell(antrag)
    assert len(b) == 1
    assert b[0].schwere == "verstoss"
    assert b[0].feld == "iban"


def test_plz_5_ziffern_pflicht():
    antrag = {
        "antragsnummer": "X", "iban": "DE89370400440532013000", "plz": "abc",
        "email": "x@y.de", "haushaltsjahr": 2026,
    }
    b = check_strukturell(antrag)
    assert any(x.feld == "plz" for x in b)
```

- [ ] **Step 2: Implementation**

`pruefung/src/pruefung/layer_a_strukturell.py`:
```python
"""Layer A — strukturelle Validierung (Defense-in-Depth)."""
import re
from pruefung.models import Befund


def _is_valid_iban(s: str) -> bool:
    """ISO 13616 mod-97. Akzeptiert Whitespace."""
    s = re.sub(r"\s+", "", (s or "").upper())
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]+", s) or not 15 <= len(s) <= 34:
        return False
    rearranged = s[4:] + s[:4]
    numeric = "".join(c if c.isdigit() else str(ord(c) - 55) for c in rearranged)
    remainder = 0
    for c in numeric:
        remainder = (remainder * 10 + int(c)) % 97
    return remainder == 1


def _is_valid_email(s: str) -> bool:
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}", s or ""))


def _is_valid_plz(s: str) -> bool:
    return bool(re.fullmatch(r"\d{5}", s or ""))


def check_strukturell(antrag: dict) -> list[Befund]:
    """Strukturelle Checks gegen das Antrag-Payload. Liefert Befunde mit layer='A'."""
    befunde: list[Befund] = []

    if not antrag.get("antragsnummer"):
        befunde.append(Befund(schwere="verstoss", layer="A", feld="antragsnummer",
                              beschreibung="Antragsnummer fehlt."))

    if not _is_valid_iban(antrag.get("iban", "")):
        befunde.append(Befund(schwere="verstoss", layer="A", feld="iban",
                              beschreibung="IBAN ungültig (Format oder mod-97-Checksumme)."))

    if not _is_valid_plz(antrag.get("plz", "")):
        befunde.append(Befund(schwere="verstoss", layer="A", feld="plz",
                              beschreibung="PLZ muss aus 5 Ziffern bestehen."))

    if not _is_valid_email(antrag.get("email", "")):
        befunde.append(Befund(schwere="verstoss", layer="A", feld="email",
                              beschreibung="E-Mail-Format ungültig."))

    jahr = antrag.get("haushaltsjahr")
    if not (isinstance(jahr, int) and 2020 <= jahr <= 2030):
        befunde.append(Befund(schwere="verstoss", layer="A", feld="haushaltsjahr",
                              beschreibung="Haushaltsjahr außerhalb 2020–2030."))

    return befunde
```

- [ ] **Step 3: Test + Commit**

```bash
cd "$REPO/pruefung" && source .venv/bin/activate && pytest tests/test_layer_a.py -v
cd "$REPO" && git add pruefung/ && git commit -m "feat(ue3): Layer A — strukturelle Validierung (IBAN mod-97, PLZ, Email, Haushaltsjahr)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — Layer B (Ontologie/JSON-Logic)

### Task 4.1: JSON-Logic-Evaluator + Rules-Lookup

**Files:**
- Create: `pruefung/src/pruefung/layer_b_ontologie.py`
- Create: `pruefung/tests/test_layer_b.py`

- [ ] **Step 1: Failing Test**

```python
# tests/test_layer_b.py
from pruefung.layer_b_ontologie import evaluate_rule, derive_facts


def test_evaluate_simple_rule_pass():
    rule_cond = {"==": [{"var": "raeume_unentgeltlich"}, "ja"]}
    facts = {"raeume_unentgeltlich": "ja"}
    assert evaluate_rule(rule_cond, facts) is True


def test_evaluate_if_then_pattern():
    # Wenn unentgeltlich, dann miete=0
    cond = {"if": [
        {"==": [{"var": "raeume_unentgeltlich"}, "ja"]},
        {"==": [{"var": "miete_jahr_euro"}, 0]},
        True,
    ]}
    assert evaluate_rule(cond, {"raeume_unentgeltlich": "ja", "miete_jahr_euro": 0}) is True
    assert evaluate_rule(cond, {"raeume_unentgeltlich": "ja", "miete_jahr_euro": 500}) is False
    assert evaluate_rule(cond, {"raeume_unentgeltlich": "nein", "miete_jahr_euro": 500}) is True


def test_derive_facts_addiert_oeffnungstage():
    antrag = {
        "betriebskosten_vorjahr_euro": 100,
        "personalkosten_vorjahr_euro": 200,
        "oeffnungszeiten": [
            {"oeffnungszeit": "10-16", "angebot": "Kaffee"},
            {"oeffnungszeit": "", "angebot": ""},
            {"oeffnungszeit": "10-14", "angebot": "Bingo"},
        ],
    }
    facts = derive_facts(antrag)
    assert facts["oeffnungstage_count"] == 2
    assert facts["personalkosten_pro_oeffnungstag"] == 100
```

- [ ] **Step 2: Implementation**

`pruefung/src/pruefung/layer_b_ontologie.py`:
```python
"""Layer B — Cross-Field-Plausibilität via JSON-Logic gegen apl2.ontologie_rules."""
from typing import Any
from json_logic import jsonLogic
from pruefung.db import SupabaseClient
from pruefung.models import Befund


def evaluate_rule(condition: dict, facts: dict) -> Any:
    """Wrapper um json_logic, damit wir hier eine konsistente Schnittstelle haben."""
    return jsonLogic(condition, facts)


def derive_facts(antrag: dict) -> dict:
    """Aus dem rohen Antrag werden abgeleitete Facts berechnet, auf die
    Regeln zugreifen können (z.B. oeffnungstage_count, personalkosten_pro_oeffnungstag)."""
    facts = dict(antrag)
    oz = antrag.get("oeffnungszeiten") or []
    tage = sum(1 for o in oz if (o.get("oeffnungszeit") or "").strip() or (o.get("angebot") or "").strip())
    facts["oeffnungstage_count"] = tage
    pk = float(antrag.get("personalkosten_vorjahr_euro") or 0)
    facts["personalkosten_pro_oeffnungstag"] = pk / tage if tage > 0 else 0
    return facts


async def check_ontologie(antrag: dict, plan_id: str, db: SupabaseClient) -> list[Befund]:
    """Evaluiert alle aktiven Regeln für plan_id gegen den Antrag. Befunde mit layer='B'."""
    rules = await db.select(
        "ontologie_rules",
        f"plan_id=eq.{plan_id}&aktiv=eq.true&select=rule_name,condition_jsonb,fehler_msg_de,schwere,paragraph_ref",
    )
    facts = derive_facts(antrag)
    befunde: list[Befund] = []
    for r in rules:
        passt = evaluate_rule(r["condition_jsonb"], facts)
        if passt is False or (isinstance(passt, (int, float)) and passt == 0):
            befunde.append(Befund(
                schwere=r["schwere"],
                layer="B",
                beschreibung=r["fehler_msg_de"],
                paragraph_ref=r.get("paragraph_ref"),
            ))
    return befunde
```

- [ ] **Step 3: Test + Commit**

```bash
cd "$REPO/pruefung" && source .venv/bin/activate && pytest tests/test_layer_b.py -v
cd "$REPO" && git add pruefung/ && git commit -m "feat(ue3): Layer B — JSON-Logic-Evaluator + derive_facts (TDD)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 — Doc-Tree-Build

### Task 5.1: PDF → Tree-Struktur

**Files:**
- Create: `pruefung/src/pruefung/doctree_build.py`
- Create: `pruefung/tests/test_doctree_build.py`
- Create: `pruefung/tests/fixtures/mini.pdf` (kleines Test-PDF)

- [ ] **Step 1: Failing Test**

```python
# tests/test_doctree_build.py
from pathlib import Path
from pruefung.doctree_build import extract_text_blocks, build_tree


def test_build_tree_from_blocks_simple():
    blocks = [
        {"text": "§ 1 Geltungsbereich", "size": 14, "page": 1},
        {"text": "Die Richtlinie gilt für ...", "size": 11, "page": 1},
        {"text": "§ 2 Begriffsbestimmungen", "size": 14, "page": 2},
        {"text": "§ 2.1 Altentagesstätte", "size": 12, "page": 2},
        {"text": "Eine Altentagesstätte ist ...", "size": 11, "page": 2},
    ]
    tree = build_tree(blocks)
    assert tree["title"] == "AHP-Förderrichtlinie"  # synthetic root
    sec1 = tree["children"][0]
    assert sec1["path"] == "§ 1"
    assert "Geltungsbereich" in sec1["title"]
    assert "gilt für" in sec1["content"]

    sec2 = tree["children"][1]
    assert sec2["path"] == "§ 2"
    assert len(sec2["children"]) == 1
    assert sec2["children"][0]["path"] == "§ 2.1"
```

- [ ] **Step 2: Implementation**

`pruefung/src/pruefung/doctree_build.py`:
```python
"""PDF → Doc-Tree (PageIndex-Stil).

Heuristik: Heading-Erkennung über Font-Size (größer = höhere Ebene) plus
Pattern `§ N(.M)*` zur Pfad-Konstruktion. Liefert hierarchischen Tree
mit stable IDs, Path-Breadcrumb und Content je Section.
"""
import re
from pathlib import Path
from typing import Any
import pypdfium2 as pdfium


SECTION_RE = re.compile(r"^\s*§\s*(\d+(?:\.\d+)*)\s+(.+?)$")


def extract_text_blocks(pdf_path: Path) -> list[dict[str, Any]]:
    """Liest PDF und extrahiert Text-Blöcke mit Font-Size + Page.

    pypdfium2 liefert kein Heading-Markup direkt — wir nähern an: pro Page
    rufen wir get_textpage().get_text_range() und zerlegen in Zeilen. Größe
    via get_text_bounded() ist approximativ. Für den AHP-PDF reicht das.
    """
    blocks: list[dict[str, Any]] = []
    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        for page_idx, page in enumerate(pdf, start=1):
            tp = page.get_textpage()
            try:
                text = tp.get_text_range()
                for line in text.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    # Heuristik: Zeilen, die wie '§ N(.M)* Titel' aussehen, sind Headings.
                    is_section = bool(SECTION_RE.match(line))
                    blocks.append({
                        "text": line,
                        "size": 14 if is_section else 11,
                        "page": page_idx,
                    })
            finally:
                tp.close()
    finally:
        pdf.close()
    return blocks


def build_tree(blocks: list[dict[str, Any]]) -> dict[str, Any]:
    """Baut hierarchischen Tree aus Blocks. Section-Header werden als Knoten,
    Folge-Zeilen werden als content der aktuellen Section angefügt."""
    root: dict[str, Any] = {
        "id": "root",
        "title": "AHP-Förderrichtlinie",
        "path": "",
        "level": 0,
        "content": "",
        "children": [],
    }
    # Stack: Liste von (level, node)
    stack: list[tuple[int, dict]] = [(0, root)]

    for blk in blocks:
        m = SECTION_RE.match(blk["text"])
        if m:
            path = f"§ {m.group(1)}"
            title = f"§ {m.group(1)} {m.group(2)}"
            level = path.count(".") + 1
            node = {
                "id": f"sec_{m.group(1).replace('.', '_')}",
                "title": title,
                "path": path,
                "level": level,
                "content": "",
                "children": [],
            }
            # Pop bis Parent-Level < current
            while stack and stack[-1][0] >= level:
                stack.pop()
            parent = stack[-1][1] if stack else root
            parent["children"].append(node)
            stack.append((level, node))
        else:
            # Append zum content der aktuellen Top-Node (falls != root)
            top = stack[-1][1] if stack else root
            top["content"] = (top["content"] + " " + blk["text"]).strip()

    return root
```

- [ ] **Step 3: Mini-PDF-Fixture erzeugen**

```bash
cd "$REPO/pruefung/tests/fixtures" && python3.12 -c "
from weasyprint import HTML
html = '''
<html><body>
<h1>§ 1 Geltungsbereich</h1>
<p>Die Richtlinie gilt für Altentagesstätten.</p>
<h1>§ 2 Begriffsbestimmungen</h1>
<h2>§ 2.1 Altentagesstätte</h2>
<p>Eine Altentagesstätte ist eine Einrichtung der offenen Altenhilfe.</p>
</body></html>
'''
HTML(string=html).write_pdf('mini.pdf')
print('mini.pdf erzeugt')
"
```

- [ ] **Step 4: Test + Commit**

```bash
cd "$REPO/pruefung" && source .venv/bin/activate && pytest tests/test_doctree_build.py -v
cd "$REPO" && git add pruefung/ && git commit -m "feat(ue3): doctree_build — PDF → hierarchischer Section-Tree (PageIndex-Stil, TDD)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5.2: Tree-Navigation-Helpers

**Files:**
- Create: `pruefung/src/pruefung/doctree_navigate.py`
- Create: `pruefung/tests/test_doctree_navigate.py`

- [ ] **Step 1: Failing Test**

```python
# tests/test_doctree_navigate.py
from pruefung.doctree_navigate import list_sections, get_section, search_tree

TREE = {
    "id": "root",
    "title": "AHP",
    "path": "",
    "level": 0,
    "content": "",
    "children": [
        {"id": "sec_1", "title": "§ 1 Geltung", "path": "§ 1", "level": 1,
         "content": "Diese Richtlinie regelt die Förderung von Altentagesstätten.", "children": []},
        {"id": "sec_4", "title": "§ 4 Förderung", "path": "§ 4", "level": 1, "content": "", "children": [
            {"id": "sec_4_2", "title": "§ 4.2 Miete", "path": "§ 4.2", "level": 2,
             "content": "Mietkosten bis 12000 Euro pro Jahr.", "children": []},
        ]},
    ],
}


def test_list_sections_root():
    items = list_sections(TREE, "root")
    assert len(items) == 2
    assert items[0]["path"] == "§ 1"


def test_list_sections_nested():
    items = list_sections(TREE, "sec_4")
    assert len(items) == 1
    assert items[0]["path"] == "§ 4.2"


def test_get_section_returns_content():
    sec = get_section(TREE, "sec_4_2")
    assert "12000" in sec["content"]


def test_get_section_not_found_returns_none():
    assert get_section(TREE, "sec_99") is None


def test_search_finds_keyword():
    hits = search_tree(TREE, "Mietkosten")
    assert any(h["id"] == "sec_4_2" for h in hits)
```

- [ ] **Step 2: Implementation**

`pruefung/src/pruefung/doctree_navigate.py`:
```python
"""Tree-Navigation für Claude-Tool-Use (list/get/search)."""
from typing import Any


def _walk(tree: dict, fn) -> None:
    fn(tree)
    for child in tree.get("children", []):
        _walk(child, fn)


def _find_node(tree: dict, node_id: str) -> dict | None:
    if tree.get("id") == node_id:
        return tree
    for child in tree.get("children", []):
        hit = _find_node(child, node_id)
        if hit is not None:
            return hit
    return None


def list_sections(tree: dict, parent_id: str) -> list[dict[str, Any]]:
    """Direkte Kinder eines Knotens, kompakte Ausgabe (id/title/path/level)."""
    parent = _find_node(tree, parent_id)
    if parent is None:
        return []
    return [
        {"id": c["id"], "title": c["title"], "path": c["path"], "level": c["level"]}
        for c in parent.get("children", [])
    ]


def get_section(tree: dict, section_id: str) -> dict | None:
    """Volle Section inkl. content. None wenn nicht gefunden."""
    return _find_node(tree, section_id)


def search_tree(tree: dict, query: str, max_results: int = 5) -> list[dict]:
    """Volltext-Search (case-insensitive substring) im content+title."""
    q = (query or "").lower()
    if not q:
        return []
    hits: list[tuple[int, dict]] = []

    def visit(node: dict) -> None:
        title_hit = q in node.get("title", "").lower()
        content_hit = q in node.get("content", "").lower()
        if title_hit or content_hit:
            # einfaches Scoring: title-Treffer wertvoller als content
            score = (10 if title_hit else 0) + (1 if content_hit else 0)
            hits.append((score, node))

    _walk(tree, visit)
    hits.sort(key=lambda x: -x[0])
    return [
        {"id": n["id"], "title": n["title"], "path": n["path"], "content": n["content"][:200]}
        for _, n in hits[:max_results]
    ]
```

- [ ] **Step 3: Test + Commit**

```bash
cd "$REPO/pruefung" && source .venv/bin/activate && pytest tests/test_doctree_navigate.py -v
cd "$REPO" && git add pruefung/ && git commit -m "feat(ue3): doctree_navigate — list_sections / get_section / search_tree (TDD)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 6 — Layer C (Claude + Tool-Use)

### Task 6.1: Claude-Tool-Use-Loop

**Files:**
- Create: `pruefung/src/pruefung/layer_c_rag.py`
- Create: `pruefung/tests/test_layer_c.py`

- [ ] **Step 1: Failing Test (mit gemocktem Claude)**

```python
# tests/test_layer_c.py
from unittest.mock import AsyncMock, MagicMock
import pytest
from pruefung.layer_c_rag import check_rag


@pytest.mark.asyncio
async def test_check_rag_returns_befunde_from_claude_output(monkeypatch):
    """Wir mocken den Claude-Call und stellen sicher, dass die Befunde
    korrekt in unsere Befund-Modelle übersetzt werden."""
    tree = {
        "id": "root", "title": "AHP", "path": "", "level": 0,
        "content": "", "children": [
            {"id": "sec_4_2", "title": "§ 4.2 Miete", "path": "§ 4.2",
             "level": 1, "content": "Höchstgrenze 12000 €/Jahr.", "children": []},
        ],
    }
    antrag = {"miete_jahr_euro": 20000}

    # Fake-Antwort: Claude liefert in der finalen Message ein structured JSON
    fake_response = {
        "befunde": [
            {
                "schwere": "verstoss",
                "feld": "miete_jahr_euro",
                "beschreibung": "Miete übersteigt § 4.2-Höchstgrenze.",
                "zitat": "Höchstgrenze 12000 €/Jahr.",
                "section_path": "§ 4.2",
                "konfidenz": 0.95,
            }
        ]
    }

    async def fake_claude_loop(tree, antrag, model):
        return fake_response

    monkeypatch.setattr("pruefung.layer_c_rag._run_claude_loop", fake_claude_loop)

    befunde = await check_rag(tree, antrag)
    assert len(befunde) == 1
    assert befunde[0].layer == "C"
    assert befunde[0].schwere == "verstoss"
    assert befunde[0].section_path == "§ 4.2"
    assert befunde[0].konfidenz == 0.95
```

- [ ] **Step 2: Implementation**

`pruefung/src/pruefung/layer_c_rag.py`:
```python
"""Layer C — PageIndex-Stil RAG via Claude Tool-Use.

Strategie:
- Claude bekommt System-Prompt + Antrag-Payload + Tool-Definitionen
- Claude navigiert iterativ den Doctree, ruft list/get/search
- Im finalen Schritt: Claude returnt structured JSON mit Befunden + Zitaten
"""
import json
import os
from typing import Any
from anthropic import AsyncAnthropic
from pruefung.doctree_navigate import list_sections, get_section, search_tree
from pruefung.models import Befund


SYSTEM_PROMPT = """Du bist Verwaltungs-Prüfer der Stadt Würzburg.
Du prüfst einen APL2-Antrag gegen die AHP-Förderrichtlinie.
Die Richtlinie liegt als hierarchischer Doc-Tree vor — du navigierst sie via Tools.

Vorgehen:
1. Verschaffe dir Überblick: list_sections(parent_id='root')
2. Für relevante Themen-Bereiche: search(query="...") oder get_section(section_id="...")
3. Vergleiche Antrag-Werte mit Richtlinien-Vorgaben
4. Liefere strukturierte Befunde — Verstöße (gegen klare Grenzen) und Hinweise (Plausibilitäts-Anzeichen)

Pro Befund: schwere (verstoss|hinweis), feld (welches Antragsfeld), beschreibung (knapp, deutsch),
zitat (1 Satz aus der Richtlinie), section_path (z.B. § 4.2), konfidenz (0..1).

Antworte FINAL mit reinem JSON: {"befunde": [...]}.
Wenn keine Befunde: {"befunde": []}.
"""


TOOLS = [
    {
        "name": "list_sections",
        "description": "Direkte Kinder einer Section auflisten (id/title/path/level).",
        "input_schema": {"type": "object", "properties": {"parent_id": {"type": "string"}}, "required": ["parent_id"]},
    },
    {
        "name": "get_section",
        "description": "Volle Section inkl. content abrufen.",
        "input_schema": {"type": "object", "properties": {"section_id": {"type": "string"}}, "required": ["section_id"]},
    },
    {
        "name": "search",
        "description": "Volltextsuche im Tree (case-insensitive substring). Liefert bis 5 Treffer mit content-Vorschau.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}, "max_results": {"type": "integer", "default": 5}},
            "required": ["query"],
        },
    },
]


async def _run_claude_loop(tree: dict, antrag: dict, model: str) -> dict[str, Any]:
    """Führt Tool-Use-Loop bis Claude ein final-message mit JSON liefert.
    Max 15 Tool-Iterationen als Safety-Bound."""
    client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    messages: list[dict] = [
        {"role": "user", "content": f"Antrag-Payload:\n```json\n{json.dumps(antrag, indent=2, ensure_ascii=False)}\n```\nPrüfe diesen Antrag gegen die AHP-Richtlinie."},
    ]

    for _ in range(15):
        resp = await client.messages.create(
            model=model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )
        if resp.stop_reason == "tool_use":
            tool_uses = [b for b in resp.content if b.type == "tool_use"]
            messages.append({"role": "assistant", "content": resp.content})
            tool_results: list[dict] = []
            for tu in tool_uses:
                if tu.name == "list_sections":
                    result = list_sections(tree, tu.input["parent_id"])
                elif tu.name == "get_section":
                    result = get_section(tree, tu.input["section_id"]) or {}
                elif tu.name == "search":
                    result = search_tree(tree, tu.input["query"], tu.input.get("max_results", 5))
                else:
                    result = {"error": f"unknown tool {tu.name}"}
                tool_results.append({"type": "tool_result", "tool_use_id": tu.id, "content": json.dumps(result, ensure_ascii=False)})
            messages.append({"role": "user", "content": tool_results})
            continue

        # Final response — extract JSON
        text = "".join(b.text for b in resp.content if b.type == "text")
        # Robustly extract JSON-block (may be wrapped in ```json)
        import re
        m = re.search(r"\{[\s\S]*\}", text)
        if m is None:
            return {"befunde": []}
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            return {"befunde": []}

    return {"befunde": []}


async def check_rag(tree: dict, antrag: dict, model: str = "claude-sonnet-4-5") -> list[Befund]:
    """Layer-C-Eintrittspunkt. Liefert Befund-Liste."""
    raw = await _run_claude_loop(tree, antrag, model)
    out: list[Befund] = []
    for r in raw.get("befunde", []):
        out.append(Befund(
            schwere=r.get("schwere", "hinweis"),
            layer="C",
            feld=r.get("feld"),
            beschreibung=r.get("beschreibung", ""),
            zitat=r.get("zitat"),
            section_path=r.get("section_path"),
            konfidenz=r.get("konfidenz"),
        ))
    return out
```

- [ ] **Step 3: Test + Commit**

```bash
cd "$REPO/pruefung" && source .venv/bin/activate && pytest tests/test_layer_c.py -v
cd "$REPO" && git add pruefung/ && git commit -m "feat(ue3): Layer C — Claude Tool-Use-Loop über Doc-Tree, structured Befunde

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 7 — Endpoints integrieren

### Task 7.1: /api/pruefen-Endpoint

**Files:** Modify `pruefung/src/pruefung/main.py`. Create `pruefung/tests/test_endpoint_pruefen.py`.

- [ ] **Step 1: Failing Test**

```python
# tests/test_endpoint_pruefen.py
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient
from pruefung.main import app

client = TestClient(app)


def test_pruefen_returns_400_ohne_antrag_id():
    r = client.post("/api/pruefen", json={})
    assert r.status_code == 422  # Pydantic-Validation


@patch("pruefung.main._fetch_antrag", new_callable=AsyncMock)
@patch("pruefung.main.check_ontologie", new_callable=AsyncMock)
@patch("pruefung.main.check_rag", new_callable=AsyncMock)
def test_pruefen_aggregiert_3_layer(mock_rag, mock_b, mock_a):
    from pruefung.models import Befund
    mock_a.return_value = {
        "iban": "DE89370400440532013000", "plz": "97070", "email": "x@y.de",
        "haushaltsjahr": 2026, "antragsnummer": "X",
        "oeffnungszeiten": [], "raeume_unentgeltlich": "ja", "miete_jahr_euro": 0,
        "betriebskosten_vorjahr_euro": 100, "personalkosten_vorjahr_euro": 0,
    }
    mock_b.return_value = [Befund(schwere="hinweis", layer="B", beschreibung="X")]
    mock_rag.return_value = [Befund(schwere="verstoss", layer="C", beschreibung="Y", section_path="§ 4.2")]
    r = client.post("/api/pruefen", json={"antrag_id": "00000000-0000-0000-0000-000000000001"})
    assert r.status_code == 200
    data = r.json()
    assert data["anzahl_verstoesse"] >= 1
    assert any(b["layer"] == "C" for b in data["befunde"])
```

- [ ] **Step 2: Implementation**

Vollständige `pruefung/src/pruefung/main.py`:

```python
"""FastAPI-Service für UE3 KI-gestützte Prüfung von APL2-Anträgen."""
import time
from typing import Any
from fastapi import FastAPI, HTTPException
from pruefung.db import SupabaseClient
from pruefung.layer_a_strukturell import check_strukturell
from pruefung.layer_b_ontologie import check_ontologie
from pruefung.layer_c_rag import check_rag
from pruefung.models import Befund, PruefungsErgebnis, PruefungsRequest


app = FastAPI(title="UE3 APL2-Prüfung", version="0.1.0")


async def _fetch_antrag(antrag_id: str, db: SupabaseClient) -> dict[str, Any]:
    rows = await db.select(
        "antrag_mit_summen",
        f"id=eq.{antrag_id}&select=id,antragsnummer,haushaltsjahr,name,traeger,strasse,hausnummer,plz,ort,bankverbindung,iban,bic,ansprechpartner,telefon,email,raeume_vorhanden,raeume_unentgeltlich,betriebskosten_vorjahr_euro,personalkosten_vorjahr_euro,miete_jahr_euro",
    )
    if not rows:
        raise HTTPException(404, f"Antrag {antrag_id} nicht gefunden")
    antrag = rows[0]
    # Öffnungszeiten dazu
    oz = await db.select("oeffnungszeit", f"antrag_id=eq.{antrag_id}&select=wochentag,oeffnungszeit,angebot")
    antrag["oeffnungszeiten"] = oz
    return antrag


async def _fetch_doctree(db: SupabaseClient) -> tuple[dict, str | None]:
    rows = await db.select("ahp_doctree", "select=version,tree_jsonb&order=built_at.desc&limit=1")
    if not rows:
        return {"id": "root", "title": "AHP (leer)", "path": "", "level": 0, "content": "", "children": []}, None
    return rows[0]["tree_jsonb"], rows[0]["version"]


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/pruefen")
async def pruefen(req: PruefungsRequest) -> dict[str, Any]:
    """Orchestriert die 3 Layer und schreibt apl2.pruefprotokoll."""
    start = time.monotonic()
    db = SupabaseClient.from_env()
    antrag = await _fetch_antrag(req.antrag_id, db)

    befunde: list[Befund] = []
    befunde.extend(check_strukturell(antrag))
    befunde.extend(await check_ontologie(antrag, plan_id="APL2", db=db))
    tree, version = await _fetch_doctree(db)
    if tree.get("children"):
        befunde.extend(await check_rag(tree, antrag))

    duration_ms = int((time.monotonic() - start) * 1000)
    ergebnis = PruefungsErgebnis(befunde=befunde, doctree_version=version, duration_ms=duration_ms)

    # Audit-Trail schreiben
    protokoll = await db.insert("pruefprotokoll", {
        "antrag_id": req.antrag_id,
        "geprueft_von": req.geprueft_von,
        "doctree_version": version,
        "ergebnis_jsonb": ergebnis.model_dump(),
        "duration_ms": duration_ms,
    })
    protokoll_id = protokoll[0]["id"] if protokoll else None

    return {
        "protokoll_id": protokoll_id,
        "anzahl_verstoesse": ergebnis.anzahl_verstoesse(),
        "anzahl_hinweise": ergebnis.anzahl_hinweise(),
        "pruefungsstatus": ergebnis.pruefungsstatus(),
        "doctree_version": version,
        "duration_ms": duration_ms,
        "befunde": [b.model_dump() for b in befunde],
    }
```

- [ ] **Step 3: Test + Commit**

```bash
cd "$REPO/pruefung" && source .venv/bin/activate && pytest tests/test_endpoint_pruefen.py -v
cd "$REPO" && git add pruefung/ && git commit -m "feat(ue3): /api/pruefen orchestriert 3 Layer + schreibt pruefprotokoll

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 7.2: /api/pdf-Endpoint mit weasyprint

**Files:**
- Create: `pruefung/src/pruefung/pdf_render.py`
- Create: `pruefung/src/pruefung/templates/protokoll.html.j2`
- Modify: `pruefung/src/pruefung/main.py`
- Create: `pruefung/tests/test_pdf_render.py`

- [ ] **Step 1: Failing Test**

```python
# tests/test_pdf_render.py
from pruefung.pdf_render import render_protokoll_pdf
from pruefung.models import Befund, PruefungsErgebnis


def test_render_pdf_returns_bytes():
    ergebnis = PruefungsErgebnis(
        befunde=[Befund(schwere="verstoss", layer="A", feld="iban", beschreibung="ungültig")],
        doctree_version="2025-03-27",
        duration_ms=234,
    )
    pdf = render_protokoll_pdf(
        antrag={"antragsnummer": "APL2-2026-X-1", "name": "Test", "traeger": "Träger X"},
        ergebnis=ergebnis,
    )
    assert isinstance(pdf, bytes)
    assert pdf.startswith(b"%PDF-")
```

- [ ] **Step 2: Template**

`pruefung/src/pruefung/templates/protokoll.html.j2`:
```html
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Prüfprotokoll {{ antrag.antragsnummer }}</title>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: "Open Sans", sans-serif; color: #1a1a1a; }
  h1 { border-bottom: 2px solid #AD0E36; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #d6d6d6; vertical-align: top; }
  .verstoss { color: #b00020; font-weight: 600; }
  .hinweis { color: #b07a00; font-weight: 600; }
  .zitat { font-style: italic; color: #555; margin-top: 4px; }
  .meta { color: #6a6a6a; font-size: 11px; margin-bottom: 12px; }
</style>
</head>
<body>
<h1>Prüfprotokoll · {{ antrag.antragsnummer }}</h1>
<p class="meta">
  Einrichtung: {{ antrag.name }} · Träger: {{ antrag.traeger }}<br>
  Geprüft am: {{ geprueft_am }} · Doctree-Version: {{ ergebnis.doctree_version or "—" }} · Dauer: {{ ergebnis.duration_ms }} ms
</p>
<p>
  <strong>{{ verstoesse }}</strong> Verstöße · <strong>{{ hinweise }}</strong> Hinweise · Status: <strong>{{ status }}</strong>
</p>

{% if ergebnis.befunde %}
<table>
<thead><tr><th>Layer</th><th>Schwere</th><th>Feld</th><th>Befund</th></tr></thead>
<tbody>
{% for b in ergebnis.befunde %}
<tr>
  <td>{{ b.layer }}</td>
  <td class="{{ b.schwere }}">{{ b.schwere }}</td>
  <td>{{ b.feld or "—" }}</td>
  <td>
    {{ b.beschreibung }}
    {% if b.zitat %}<div class="zitat">„{{ b.zitat }}"{% if b.section_path %} ({{ b.section_path }}){% endif %}</div>{% endif %}
    {% if b.paragraph_ref %}<div class="zitat">Bezug: {{ b.paragraph_ref }}</div>{% endif %}
  </td>
</tr>
{% endfor %}
</tbody>
</table>
{% else %}
<p>Keine Befunde — Antrag ist strukturell und inhaltlich konform.</p>
{% endif %}
</body>
</html>
```

- [ ] **Step 3: Renderer**

`pruefung/src/pruefung/pdf_render.py`:
```python
"""HTML→PDF via weasyprint + Jinja-Template."""
from datetime import datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML
from pruefung.models import PruefungsErgebnis


_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=True,
)


def render_protokoll_pdf(antrag: dict, ergebnis: PruefungsErgebnis) -> bytes:
    tpl = _env.get_template("protokoll.html.j2")
    html = tpl.render(
        antrag=antrag,
        ergebnis=ergebnis,
        geprueft_am=datetime.now().strftime("%d.%m.%Y %H:%M"),
        verstoesse=ergebnis.anzahl_verstoesse(),
        hinweise=ergebnis.anzahl_hinweise(),
        status=ergebnis.pruefungsstatus(),
    )
    return HTML(string=html).write_pdf()
```

- [ ] **Step 4: /api/pdf-Endpoint hinzufügen** — anhängen in `main.py`:

```python
from pruefung.pdf_render import render_protokoll_pdf


@app.post("/api/pdf")
async def pdf(protokoll_id: str) -> dict[str, str]:
    db = SupabaseClient.from_env()
    pr = await db.select("pruefprotokoll", f"id=eq.{protokoll_id}&select=antrag_id,ergebnis_jsonb")
    if not pr:
        raise HTTPException(404, "Protokoll nicht gefunden")
    antrag_id = pr[0]["antrag_id"]
    ergebnis = PruefungsErgebnis(**pr[0]["ergebnis_jsonb"])
    antrag_rows = await db.select("antraege", f"id=eq.{antrag_id}&select=antragsnummer,name,traeger")
    antrag = antrag_rows[0] if antrag_rows else {}
    pdf_bytes = render_protokoll_pdf(antrag, ergebnis)
    path = f"{antrag_id}/{protokoll_id}.pdf"
    await db.upload_storage("pruefprotokolle", path, pdf_bytes, "application/pdf")
    # Pfad zurück in pruefprotokoll schreiben
    async with httpx.AsyncClient(timeout=30) as c:
        await c.patch(
            f"{db.url}/rest/v1/pruefprotokoll?id=eq.{protokoll_id}",
            json={"pdf_storage_path": path},
            headers={**db._headers, "Prefer": "return=minimal"},
        )
    return {"pdf_storage_path": path}
```

Plus oben in `main.py` ergänzen: `import httpx`.

- [ ] **Step 5: Test + Commit**

```bash
cd "$REPO/pruefung" && source .venv/bin/activate && pytest tests/test_pdf_render.py -v
cd "$REPO" && git add pruefung/ && git commit -m "feat(ue3): PDF-Rendering (weasyprint+Jinja) + /api/pdf-Endpoint mit Storage-Upload

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 7.3: /api/rebuild-doctree-Endpoint

**Files:** Modify `pruefung/src/pruefung/main.py`. Add test in `pruefung/tests/test_endpoint_rebuild.py`.

- [ ] **Step 1: Endpoint hinzufügen**

In `main.py`:
```python
from pathlib import Path
from pruefung.doctree_build import extract_text_blocks, build_tree


@app.post("/api/rebuild-doctree")
async def rebuild_doctree(version: str | None = None) -> dict[str, str]:
    """Liest AHP-PDF aus /app/materialien/, baut Tree, schreibt in DB."""
    pdf_path = Path("/app/materialien/foerderrichtlinie-ahp-2025-03-27.pdf")
    if not pdf_path.exists():
        raise HTTPException(500, f"PDF nicht gefunden unter {pdf_path}")
    blocks = extract_text_blocks(pdf_path)
    tree = build_tree(blocks)
    db = SupabaseClient.from_env()
    v = version or pdf_path.stem.replace("foerderrichtlinie-ahp-", "")
    # Vorhandene Version löschen, dann einfügen
    async with httpx.AsyncClient(timeout=30) as c:
        await c.delete(
            f"{db.url}/rest/v1/ahp_doctree?version=eq.{v}",
            headers={**db._headers},
        )
    await db.insert("ahp_doctree", {
        "version": v,
        "tree_jsonb": tree,
        "source_file": pdf_path.name,
    })
    return {"status": "ok", "version": v, "sections": str(len(tree.get("children", [])))}
```

- [ ] **Step 2: Smoke-Test (kein TDD-Test wegen Filesystem-Abhängigkeit)** — wird in Phase 11 manuell verifiziert.

- [ ] **Step 3: Commit**

```bash
cd "$REPO" && git add pruefung/ && git commit -m "feat(ue3): /api/rebuild-doctree liest AHP-PDF + persistiert Tree in apl2.ahp_doctree

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 8 — Docker + Deploy FastAPI

### Task 8.1: Dockerfile

**Files:** Create `pruefung/Dockerfile`.

- [ ] **Step 1: Dockerfile**

```dockerfile
# Multi-Stage: Build-Layer mit Compile-Deps für weasyprint, Runtime schlank
FROM python:3.12-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \
    fonts-open-sans \
 && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir .

COPY src ./src
COPY tests ./tests

FROM python:3.12-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \
    fonts-open-sans \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=build /usr/local/bin /usr/local/bin
COPY --from=build /app/src /app/src
ENV PYTHONPATH=/app/src
EXPOSE 8000
CMD ["uvicorn", "pruefung.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Task 8.2: docker-compose mit Traefik

**Files:** Create `pruefung/docker/docker-compose.yml` + `.env.example`.

`pruefung/docker/docker-compose.yml`:
```yaml
services:
  pruefung-service:
    container_name: pruefung-service
    build:
      context: ..
      dockerfile: Dockerfile
    image: pruefung-service:latest
    restart: unless-stopped
    environment:
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    volumes:
      - /opt/pruefung/materialien:/app/materialien:ro
    networks:
      - root_default
    labels:
      - traefik.enable=true
      - traefik.docker.network=root_default
      - traefik.http.routers.pruefung-http.rule=Host(`pruefung.butscher.cloud`)
      - traefik.http.routers.pruefung-http.entrypoints=web
      - traefik.http.routers.pruefung-http.middlewares=pruefung-https-redirect
      - traefik.http.middlewares.pruefung-https-redirect.redirectscheme.scheme=https
      - traefik.http.routers.pruefung.rule=Host(`pruefung.butscher.cloud`)
      - traefik.http.routers.pruefung.entrypoints=websecure
      - traefik.http.routers.pruefung.tls=true
      - traefik.http.routers.pruefung.tls.certresolver=mytlschallenge
      - traefik.http.routers.pruefung.service=pruefung
      - traefik.http.services.pruefung.loadbalancer.server.port=8000

networks:
  root_default:
    external: true
```

`pruefung/docker/.env.example`:
```bash
SUPABASE_URL=http://supabase-kong:8000
SUPABASE_SERVICE_ROLE_KEY=<aus /root/supabase/docker/.env>
ANTHROPIC_API_KEY=sk-ant-<schluessel>
```

### Task 8.3: VPS-Deployment

- [ ] **Step 1: Repo klonen + AHP-PDF kopieren**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "
  mkdir -p /opt/pruefung
  if [ -d /opt/pruefung/repo/.git ]; then
    cd /opt/pruefung/repo && git pull
  else
    git clone https://github.com/swrobuts/DigitalisierungVerwaltung.git /opt/pruefung/repo
  fi
  mkdir -p /opt/pruefung/materialien
  cp /opt/pruefung/repo/materialien/foerderrichtlinie-ahp-2025-03-27.pdf /opt/pruefung/materialien/
  ls -lh /opt/pruefung/materialien/
"
```

- [ ] **Step 2: .env befüllen**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "
  cd /opt/pruefung/repo/pruefung/docker
  cp -n .env.example .env
  SR=\$(grep ^SERVICE_ROLE_KEY /root/supabase/docker/.env | cut -d= -f2)
  sed -i \"s|SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=\${SR}|\" .env
  echo 'ANTHROPIC_API_KEY noch von Robert manuell setzen!'
  grep ANTHROPIC .env
"
```

- [ ] **Step 3: Robert setzt ANTHROPIC_API_KEY** in `.env` — Plan-Ausführer warnt explizit + wartet.

- [ ] **Step 4: Build + up**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "
  cd /opt/pruefung/repo/pruefung/docker
  docker compose --env-file .env build pruefung-service 2>&1 | tail -10
  docker compose --env-file .env up -d pruefung-service 2>&1 | tail -3
"
sleep 20
curl -ksI https://pruefung.butscher.cloud/api/health | head -3
curl -ks https://pruefung.butscher.cloud/api/health
```
Expected: HTTP 200, `{"status": "ok"}`.

- [ ] **Step 5: Doc-Tree initial bauen**

```bash
curl -ks -X POST https://pruefung.butscher.cloud/api/rebuild-doctree
```
Expected: `{"status": "ok", "version": "2025-03-27", "sections": "N"}` (mehr als 0).

- [ ] **Step 6: Commit Dockerfile/Compose**

```bash
cd "$REPO" && git add pruefung/Dockerfile pruefung/docker/ && git commit -m "feat(ue3): Dockerfile + docker-compose mit Traefik für pruefung.butscher.cloud

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 9 — n8n-Workflows

### Task 9.1: Orchestrator-Workflow

**Files:** Create `supabase/webhooks/n8n-apl2-pruefung.json`.

- [ ] **Step 1: Workflow-JSON schreiben** (Workflow-Skelett — Robert importiert in n8n und nimmt finale Anpassungen vor):

```json
{
  "name": "APL2 — Prüfung Orchestrator",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "apl2-pruefung",
        "responseMode": "lastNode",
        "options": {}
      },
      "id": "wh-1",
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1.1,
      "position": [200, 300],
      "webhookId": "apl2-pruefung"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://pruefung-service:8000/api/pruefen",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={\n  \"antrag_id\": \"{{ $json.body.antrag_id }}\",\n  \"geprueft_von\": \"{{ $json.body.geprueft_von }}\"\n}"
      },
      "id": "pruefen-1",
      "name": "Pruefen Endpoint",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [460, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://pruefung-service:8000/api/pdf",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [{ "name": "protokoll_id", "value": "={{ $json.protokoll_id }}" }]
        }
      },
      "id": "pdf-1",
      "name": "PDF Endpoint",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [720, 300]
    }
  ],
  "connections": {
    "Webhook Trigger": { "main": [[{ "node": "Pruefen Endpoint", "type": "main", "index": 0 }]] },
    "Pruefen Endpoint": { "main": [[{ "node": "PDF Endpoint", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" }
}
```

- [ ] **Step 2: Robert importiert + aktiviert**

Plan-Ausführer pausiert hier:
```
Robert: in n8n.butscher.cloud → Workflows → Import from File → supabase/webhooks/n8n-apl2-pruefung.json
Dann: Aktivieren (Toggle oben rechts)
Webhook-URL: https://n8n.butscher.cloud/webhook/apl2-pruefung
```

- [ ] **Step 3: Smoke-Test**

```bash
curl -ks -X POST https://n8n.butscher.cloud/webhook/apl2-pruefung \
  -H "Content-Type: application/json" \
  -d '{"antrag_id": "<echte-id-aus-db>", "geprueft_von": "test"}'
```
Expected: 200 mit `pdf_storage_path` im Response.

- [ ] **Step 4: Commit**

```bash
cd "$REPO" && git add supabase/webhooks/n8n-apl2-pruefung.json && git commit -m "feat(n8n): Orchestrator-Workflow APL2-Prüfung (Webhook → FastAPI → PDF)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 9.2: Auto-Trigger bei Status-Wechsel

**Files:** Create `supabase/migrations/023_notify_n8n_on_pruefung_status.sql`.

- [ ] **Step 1: Trigger-Function + Trigger**

```sql
-- 023_notify_n8n_on_pruefung_status.sql
create or replace function apl2.notify_n8n_on_pruefung_status() returns trigger language plpgsql as $$
declare
  webhook_url text;
begin
  if old.status is distinct from new.status and new.status = 'in_pruefung' then
    webhook_url := current_setting('app.n8n_pruefung_webhook', true);
    if webhook_url is null or webhook_url = '' then
      raise warning 'app.n8n_pruefung_webhook nicht gesetzt';
      return new;
    end if;
    perform net.http_post(
      url := webhook_url,
      body := jsonb_build_object('antrag_id', new.id::text, 'geprueft_von', 'system-trigger'),
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  end if;
  return new;
exception when others then
  raise warning 'n8n-Pruefung-Webhook fehlgeschlagen: %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_notify_n8n_on_pruefung_status on apl2.antraege;
create trigger trg_notify_n8n_on_pruefung_status
  after update of status on apl2.antraege
  for each row execute function apl2.notify_n8n_on_pruefung_status();
```

- [ ] **Step 2: Anwenden**

```bash
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/023_notify_n8n_on_pruefung_status.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 < /tmp/023_notify_n8n_on_pruefung_status.sql"
```

- [ ] **Step 3: Commit**

```bash
cd "$REPO" && git add supabase/migrations/023_notify_n8n_on_pruefung_status.sql && git commit -m "feat(supabase): Migration 023 — Auto-Trigger bei status='in_pruefung'

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 9.3: Cron-Workflow für Doc-Tree-Rebuild

**Files:** Create `supabase/webhooks/n8n-apl2-doctree-rebuild.json`.

- [ ] **Step 1: Workflow-JSON**

```json
{
  "name": "APL2 — Doc-Tree monatlich neu bauen",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [{ "field": "cronExpression", "expression": "0 3 1 * *" }]
        }
      },
      "id": "cron-1",
      "name": "Monatlich 1. um 03:00",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [200, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://pruefung-service:8000/api/rebuild-doctree"
      },
      "id": "rebuild-1",
      "name": "Rebuild Doctree",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [460, 300]
    }
  ],
  "connections": {
    "Monatlich 1. um 03:00": { "main": [[{ "node": "Rebuild Doctree", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" }
}
```

- [ ] **Step 2: Robert importiert + aktiviert.**

- [ ] **Step 3: Commit**

```bash
cd "$REPO" && git add supabase/webhooks/n8n-apl2-doctree-rebuild.json && git commit -m "feat(n8n): Cron-Workflow Doc-Tree-Rebuild monatlich

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 10 — UE3-GUI-Fork

### Task 10.1: ue3/sachbearbeitung-ki/ als Fork von UE2

- [ ] **Step 1: Kopieren**

```bash
cp -R "$REPO/ue2/sachbearbeiter" "$REPO/ue3/sachbearbeitung-ki"
cd "$REPO/ue3/sachbearbeitung-ki" && rm -rf node_modules dist
```

- [ ] **Step 2: package.json anpassen**

In `ue3/sachbearbeitung-ki/package.json` Field `name` umbenennen:
```json
{
  "name": "amt-ki-sachbearbeitung",
  ...
}
```

- [ ] **Step 3: index.html-Title ändern**

In `ue3/sachbearbeitung-ki/index.html`:
```html
<title>Sachbearbeitung KI — APL 2</title>
```

- [ ] **Step 4: Header-Branding in App.tsx-Inbox-Header**

In `ue3/sachbearbeitung-ki/src/pages/Inbox.tsx` ändere die Header-Zeile:
```tsx
<h1 className="text-xl font-bold">Sachbearbeitung KI — APL 2</h1>
<p className="text-sm text-slate-500">Stadt Würzburg · Beratungsstelle für Senioren · mit KI-Prüfung</p>
```

- [ ] **Step 5: npm install + Build-Smoke**

```bash
cd "$REPO/ue3/sachbearbeitung-ki" && npm install && npm test && npm run build
```
Expected: alle 66 Tests grün, dist/ erzeugt.

- [ ] **Step 6: Commit**

```bash
cd "$REPO" && git add ue3/sachbearbeitung-ki/ && git commit -m "feat(ue3): GUI-Fork von UE2 nach ue3/sachbearbeitung-ki/ (Title + Branding angepasst)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 10.2: usePruefung-Hook + PruefungsCard

**Files:**
- Create: `ue3/sachbearbeitung-ki/src/hooks/usePruefung.ts`
- Create: `ue3/sachbearbeitung-ki/src/components/PruefungsCard.tsx`

- [ ] **Step 1: usePruefung.ts**

```typescript
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const N8N_PRUEFUNG_URL = "https://n8n.butscher.cloud/webhook/apl2-pruefung";

export interface PruefBefund {
  schwere: "verstoss" | "hinweis";
  layer: "A" | "B" | "C";
  feld?: string | null;
  beschreibung: string;
  zitat?: string | null;
  section_path?: string | null;
  paragraph_ref?: string | null;
  konfidenz?: number | null;
}

export interface PruefProtokoll {
  id: string;
  antrag_id: string;
  geprueft_am: string;
  ergebnis_jsonb: {
    befunde: PruefBefund[];
    doctree_version: string | null;
    duration_ms: number | null;
  };
  pdf_storage_path: string | null;
  duration_ms: number | null;
}

export function usePruefung(antragId: string | undefined) {
  const [latest, setLatest] = useState<PruefProtokoll | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!antragId) return;
    const { data, error } = await supabase
      .from("pruefprotokoll")
      .select("*")
      .eq("antrag_id", antragId)
      .order("geprueft_am", { ascending: false })
      .limit(1);
    if (error) setError(error.message);
    else setLatest((data?.[0] as PruefProtokoll) ?? null);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [antragId]);

  async function pruefen(geprueftVon: string) {
    if (!antragId) return;
    setRunning(true);
    setError(null);
    try {
      const r = await fetch(N8N_PRUEFUNG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ antrag_id: antragId, geprueft_von: geprueftVon }),
      });
      if (!r.ok) throw new Error(`n8n-Webhook: ${r.status} ${await r.text()}`);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function downloadPdf(): Promise<string | null> {
    if (!latest?.pdf_storage_path) return null;
    const { data } = await supabase.storage
      .from("pruefprotokolle")
      .createSignedUrl(latest.pdf_storage_path, 3600);
    return data?.signedUrl ?? null;
  }

  return { latest, running, error, pruefen, downloadPdf, reload };
}
```

- [ ] **Step 2: PruefungsCard.tsx**

```tsx
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { usePruefung, type PruefBefund } from "../hooks/usePruefung";
import { useSession } from "../hooks/useSession";

const layerLabel: Record<"A" | "B" | "C", string> = {
  A: "Strukturell",
  B: "Ontologie",
  C: "Richtlinie (RAG)",
};

function BefundRow({ b }: { b: PruefBefund }) {
  const color = b.schwere === "verstoss" ? "text-rose-700" : "text-amber-700";
  const icon = b.schwere === "verstoss" ? "✗" : "⚠";
  return (
    <div className="border-l-2 border-slate-200 pl-3 py-1">
      <p className={`text-sm font-medium ${color}`}>
        {icon} [{layerLabel[b.layer]}] {b.feld && <span className="text-slate-500">{b.feld}:</span>} {b.beschreibung}
      </p>
      {b.zitat && (
        <p className="text-xs text-slate-600 italic mt-1">
          „{b.zitat}"{b.section_path && <span className="text-slate-500"> ({b.section_path})</span>}
        </p>
      )}
      {b.paragraph_ref && <p className="text-xs text-slate-500">Bezug: {b.paragraph_ref}</p>}
      {typeof b.konfidenz === "number" && (
        <p className="text-xs text-slate-400">Konfidenz: {Math.round(b.konfidenz * 100)}%</p>
      )}
    </div>
  );
}

export function PruefungsCard({ antragId }: { antragId: string }) {
  const { session } = useSession();
  const email = session?.user?.email ?? "unbekannt";
  const { latest, running, error, pruefen, downloadPdf } = usePruefung(antragId);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const verstoesse = latest?.ergebnis_jsonb?.befunde?.filter((b) => b.schwere === "verstoss") ?? [];
  const hinweise = latest?.ergebnis_jsonb?.befunde?.filter((b) => b.schwere === "hinweis") ?? [];

  async function openPdf() {
    const url = await downloadPdf();
    if (url) {
      setPdfUrl(url);
      window.open(url, "_blank", "noopener");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🔍 KI-Prüfung</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Button onClick={() => pruefen(email)} disabled={running} className="w-full">
          {running ? "Prüfung läuft …" : "Antrag prüfen"}
        </Button>
        {error && <p className="text-rose-700 text-xs">{error}</p>}

        {latest && (
          <>
            <p className="text-xs text-slate-500">
              Letzte Prüfung: {new Date(latest.geprueft_am).toLocaleString("de-DE")} ·
              {" "}{latest.duration_ms ?? "—"} ms · Doctree v{latest.ergebnis_jsonb?.doctree_version ?? "—"}
            </p>
            <p className="text-sm">
              <span className="text-rose-700 font-semibold">{verstoesse.length}</span> Verstöße ·
              {" "}<span className="text-amber-700 font-semibold">{hinweise.length}</span> Hinweise
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {[...verstoesse, ...hinweise].map((b, i) => <BefundRow key={i} b={b} />)}
              {verstoesse.length === 0 && hinweise.length === 0 && (
                <p className="text-emerald-700 text-sm">✓ Keine Befunde — Antrag konform.</p>
              )}
            </div>
            {latest.pdf_storage_path && (
              <Button variant="outline" onClick={openPdf} className="w-full">
                📄 Protokoll als PDF herunterladen
              </Button>
            )}
            {pdfUrl && <p className="text-xs text-slate-400">URL: {pdfUrl.slice(0, 40)}…</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Tests laufen lassen + Build**

```bash
cd "$REPO/ue3/sachbearbeitung-ki" && npm test && npm run build
```

- [ ] **Step 4: Commit**

```bash
cd "$REPO" && git add ue3/sachbearbeitung-ki/src/hooks/usePruefung.ts ue3/sachbearbeitung-ki/src/components/PruefungsCard.tsx && git commit -m "feat(ue3-gui): usePruefung-Hook + PruefungsCard-Komponente

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 10.3: AntragDetail-Erweiterung

**Files:** Modify `ue3/sachbearbeitung-ki/src/pages/AntragDetail.tsx`.

- [ ] **Step 1: Card einbauen**

In `AntragDetail.tsx` zwischen der „Aktionen"-Card und der „Belegpositionen"-Card einen Block einfügen:

```tsx
import { PruefungsCard } from "../components/PruefungsCard";

// ...innerhalb der rechten Spalte:
<PruefungsCard antragId={antrag.id} />
```

- [ ] **Step 2: Build**

```bash
cd "$REPO/ue3/sachbearbeitung-ki" && npm test && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd "$REPO" && git add ue3/sachbearbeitung-ki/src/pages/AntragDetail.tsx && git commit -m "feat(ue3-gui): PruefungsCard in AntragDetail-Page einbinden

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 10.4: Docker-Compose mit Subdomain amt-ki.butscher.cloud

**Files:** Modify `ue3/sachbearbeitung-ki/docker/docker-compose.yml`.

- [ ] **Step 1: docker-compose anpassen** — alle `amt-frontend` durch `amt-ki-frontend` ersetzen, alle `amt.butscher.cloud` durch `amt-ki.butscher.cloud`. Container-Name + Image-Name + Traefik-Router-Namen anpassen:

```yaml
services:
  amt-ki-frontend:
    container_name: amt-ki-frontend
    build:
      context: ..
      dockerfile: Dockerfile
      args:
        VITE_SUPABASE_URL: ${VITE_SUPABASE_URL:-https://supabase.butscher.cloud}
        VITE_SUPABASE_ANON_KEY: ${VITE_SUPABASE_ANON_KEY}
        VITE_AUTH_REDIRECT: ${VITE_AUTH_REDIRECT:-https://amt-ki.butscher.cloud/auth/callback}
    image: amt-ki-frontend:latest
    restart: unless-stopped
    networks:
      - root_default
    labels:
      - traefik.enable=true
      - traefik.docker.network=root_default
      - traefik.http.routers.amt-ki-http.rule=Host(`amt-ki.butscher.cloud`)
      - traefik.http.routers.amt-ki-http.entrypoints=web
      - traefik.http.routers.amt-ki-http.middlewares=amt-ki-https-redirect
      - traefik.http.middlewares.amt-ki-https-redirect.redirectscheme.scheme=https
      - traefik.http.routers.amt-ki.rule=Host(`amt-ki.butscher.cloud`)
      - traefik.http.routers.amt-ki.entrypoints=websecure
      - traefik.http.routers.amt-ki.tls=true
      - traefik.http.routers.amt-ki.tls.certresolver=mytlschallenge
      - traefik.http.routers.amt-ki.service=amt-ki
      - traefik.http.services.amt-ki.loadbalancer.server.port=8080

networks:
  root_default:
    external: true
```

- [ ] **Step 2: Commit**

```bash
cd "$REPO" && git add ue3/sachbearbeitung-ki/docker/docker-compose.yml && git commit -m "feat(ue3-gui): docker-compose für amt-ki.butscher.cloud (Subdomain + Container-Namen)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 10.5: GoTrue-Redirect-URL ergänzen

- [ ] **Step 1: ADDITIONAL_REDIRECT_URLS erweitern**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "
  grep ADDITIONAL_REDIRECT_URLS /root/supabase/docker/.env
  sed -i 's|ADDITIONAL_REDIRECT_URLS=\\(.*\\)|ADDITIONAL_REDIRECT_URLS=\\1,https://amt-ki.butscher.cloud,https://amt-ki.butscher.cloud/auth/callback|' /root/supabase/docker/.env
  grep ADDITIONAL_REDIRECT_URLS /root/supabase/docker/.env
"
```

- [ ] **Step 2: auth-Container restart**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "cd /root/supabase/docker && docker compose up -d auth"
```

### Task 10.6: VPS-Deployment GUI

- [ ] **Step 1: Repo klonen**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "
  if [ -d /opt/amt-ki-frontend/.git ]; then
    cd /opt/amt-ki-frontend && git pull
  else
    git clone https://github.com/swrobuts/DigitalisierungVerwaltung.git /opt/amt-ki-frontend
  fi
"
```

- [ ] **Step 2: .env befüllen + build + up**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "
  cd /opt/amt-ki-frontend/ue3/sachbearbeitung-ki/docker
  cp -n .env.example .env
  ANON=\$(grep ^ANON_KEY /root/supabase/docker/.env | cut -d= -f2)
  sed -i \"s|VITE_SUPABASE_ANON_KEY=.*|VITE_SUPABASE_ANON_KEY=\${ANON}|\" .env
  docker compose --env-file .env build amt-ki-frontend 2>&1 | tail -5
  docker compose --env-file .env up -d amt-ki-frontend 2>&1 | tail -3
"
sleep 20
curl -ksI https://amt-ki.butscher.cloud/ | head -3
```
Expected: HTTP/2 200.

---

## Phase 11 — E2E + Wrap-up

### Task 11.1: End-to-End-Smoke mit Robert

- [ ] **Step 1: Robert testet vollständigen Pfad**:
  1. Login auf `https://amt-ki.butscher.cloud` (Magic-Link, Allowlist ist gleich UE2)
  2. Antrag in Inbox auswählen → AntragDetail öffnen
  3. „Antrag prüfen"-Button klicken
  4. Prüfung läuft (~5-15s), PruefungsCard zeigt Befunde live
  5. „📄 Protokoll als PDF herunterladen" klicken → PDF öffnet sich

- [ ] **Step 2: Auto-Trigger testen**:
  1. In UE3 (oder UE2) Status auf „in_pruefung" setzen
  2. ~30s warten → neuer pruefprotokoll-Eintrag erscheint, Card aktualisiert sich auf reload

### Task 11.2: Roadmap-Spec-Update

- [ ] **Step 1: UE3-Zeile in `docs/superpowers/specs/2026-05-17-roadmap-5-ue-digitalisierung-verwaltung.md` updaten**:

```markdown
| **3** | KI-gestützte Prüfung (Ontologie + RAG) | 3-Layer-Prüfung (strukturell, JSON-Logic gegen Ontologie, PageIndex-Stil-RAG mit Claude Tool-Use) als Python FastAPI auf pruefung.butscher.cloud. n8n als Orchestrator, GUI-Fork auf amt-ki.butscher.cloud. PDF-Prüfprotokoll archivierbar. | Python 3.12 + FastAPI + anthropic SDK + weasyprint + n8n + React-Fork von UE2 | Hands-on: Ontologie-Regel ergänzen, naives RAG vs. PageIndex vergleichen |
```

Plus am Ende von §3:
```markdown
**Spec-Update 2026-05-22**: UE3 implementiert. Detail-Spec: `docs/superpowers/specs/2026-05-22-ue3-ki-pruefung-design.md`. Live auf amt-ki.butscher.cloud + pruefung.butscher.cloud.
```

- [ ] **Step 2: Commit**

```bash
cd "$REPO" && git add docs/superpowers/specs/2026-05-17-roadmap-5-ue-digitalisierung-verwaltung.md && git commit -m "docs(roadmap): UE3 KI-Prüfung live, Stack final

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 11.3: Final-Push + Memory-Update

- [ ] **Step 1: Push**

```bash
cd "$REPO" && git push origin main
```

- [ ] **Step 2: Memory-Update** in `~/.claude/projects/.../memory/projekt_digitalisierung_verwaltung.md` ans Ende ergänzen:

```markdown
**UE3 KI-Prüfung (2026-05-22):** Live auf `amt-ki.butscher.cloud` (GUI-Fork von UE2 in `ue3/sachbearbeitung-ki/`) + `pruefung.butscher.cloud` (Python FastAPI in `pruefung/`).

3-Layer-Prüfung:
- A: Pydantic-Validators (IBAN mod-97, PLZ, E-Mail, Haushaltsjahr)
- B: JSON-Logic gegen apl2.ontologie_rules (5 Seed-Regeln APL2)
- C: PageIndex-Stil-RAG mit Claude Tool-Use über apl2.ahp_doctree

Stack: Python 3.12 + FastAPI + anthropic SDK + pypdfium2 + weasyprint + json-logic-py. n8n als Orchestrator (Workflow „APL2-Prüfung"), Webhook https://n8n.butscher.cloud/webhook/apl2-pruefung. Cron-Workflow monatlich für Doc-Tree-Rebuild.

Migrations 019–023: ahp_plaene, ahp_doctree, ontologie_rules+5 Seeds, pruefprotokoll+Storage-Bucket, GUC n8n_pruefung_webhook, pg_net-Trigger bei Status='in_pruefung'.

VPS-Pfade: `/opt/pruefung/` (FastAPI-Service + AHP-PDF unter /opt/pruefung/materialien/), `/opt/amt-ki-frontend/` (GUI-Fork).

GoTrue ADDITIONAL_REDIRECT_URLS um amt-ki.butscher.cloud erweitert.

Anthropic-API-Key in `/opt/pruefung/repo/pruefung/docker/.env` (NICHT im Repo).

Continuity: UE2 (amt.butscher.cloud) bleibt unverändert — Studis vergleichen UE2 vs. UE3 nebeneinander.

Hands-on: Studis erweitern apl2.ontologie_rules via SQL-INSERT, beobachten Live-Effekt in der PruefungsCard.
```

---

## Self-Review

**Spec-Coverage:**
- ✅ Spec § 3 Architektur (n8n + FastAPI + Doctree) → Tasks 7.1, 8.x, 9.x
- ✅ Spec § 4.1 Layer A (Strukturell) → Task 3.1
- ✅ Spec § 4.2 Layer B (Ontologie/JSON-Logic) → Task 4.1
- ✅ Spec § 4.3 Layer C (PageIndex-RAG + Claude Tool-Use) → Tasks 5.1, 5.2, 6.1
- ✅ Spec § 5 Migrationen 019–021 + Doctree-Schema → Tasks 1.1–1.4
- ✅ Spec § 6 UE3-GUI (Fork von UE2, PruefungsCard) → Tasks 10.1–10.6
- ✅ Spec § 7 n8n-Workflows (Orchestrator + Auto-Trigger + Cron) → Tasks 9.1–9.3
- ✅ Spec § 8 Tech-Stack (Python 3.12, weasyprint, etc.) → Task 2.1
- ✅ Spec § 9 Deployment (DNS, Docker, Traefik) → Tasks 0.2, 8.3, 10.6
- ✅ Spec § 10 Hands-on-Aufgabe → in Memory-Update Task 11.3

**Placeholder-Scan:** kein TBD, kein „later". Eine Stelle mit „Robert importiert" (Task 9.1 Step 2, 9.3 Step 2) — das ist eine bewusste Mensch-Operation, kein Plan-Defekt.

**Type-Konsistenz:**
- `Befund` (Pydantic) hat Felder `schwere`, `layer`, `feld`, `beschreibung`, `zitat`, `section_path`, `paragraph_ref`, `konfidenz` — konsistent durch Layer A/B/C + Frontend `PruefBefund`-Interface
- `PruefungsErgebnis.befunde[]` Format matched Frontend-Erwartung `ergebnis_jsonb.befunde`
- API-Routen: `/api/pruefen`, `/api/pdf`, `/api/rebuild-doctree`, `/api/health` — konsistent

---

## Execution Handoff

Plan complete und gespeichert unter `docs/superpowers/plans/2026-05-22-ue3-ki-pruefung.md`.

**Zwei Ausführungs-Optionen:**

**1. Subagent-Driven (empfohlen)** — Frischer Subagent pro Task (Implementer → Spec-Reviewer → Code-Quality-Reviewer). Bei VPS-Tasks (Phase 0/1/8.3/10.5/10.6) hole ich dein OK ein, bevor destructive Schritte laufen. Schnelle Iteration.

**2. Inline Execution** — Tasks sequenziell in dieser Session mit Checkpoints nach jeder Phase.

Welcher Modus?
