# Echte Ontologie-Prüfung — KI-Subsumtion gegen `apl.ahp_norm_statements`

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** „Konformität per KI prüfen" prüft den Antrag tatsächlich gegen die kuratierten AHP-Norm-Aussagen aus `apl.ahp_norm_statements` (Migration 072: 24 Einträge). Bisher liefert Layer B nur einen leeren Plugin-Stub. Nach diesem Refactor liefert Layer B pro Norm-Aussage einen strukturierten LLM-Subsumtions-Befund („passt / passt-nicht / unklar") mit wortgetreuem Zitat aus `woertliches_zitat` (Halluzinations-Schutz).

**Architecture:** Neue Datei `pruefung/src/pruefung/norm_subsumtion.py` mit `subsumiere_gegen_normstatements(antrag, plugin, db, llm_client) -> list[Befund]`. Die Funktion:
1. Lädt aus `apl.ahp_norm_statements` alle `aktiv=true`-Aussagen, die zum FB passen (`foerderbereich = fb OR foerderbereich IS NULL`).
2. Baut Subsumtions-Prompt via vorhandenem `plugin.baue_subsumtions_prompt()`-Helfer — derselbe, den der Bescheid-Pfad schon nutzt.
3. LLM-Call mit Tool-Use (strukturierter JSON-Output), Modell wie im Bescheid-Pfad.
4. Halluzinations-Validator: jedes vom LLM gelieferte `ref` muss in der gefilterten Norm-Statements-Liste vorkommen; sonst Befund verwerfen + Warnung loggen.
5. Mappt LLM-Beurteilung auf Befund-Schema:
   - `passt_nicht` → `Befund(schwere="verstoss", layer="B", paragraph_ref=ref, zitat=woertliches_zitat, beschreibung=ki_begruendung, konfidenz=ki_konfidenz)`
   - `unklar` → `Befund(schwere="hinweis", layer="B", …)`
   - `passt` → kein Befund

`layer_b_ontologie.check_ontologie` ruft diesen Helper auf (statt nur `plugin.check_konformitaet`); die Plugin-Methode bleibt für FB-spezifische Hard-Regeln (z.B. FB III Treffen-Schwelle), aber zusätzlich.

**Tech Stack:** Python 3.12, Anthropic SDK (Claude), `pydantic` für Subsumtions-Schema, vorhandener `llm_client.UsageTracker` für Token/Kosten-Tracking.

**Halluzinations-Schutz (Robert-Regel, verbatim):** „Es darf NIE etwas erfunden oder hinzugefügt werden, was weder in der Rechtsgrundlage noch in den PDFs enthalten ist." → Das `ref` jedes Befunds **muss** in der vorab geladenen Norm-Statements-Liste existieren. `zitat` wird vom Code aus `woertliches_zitat` der DB-Zeile übernommen — NICHT vom LLM frei generiert. Beschreibung darf das LLM formulieren (Subsumtion ist legitim, Zitat-Erfindung nicht).

---

## Datenmodell-Bezug

```
apl.ahp_norm_statements:
  ref                text         -- z.B. "AHP 2.1.4"
  foerderbereich     enum NULL    -- I/II/III/IV oder NULL = übergreifend
  statement_typ      enum         -- pflicht/zweck/hoechstgrenze/auszahlung/...
  kurz_aussage       text         -- normalisierte Aussage
  ausfuehrlich       text NULL    -- zusätzlicher Kontext
  woertliches_zitat  text         -- wortgetreuer Originaltext aus PDF
  aktiv              boolean      -- nur aktiv=true einbeziehen
```

---

## Task 1: `norm_subsumtion.py` neu anlegen

**Files:**
- Create: `pruefung/src/pruefung/norm_subsumtion.py`
- Create: `pruefung/tests/test_norm_subsumtion.py`

- [ ] **Step 1: Test schreiben (LLM gemockt, Validator-Pfad)**

```python
# pruefung/tests/test_norm_subsumtion.py
import pytest
from pruefung.norm_subsumtion import subsumiere_gegen_normstatements
from pruefung.models import Befund

class FakeDb:
    async def select(self, table, query):
        if table == "ahp_norm_statements":
            return [
                {"ref": "AHP 2.1", "foerderbereich": "I", "statement_typ": "zweck",
                 "kurz_aussage": "FB I dient dem Aufbau niedrigschwelliger Angebote.",
                 "woertliches_zitat": "Zuwendungen werden gewährt für den Aufbau neuer Angebote.",
                 "aktiv": True},
                {"ref": "AHP 2.2", "foerderbereich": "I", "statement_typ": "pflicht",
                 "kurz_aussage": "Projekt muss Senioren-Bezug nachweisen.",
                 "woertliches_zitat": "Das Vorhaben muss einen erkennbaren Bezug zur Seniorenarbeit haben.",
                 "aktiv": True},
            ]
        return []

class FakePlugin:
    fb_id = "I"
    label = "FB I"
    def baue_subsumtions_prompt(self, antrag, norm_statements):
        return f"PROMPT for {len(norm_statements)} statements"

class FakeLlm:
    """Antwortet mit 1 'passt_nicht' (zu ref AHP 2.2) + 1 'passt' + 1 erfundenen ref."""
    async def subsumiere_normstatements(self, prompt):
        return [
            {"ref": "AHP 2.1", "beurteilung": "passt",
             "begruendung": "Projekt zielt auf neues Angebot."},
            {"ref": "AHP 2.2", "beurteilung": "passt_nicht",
             "begruendung": "Antrag erwähnt nirgends Senioren als Zielgruppe.",
             "konfidenz": 0.85},
            {"ref": "AHP 99.99", "beurteilung": "passt_nicht",  # ERFUNDEN
             "begruendung": "soll vom Validator verworfen werden."},
        ]

@pytest.mark.asyncio
async def test_passt_nicht_wird_zu_verstoss_befund():
    befunde = await subsumiere_gegen_normstatements(
        antrag={"foerderbereich": "I", "einrichtung": "Café"},
        plugin=FakePlugin(),
        db=FakeDb(),
        llm=FakeLlm(),
    )
    refs = [b.paragraph_ref for b in befunde]
    assert "AHP 2.2" in refs
    assert "AHP 99.99" not in refs  # Halluzinations-Schutz
    b = next(b for b in befunde if b.paragraph_ref == "AHP 2.2")
    assert b.schwere == "verstoss"
    assert b.layer == "B"
    assert "Bezug zur Seniorenarbeit" in b.zitat  # aus DB, NICHT vom LLM frei
    assert b.konfidenz == 0.85

@pytest.mark.asyncio
async def test_passt_erzeugt_keinen_befund():
    befunde = await subsumiere_gegen_normstatements(
        antrag={"foerderbereich": "I"},
        plugin=FakePlugin(), db=FakeDb(), llm=FakeLlm(),
    )
    assert all(b.paragraph_ref != "AHP 2.1" for b in befunde)

@pytest.mark.asyncio
async def test_keine_norm_statements_keine_befunde():
    class EmptyDb:
        async def select(self, *a, **k): return []
    befunde = await subsumiere_gegen_normstatements(
        antrag={"foerderbereich": "I"},
        plugin=FakePlugin(), db=EmptyDb(), llm=FakeLlm(),
    )
    assert befunde == []
```

- [ ] **Step 2: Test fehlschlagen lassen**

`cd pruefung && uv run pytest tests/test_norm_subsumtion.py -v` → FAIL (module nicht da)

- [ ] **Step 3: `norm_subsumtion.py` implementieren**

```python
# pruefung/src/pruefung/norm_subsumtion.py
"""Layer B Plus: KI-Subsumtion eines Antrags gegen die kuratierten AHP-Norm-
Aussagen aus apl.ahp_norm_statements.

Halluzinations-Schutz (Robert-Regel): Das LLM beurteilt nur die ihm
übergebenen Norm-Aussagen. Erfundene 'ref'-Werte (die nicht in der
gefilterten Liste vorkommen) werden vom Code verworfen — sie tauchen
NICHT als Befund auf. Das woertliches_zitat im Befund wird aus der
DB-Zeile übernommen, NICHT vom LLM frei generiert.
"""
from typing import Any, Protocol
from pruefung.models import Befund


class _LlmProtocol(Protocol):
    async def subsumiere_normstatements(self, prompt: str) -> list[dict[str, Any]]: ...


async def subsumiere_gegen_normstatements(
    antrag: dict[str, Any],
    plugin: Any,
    db: Any,
    llm: _LlmProtocol,
) -> list[Befund]:
    fb = antrag.get("foerderbereich")
    if not fb:
        return []

    # 1) Norm-Statements für diesen FB laden (FB-spezifisch + übergreifend)
    rows = await db.select(
        "ahp_norm_statements",
        f"select=ref,foerderbereich,statement_typ,kurz_aussage,ausfuehrlich,woertliches_zitat,aktiv"
        f"&aktiv=eq.true"
        f"&or=(foerderbereich.eq.{fb},foerderbereich.is.null)",
    )
    if not rows:
        return []

    # 2) Subsumtions-Prompt vom FB-Plugin bauen
    prompt = plugin.baue_subsumtions_prompt(antrag, rows)

    # 3) LLM-Call (strukturiertes JSON)
    llm_befunde = await llm.subsumiere_normstatements(prompt)

    # 4) Halluzinations-Validator + Mapping
    erlaubte_refs = {r["ref"]: r for r in rows}
    befunde: list[Befund] = []
    for entry in llm_befunde:
        ref = entry.get("ref")
        beurteilung = entry.get("beurteilung")
        if ref not in erlaubte_refs:
            # erfundener ref → verwerfen
            continue
        if beurteilung == "passt":
            continue
        norm_row = erlaubte_refs[ref]
        schwere = "verstoss" if beurteilung == "passt_nicht" else "hinweis"
        befunde.append(Befund(
            schwere=schwere,
            layer="B",
            feld=None,
            beschreibung=entry.get("begruendung", "—"),
            zitat=norm_row["woertliches_zitat"],
            section_path=norm_row.get("statement_typ"),
            paragraph_ref=ref,
            konfidenz=entry.get("konfidenz"),
        ))
    return befunde
```

- [ ] **Step 4: Test passen**

`cd pruefung && uv run pytest tests/test_norm_subsumtion.py -v` → PASS (3 Tests)

- [ ] **Step 5: Commit**

```bash
git add pruefung/src/pruefung/norm_subsumtion.py pruefung/tests/test_norm_subsumtion.py
git commit -m "feat(pruefung): norm_subsumtion — Layer-B KI-Subsumtion gegen ahp_norm_statements"
```

---

## Task 2: `llm_client.subsumiere_normstatements` ergänzen

**Files:**
- Modify: `pruefung/src/pruefung/llm_client.py` (oder dort wo der LLM-Wrapper sitzt)

Die Methode ist ein dünner Anthropic-Tool-Use-Wrapper, der strukturiertes JSON erzwingt.

- [ ] **Step 1: Schema definieren + Method implementieren**

```python
# pruefung/src/pruefung/llm_client.py — ergänze Method

import json
from anthropic import AsyncAnthropic

_SUBSUMTION_TOOL = {
    "name": "liefere_subsumtion",
    "description": "Beurteilt pro Norm-Aussage, ob der Antrag dazu passt.",
    "input_schema": {
        "type": "object",
        "properties": {
            "befunde": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "ref": {"type": "string", "description": "z.B. 'AHP 2.1'"},
                        "beurteilung": {"type": "string", "enum": ["passt", "passt_nicht", "unklar"]},
                        "begruendung": {"type": "string", "description": "max 2 Sätze, Bezug zum Antrag"},
                        "konfidenz": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                    },
                    "required": ["ref", "beurteilung", "begruendung"],
                },
            },
        },
        "required": ["befunde"],
    },
}

class LlmClient:
    # ... bestehende Methoden ...
    async def subsumiere_normstatements(self, prompt: str) -> list[dict]:
        client = AsyncAnthropic()  # picks up ANTHROPIC_API_KEY
        resp = await client.messages.create(
            model="claude-3-5-sonnet-latest",   # oder was im Bescheid-Pfad genutzt wird
            max_tokens=4096,
            tools=[_SUBSUMTION_TOOL],
            tool_choice={"type": "tool", "name": "liefere_subsumtion"},
            messages=[{"role": "user", "content": prompt}],
        )
        for block in resp.content:
            if block.type == "tool_use" and block.name == "liefere_subsumtion":
                return block.input.get("befunde", [])
        return []
```

- [ ] **Step 2: Smoketest (mit echtem API-Key — kann lokal manuell laufen, im CI skippen)**

- [ ] **Step 3: Commit**

```bash
git add pruefung/src/pruefung/llm_client.py
git commit -m "feat(pruefung): LlmClient.subsumiere_normstatements (Anthropic Tool-Use, strukturiertes JSON)"
```

---

## Task 3: Layer B verdrahten — `subsumiere_gegen_normstatements` aufrufen

**Files:**
- Modify: `pruefung/src/pruefung/layer_b_ontologie.py`
- Modify: `pruefung/src/pruefung/main.py:127` (Aufruf check_ontologie)

- [ ] **Step 1: Layer B um Subsumtion erweitern**

```python
# pruefung/src/pruefung/layer_b_ontologie.py
"""Layer B — FB-spezifische Konformitätsregeln + KI-Subsumtion gegen AHP-Norm-Aussagen."""
from typing import Any
from pruefung.foerderbereiche import plugin_for
from pruefung.models import Befund
from pruefung.norm_subsumtion import subsumiere_gegen_normstatements

async def check_ontologie(
    antrag: dict[str, Any], *, plan_id: str = "APL2", db: Any = None, llm: Any = None,
) -> list[Befund]:
    fb = antrag.get("foerderbereich")
    plugin = plugin_for(fb) if fb else None
    if not plugin:
        return []
    befunde: list[Befund] = []

    # 1) FB-spezifische Hard-Regeln (FB III Treffen-Schwelle etc.)
    if hasattr(plugin, "check_konformitaet"):
        result = plugin.check_konformitaet(antrag, db=db)
        if hasattr(result, "__await__"):
            result = await result
        befunde.extend(result or [])

    # 2) KI-Subsumtion gegen ahp_norm_statements
    if db is not None and llm is not None:
        ki_befunde = await subsumiere_gegen_normstatements(antrag, plugin, db, llm)
        befunde.extend(ki_befunde)

    return befunde
```

- [ ] **Step 2: `main.py` LLM-Client an check_ontologie weitergeben**

In `main.py` ~Zeile 117-127:
```python
from pruefung.llm_client import LlmClient

@app.post("/api/pruefen")
async def pruefen(req: PruefungsRequest) -> dict[str, Any]:
    start = time.monotonic()
    db = SupabaseClient.from_env()
    llm = LlmClient()
    antrag = await _fetch_antrag(req.antrag_id, db)
    # ...
    befunde: list[Befund] = []
    befunde.extend(check_strukturell(antrag))
    befunde.extend(await check_ontologie(antrag, plan_id="APL2", db=db, llm=llm))
    # ...
```

- [ ] **Step 3: Tests anpassen (Mock-LLM in test_layer_b_ontologie)**

- [ ] **Step 4: Commit**

```bash
git add pruefung/src/pruefung/layer_b_ontologie.py pruefung/src/pruefung/main.py pruefung/tests/test_layer_b_ontologie.py
git commit -m "feat(pruefung): Layer B führt jetzt echte KI-Subsumtion gegen ahp_norm_statements aus"
```

---

## Task 4: End-to-End Smoketest

**Files:**
- Verify only

- [ ] **Step 1: Lokal alle Tests grün**

`cd pruefung && uv run pytest tests/ -q`

- [ ] **Step 2: Robert pusht + VPS-Rebuild (Python-Image, ~30 Min)**

```bash
# Lokal
git push origin main
# VPS
cd /opt/pruefung/repo && git pull
cd /opt/pruefung/repo/pruefung/docker
docker compose build --no-cache pruefung-service
docker compose up -d --force-recreate pruefung-service
```

- [ ] **Step 3: Live-Test pro FB**

```bash
for id in ebc2f7d3-924e-4569-93a2-a2cce3e0c778 ec06891d-52a7-4dd3-8a85-cc3e07b14a93 090f0a95-cc20-4b62-b2aa-dee9189627be 778fc224-0868-4242-a289-c0e1c0abf38d; do
  echo "--- $id ---"
  curl -sS -X POST -H "Content-Type: application/json" \
    -d "{\"antrag_id\":\"$id\"}" \
    https://pruefung.butscher.cloud/api/pruefen | jq '.anzahl_verstoesse, .anzahl_hinweise, [.befunde[].layer] | unique, [.befunde[].paragraph_ref]'
done
```

Erwartung: Layer "B" taucht in den Listen auf; mindestens für FB I 1-2 Befunde mit `paragraph_ref: "AHP …"`.

- [ ] **Step 4: DB-Audit**

```sql
SELECT ant.foerderbereich,
       jsonb_array_length(p.ergebnis_jsonb->'befunde') as count,
       jsonb_agg(DISTINCT befund->>'layer') as layers,
       jsonb_agg(DISTINCT befund->>'paragraph_ref') as refs
FROM apl.pruefprotokoll p
JOIN apl.antraege ant ON ant.id = p.antrag_id
JOIN LATERAL jsonb_array_elements(p.ergebnis_jsonb->'befunde') befund ON true
WHERE p.geprueft_am > now() - interval '5 minutes'
GROUP BY ant.foerderbereich, p.id;
```

Erwartung: `layers` enthält `B`, `refs` enthält Werte aus `apl.ahp_norm_statements.ref`.

---

## Selbstreview-Punkte

1. **Halluzinations-Schutz wirklich aktiv?** Test in Task 1 prüft das (erfundenes „AHP 99.99" wird verworfen). Im Produktivlauf: jeder Befund mit `paragraph_ref` muss in der DB stehen — sonst wäre der Validator durchlöchert.
2. **`woertliches_zitat` aus DB, nicht vom LLM:** Im Code (Task 1 Step 3) wird `norm_row["woertliches_zitat"]` direkt übernommen — das LLM kann das Zitat nicht überschreiben.
3. **Layer-B-Befunde im UI sichtbar:** Frontend rendert pro Befund `layer`/`paragraph_ref`/`zitat`/`beschreibung` — kein Frontend-Update nötig, das war schon im Vertrag.
4. **Performance:** Subsumtion über 6-10 Norm-Aussagen pro FB dauert mit Claude ~3-5s. `duration_ms` wird steigen von ~3s auf ~6-8s. Akzeptabel.
5. **Token-Tracking:** `LlmClient` sollte `UsageTracker` aus `pruefung.llm_client` nutzen, falls vorhanden, damit Kosten im `ergebnis_jsonb.llm_usage` landen.
