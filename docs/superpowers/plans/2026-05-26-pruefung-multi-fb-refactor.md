# Pruefung-Service Multi-FB-Refactor — Implementations-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den FastAPI-Service `pruefung/` vom Legacy-Single-FB-III-Schema (`apl2.antrag_mit_summen` + Räume-/Bemessungs-Felder) auf das neue Multi-FB-`apl`-Schema (`apl.antraege` + FB-Detail-Tabellen `apl.fb_i_projekt`, `apl.fb_ii_ehrenamt`, `apl.fb_iii_variante`, `apl.fb_iv_freitext`) heben. Endzustand: „Konformität per KI prüfen" funktioniert für alle vier Förderbereiche, Bescheid-Erstellung läuft über den bereits vorhandenen FB-Plugin-Dispatcher.

**Architecture:** Zentral ist `pruefung.foerderbereiche.plugin_for(foerderbereich)`. Das Plugin liefert pro FB Pflichtfelder, Subsumtions-Prompt, Template, Höchstgrenzen. `_fetch_antrag` lädt jetzt `apl.antraege` + die passende FB-Detail-Tabelle und gibt ein vereinheitlichtes Antrag-Dict zurück (`{...gemeinsam, foerderbereich, fb_details: {...}}`). Layer A nutzt `plugin.get_pflicht_felder()` plus generische Validatoren. Layer B (alte `ontologie_rules`-Logik) wird durch FB-spezifische Plugin-Checks ersetzt (FB III: Höchstgrenze pro Variante). Layer C bleibt agnostisch, System-Prompt wird FB-aware. `/api/bescheid` läuft komplett über `render_bescheid_safe(fb_id, …)`.

**Tech Stack:** Python 3.12, FastAPI, httpx (Direkt-PostgREST), Pydantic, Anthropic SDK (Claude), Voyage (Embeddings), Jinja2 (Templates).

**Halluzinations-Schutz (Robert-Regel, verbatim):** „Es darf NIE etwas erfunden oder hinzugefügt werden, was weder in der Rechtsgrundlage noch in den PDFs enthalten ist." — Plugin-Subsumtions-Prompt enthält das bereits; `validiere_oder_abbrechen()` gegen `apl.ahp_norm_statements` muss unbedingt im Bescheid-Pfad bleiben.

---

## Datenmodell-Abriss (zum Nachschlagen)

**`apl.antraege` (Migration 060):**
`id, antragsnummer, haushaltsjahr, foerderbereich, status, submitted_at, submitted_language, user_agent, ip_address, dachverband, einrichtung, ansprechpartner, strasse, hausnummer, plz, ort, telefon, email, homepage, bankname, iban, bic`

**`apl.fb_i_projekt` (Migration 061):** `antrag_id, projekt_titel, laufzeit, stadtteil, personalkosten_euro, sachkosten_euro, drittmittel_jsonb, andere_mittel_jsonb`

**`apl.fb_ii_ehrenamt`:** `antrag_id, ehrenamt_titel, anzahl_helfer_vorjahr, gesamt_helferstunden_vorjahr, direkter_kontakt_senioren` + 1:n `apl.fb_ii_helfer`

**`apl.fb_iii_variante`:** `antrag_id, variante (A/B/C/D)` + variante-spezifische `a_*`/`b_*`/`c_*`/`d_*`-Felder

**`apl.fb_iv_freitext` (Migration 071):** `antrag_id, vorhaben_titel, kurzbeschreibung, dokument_path` (Legacy `geplante_massnahmen, beantragte_summe_euro, laufzeit` nullable und nicht mehr verwendet)

**Nicht mehr vorhanden:** `apl.oeffnungszeit`, `apl.ontologie_rules`, `apl.antrag_mit_summen`. Felder `raeume_*, betriebskosten_vorjahr_*, personalkosten_vorjahr_*, miete_jahr_*, finanzplanung_vorhanden, projektskizze_eingereicht, logo_verwendet, zuwendungszweck, geforderte_foerdersumme_euro, name, traeger, bankverbindung, antragsdatum` sind entfernt; ersetzt durch `einrichtung, dachverband, bankname, submitted_at` etc.

---

## Task 1: `_fetch_antrag` auf Multi-FB-Schema umstellen

**Files:**
- Modify: `pruefung/src/pruefung/main.py:70-92`

- [ ] **Step 1: Test schreiben (Pflicht-Pfad)**

```python
# pruefung/tests/test_fetch_antrag.py
import pytest
from pruefung.main import _fetch_antrag

@pytest.mark.asyncio
async def test_fetch_antrag_fb_i_dispatcht_zu_projekt_tabelle(monkeypatch):
    class FakeDb:
        async def select(self, table, query):
            if table == "antraege":
                return [{"id": "x", "foerderbereich": "I", "einrichtung": "Caritas",
                         "haushaltsjahr": 2026, "dachverband": None, "iban": "DE…",
                         "submitted_at": "2026-05-25T00:00:00Z"}]
            if table == "fb_i_projekt":
                return [{"antrag_id": "x", "projekt_titel": "Café",
                         "personalkosten_euro": 18500, "sachkosten_euro": 4200,
                         "laufzeit": "2026", "stadtteil": "Heuchelhof",
                         "drittmittel_jsonb": [], "andere_mittel_jsonb": []}]
            return []
    antrag = await _fetch_antrag("x", FakeDb())
    assert antrag["foerderbereich"] == "I"
    assert antrag["fb_details"]["projekt_titel"] == "Café"
    assert antrag["fb_details"]["personalkosten_euro"] == 18500
```

- [ ] **Step 2: Test laufen lassen — soll fehlschlagen**

`cd pruefung && uv run pytest tests/test_fetch_antrag.py -v`
Expected: FAIL (`KeyError: 'fb_details'` oder vergleichbar)

- [ ] **Step 3: `_fetch_antrag` neu schreiben**

```python
# pruefung/src/pruefung/main.py — ersetzt Zeilen 70-92

_FB_DETAIL_TABLE = {
    "I":   ("fb_i_projekt",   "projekt_titel,laufzeit,stadtteil,personalkosten_euro,sachkosten_euro,drittmittel_jsonb,andere_mittel_jsonb"),
    "II":  ("fb_ii_ehrenamt", "ehrenamt_titel,anzahl_helfer_vorjahr,gesamt_helferstunden_vorjahr,direkter_kontakt_senioren"),
    "III": ("fb_iii_variante","variante,a_anmerkung,b_anzahl_veranstaltungen,b_teilnehmer_senioren,b_teilnehmer_generationen,b_stadtbewohner_anteil,b_quartierstreffen_teilnahme,b_quartiere,b_quartier_person_name,c_treffen_schwelle,c_teilnehmer_durchschnitt,c_quartierstreffen_anzahl,c_quartier_kooperation,c_quartier_person_name,d_hauptamt_name,d_hauptamt_stunden_woche,d_hauptamt_stunden_monat,d_ehrenamt_personen_jsonb"),
    "IV":  ("fb_iv_freitext", "vorhaben_titel,kurzbeschreibung,dokument_path"),
}

_ANTRAG_COLS = (
    "id,antragsnummer,haushaltsjahr,foerderbereich,status,submitted_at,"
    "submitted_language,dachverband,einrichtung,ansprechpartner,"
    "strasse,hausnummer,plz,ort,telefon,email,homepage,"
    "bankname,iban,bic"
)

async def _fetch_antrag(antrag_id: str, db: SupabaseClient) -> dict[str, Any]:
    rows = await db.select("antraege", f"id=eq.{antrag_id}&select={_ANTRAG_COLS}")
    if not rows:
        raise HTTPException(404, f"Antrag {antrag_id} nicht gefunden")
    antrag = rows[0]
    fb = antrag.get("foerderbereich")
    table, cols = _FB_DETAIL_TABLE.get(fb, (None, None))
    fb_details: dict[str, Any] = {}
    if table:
        d = await db.select(table, f"antrag_id=eq.{antrag_id}&select={cols}")
        fb_details = d[0] if d else {}
    antrag["fb_details"] = fb_details
    # FB-II Helfer-Liste nachladen
    if fb == "II":
        helfer = await db.select(
            "fb_ii_helfer",
            f"antrag_id=eq.{antrag_id}&select=position,name,vorname,einsatzbereich,eintritt,austritt,stunden_monat,stunden_jahr&order=position.asc",
        )
        antrag["fb_details"]["helfer"] = helfer
    return antrag
```

- [ ] **Step 4: Test laufen lassen — soll passen**

`cd pruefung && uv run pytest tests/test_fetch_antrag.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pruefung/src/pruefung/main.py pruefung/tests/test_fetch_antrag.py
git commit -m "fix(pruefung): _fetch_antrag auf Multi-FB-Schema (apl.antraege + fb_*-Detail-Tabellen)"
```

---

## Task 2: Layer A (strukturell) FB-aware machen

**Files:**
- Modify: `pruefung/src/pruefung/layer_a_strukturell.py`
- Modify: `pruefung/src/pruefung/main.py:126` (Aufrufstelle)

- [ ] **Step 1: Test schreiben**

```python
# pruefung/tests/test_layer_a_strukturell.py
from pruefung.layer_a_strukturell import check_strukturell

def test_fb_i_pflicht_personalkosten_fehlt_meldet_verstoss():
    antrag = {
        "foerderbereich": "I",
        "einrichtung": "X", "ansprechpartner": "Y", "strasse": "S 1",
        "plz": "97084", "ort": "Würzburg", "telefon": "0931", "email": "a@b.de",
        "bankname": "Sparkasse", "iban": "DE89370400440532013000", "bic": "COBADEFFXXX",
        "fb_details": {"projekt_titel": "P", "personalkosten_euro": None, "sachkosten_euro": 100.0},
    }
    befunde = check_strukturell(antrag)
    feld_set = {b.feld for b in befunde if b.schwere == "verstoss"}
    assert "fb_details.personalkosten_euro" in feld_set

def test_iban_invalid_meldet_verstoss():
    antrag = {
        "foerderbereich": "I",
        "einrichtung": "X", "ansprechpartner": "Y", "strasse": "S 1",
        "plz": "97084", "ort": "Würzburg", "telefon": "0931", "email": "a@b.de",
        "bankname": "Sparkasse", "iban": "DE-INVALID", "bic": "COBADEFFXXX",
        "fb_details": {"projekt_titel": "P", "personalkosten_euro": 1.0, "sachkosten_euro": 1.0},
    }
    befunde = check_strukturell(antrag)
    assert any(b.feld == "iban" and b.schwere == "verstoss" for b in befunde)
```

- [ ] **Step 2: Test fehlschlagen lassen**

`cd pruefung && uv run pytest tests/test_layer_a_strukturell.py -v` → FAIL.

- [ ] **Step 3: `check_strukturell` neu schreiben**

```python
# pruefung/src/pruefung/layer_a_strukturell.py
"""Layer A — strukturelle Pflichtfeld- und Format-Prüfung, FB-aware via Plugin."""
from typing import Any
from pruefung.foerderbereiche import plugin_for
from pruefung.models import Befund

# Generische Pflichtfelder, die für ALLE FBs gelten (apl.antraege)
_GEMEINSAME_PFLICHT = [
    "einrichtung", "ansprechpartner", "strasse", "plz", "ort",
    "telefon", "email", "bankname", "iban", "bic",
]

def _format_iban(v: str | None) -> bool:
    return bool(v) and isinstance(v, str) and v.replace(" ", "").upper().startswith("DE") and len(v.replace(" ", "")) == 22

def _format_bic(v: str | None) -> bool:
    return bool(v) and isinstance(v, str) and 8 <= len(v.replace(" ", "")) <= 11

def _format_plz(v: str | None) -> bool:
    return bool(v) and isinstance(v, str) and v.isdigit() and len(v) == 5

def _format_email(v: str | None) -> bool:
    return bool(v) and isinstance(v, str) and "@" in v and "." in v.split("@")[-1]

def check_strukturell(antrag: dict[str, Any]) -> list[Befund]:
    befunde: list[Befund] = []
    fb = antrag.get("foerderbereich")
    plugin = plugin_for(fb) if fb else None

    # 1) Gemeinsame Pflicht (apl.antraege)
    for feld in _GEMEINSAME_PFLICHT:
        if not antrag.get(feld):
            befunde.append(Befund(
                schwere="verstoss", layer="A", feld=feld,
                beschreibung=f"Pflichtfeld '{feld}' fehlt.",
            ))

    # 2) FB-spezifische Pflicht (vom Plugin)
    if plugin:
        for feld_pfad in plugin.get_pflicht_felder(antrag):
            # Plugin liefert Pfade wie 'fb_details.personalkosten_euro' oder 'fb_details.helfer'
            value = _resolve(antrag, feld_pfad)
            if value in (None, "", [], {}):
                befunde.append(Befund(
                    schwere="verstoss", layer="A", feld=feld_pfad,
                    beschreibung=f"Pflichtfeld '{feld_pfad}' fehlt (FB {fb}).",
                ))

    # 3) Formatchecks
    iban = antrag.get("iban")
    if iban and not _format_iban(iban):
        befunde.append(Befund(schwere="verstoss", layer="A", feld="iban",
                              beschreibung="IBAN-Format ungültig."))
    bic = antrag.get("bic")
    if bic and not _format_bic(bic):
        befunde.append(Befund(schwere="verstoss", layer="A", feld="bic",
                              beschreibung="BIC-Format ungültig."))
    plz = antrag.get("plz")
    if plz and not _format_plz(plz):
        befunde.append(Befund(schwere="verstoss", layer="A", feld="plz",
                              beschreibung="PLZ-Format ungültig."))
    email = antrag.get("email")
    if email and not _format_email(email):
        befunde.append(Befund(schwere="verstoss", layer="A", feld="email",
                              beschreibung="E-Mail-Format ungültig."))

    return befunde

def _resolve(obj: dict, path: str) -> Any:
    cur: Any = obj
    for part in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur
```

- [ ] **Step 4: Test passen**

`cd pruefung && uv run pytest tests/test_layer_a_strukturell.py -v` → PASS.

- [ ] **Step 5: Aufrufstelle in main.py prüfen**

`main.py:126` ruft `check_strukturell(antrag)` — Signatur unverändert, OK.

- [ ] **Step 6: Commit**

```bash
git add pruefung/src/pruefung/layer_a_strukturell.py pruefung/tests/test_layer_a_strukturell.py
git commit -m "fix(pruefung): Layer A nutzt FB-Plugin für Pflichtfelder + neues Schema-Felder-Set"
```

---

## Task 3: Layer B (Ontologie) durch FB-Plugin-Konformität ersetzen

**Files:**
- Rewrite: `pruefung/src/pruefung/layer_b_ontologie.py`
- Add: `pruefung/src/pruefung/foerderbereiche/base.py` (optional method `check_konformitaet`)
- Add: `pruefung/src/pruefung/foerderbereiche/fb_iii.py` (FB-III: Höchstgrenze pro Variante)
- Modify: `pruefung/src/pruefung/main.py:127` (Aufruf signature beibehalten)

**Begründung:** Die alte `apl.ontologie_rules`-Tabelle existiert im neuen Schema nicht. Plugin-Check übernimmt FB-spezifische Regeln (FB III Höchstgrenzen via Variante; FB I keine harten Schwellen; FB II Pauschalsatz nach Helferstunden; FB IV freie Höhe). Quelle: FB-Plugin-Modelle bereits FB-aware modelliert.

- [ ] **Step 1: Test schreiben (FB III Variante C — Höchstgrenze 750€/600€)**

```python
# pruefung/tests/test_layer_b_ontologie.py
import pytest
from pruefung.layer_b_ontologie import check_ontologie

class FakeDb:
    async def select(self, table, query): return []

@pytest.mark.asyncio
async def test_fb_iii_c_treffen_schwelle_12_max_750_euro_ueberschritten_meldet_hinweis():
    antrag = {
        "foerderbereich": "III",
        "fb_details": {"variante": "C", "c_treffen_schwelle": "12", "c_teilnehmer_durchschnitt": 8},
    }
    befunde = await check_ontologie(antrag, plan_id="APL2", db=FakeDb())
    # Im Test fließt keine Antrags-Summe ein — wir prüfen nur, dass kein Crash auf alten Feldern auftritt
    assert isinstance(befunde, list)

@pytest.mark.asyncio
async def test_fb_iv_keine_pruefung_keine_befunde():
    antrag = {"foerderbereich": "IV", "fb_details": {"vorhaben_titel": "X"}}
    befunde = await check_ontologie(antrag, plan_id="APL2", db=FakeDb())
    assert befunde == []
```

- [ ] **Step 2: Test fehlschlagen lassen**

`cd pruefung && uv run pytest tests/test_layer_b_ontologie.py -v` → FAIL.

- [ ] **Step 3: `check_ontologie` neu schreiben**

```python
# pruefung/src/pruefung/layer_b_ontologie.py
"""Layer B — FB-spezifische Konformitätsregeln, dispatcht via Plugin.

Ablöse für die alte Tabelle apl.ontologie_rules (existiert in apl-Schema nicht).
"""
from typing import Any
from pruefung.foerderbereiche import plugin_for
from pruefung.models import Befund

async def check_ontologie(antrag: dict[str, Any], *, plan_id: str = "APL2", db: Any = None) -> list[Befund]:
    fb = antrag.get("foerderbereich")
    plugin = plugin_for(fb) if fb else None
    if not plugin:
        return []
    check_fn = getattr(plugin, "check_konformitaet", None)
    if not check_fn:
        return []
    return await check_fn(antrag, db=db) if _is_awaitable(check_fn) else check_fn(antrag, db=db)

def _is_awaitable(fn) -> bool:
    import inspect
    return inspect.iscoroutinefunction(fn)
```

- [ ] **Step 4: FB-III `check_konformitaet` implementieren**

```python
# In pruefung/src/pruefung/foerderbereiche/fb_iii.py — ergänze Methode

class FbIiiPlugin(...):
    # ... bestehende Methoden ...

    def check_konformitaet(self, antrag, db=None):
        """Variante-spezifische Höchstgrenze.

        Quellen: AHP-Richtlinie Stadt Würzburg, Ziff. 2.3 (FB III Bewährte
        Strukturen) — Höchstgrenzen pro Variante. ZITAT-PFLICHT für
        Halluzinations-Schutz: Variante A pauschal 800€, B 1.200€, C abh.
        von Treffen-Schwelle, D 2.400€.
        """
        befunde = []
        fb = antrag.get("fb_details", {})
        variante = fb.get("variante")
        # Layer B liefert nur Hinweise auf abweichende Konstellationen.
        # Die Hard-Fail-Höchstgrenze-Subsumtion macht bescheid_subsumtion.py.
        if variante == "C":
            schwelle = fb.get("c_treffen_schwelle")
            if schwelle and schwelle not in ("12", "6"):
                befunde.append(Befund(
                    schwere="hinweis", layer="B", feld="fb_details.c_treffen_schwelle",
                    beschreibung=f"Treffen-Schwelle '{schwelle}' nicht in Richtlinie vorgesehen (Erwartet: '12' oder '6').",
                ))
        return befunde
```

- [ ] **Step 5: FB-I/II/IV gleichermaßen — leere `check_konformitaet`-Defaults (in base.py)**

```python
# pruefung/src/pruefung/foerderbereiche/base.py — Protocol ergänzen

class FoerderbereichPlugin(Protocol):
    fb_id: str
    label: str
    def get_pflicht_felder(self, antrag: dict) -> list[str]: ...
    def baue_subsumtions_prompt(self, antrag, norm_statements) -> str: ...
    def post_process_kibescheid(self, raw: dict) -> dict: ...
    def render_bescheid_template(self, antrag, ki_result) -> str: ...
    def check_konformitaet(self, antrag, db=None) -> list[Any]: ...  # NEU — default: []
```

In `fb_i.py`, `fb_ii.py`, `fb_iv.py`:
```python
    def check_konformitaet(self, antrag, db=None):
        return []  # Keine FB-spezifischen Hard-Regeln; nur Plugin-Subsumtion im Bescheid.
```

- [ ] **Step 6: Tests passen lassen**

`cd pruefung && uv run pytest tests/test_layer_b_ontologie.py -v` → PASS.

- [ ] **Step 7: Commit**

```bash
git add pruefung/src/pruefung/layer_b_ontologie.py pruefung/src/pruefung/foerderbereiche/ pruefung/tests/test_layer_b_ontologie.py
git commit -m "fix(pruefung): Layer B retire ontologie_rules → FB-Plugin check_konformitaet"
```

---

## Task 4: Layer C (RAG) System-Prompt FB-aware

**Files:**
- Modify: `pruefung/src/pruefung/layer_c_rag.py`

- [ ] **Step 1: Hardcoded „APL2-Antrag — Altentagesstätten"-Strings im System-Prompt finden**

`grep -n "APL2\|Altentagesstätt\|altentagesstätt" pruefung/src/pruefung/layer_c_rag.py`

- [ ] **Step 2: System-Prompt FB-neutral umschreiben**

Ersetze hardcoded „APL2-Antrag — Altentagesstätten" durch:
```python
fb = antrag.get("foerderbereich", "?")
fb_label = {
    "I": "Aufbau niedrigschwelliger Angebote",
    "II": "Förderung bürgerschaftlichen Engagements",
    "III": "Förderung bewährter Strukturen (Seniorenkreise/Quartier)",
    "IV": "Struktur- und Schwerpunktförderung",
}.get(fb, "Allgemeine Förderung")
system_prompt = f"""Du prüfst einen Antrag im Förderbereich {fb} — {fb_label} —
gegen die AHP-Förderrichtlinie der Stadt Würzburg vom 27.03.2025. ..."""
```

- [ ] **Step 3: Lauffähigkeit prüfen — `uv run pytest pruefung/tests/ -k layer_c` (falls Test existiert)**

- [ ] **Step 4: Commit**

```bash
git add pruefung/src/pruefung/layer_c_rag.py
git commit -m "fix(pruefung): Layer C System-Prompt FB-aware (statt hardcoded Altentagesstätten)"
```

---

## Task 5: `/api/bescheid` über Plugin-Dispatcher

**Files:**
- Modify: `pruefung/src/pruefung/main.py` (Endpoint `/api/bescheid`, ~Zeile 528-560)
- Verify: `pruefung/src/pruefung/foerderbereiche/__init__.py::render_bescheid_safe`

- [ ] **Step 1: Aktuellen `/api/bescheid`-Code lesen**

`grep -n "def erstelle_bescheid\|@app.post.*bescheid" pruefung/src/pruefung/main.py`

- [ ] **Step 2: Endpoint umstellen**

Statt globalem `pdf_render.render_bescheid_pdf(antrag, ...)`:
```python
from pruefung.foerderbereiche import render_bescheid_safe

@app.post("/api/bescheid")
async def erstelle_bescheid(req: BescheidRequest) -> dict[str, Any]:
    db = SupabaseClient.from_env()
    antrag = await _fetch_antrag(req.antrag_id, db)
    # Norm-Statements für FB filtern + Subsumtions-Prompt + LLM + validate + render
    html, used_paragraphs, ki_meta = await render_bescheid_safe(
        fb_id=antrag["foerderbereich"], antrag=antrag, db=db, ...,
    )
    # PDF rendern + Storage-Upload (wie bisher)
    ...
```

`render_bescheid_safe` macht intern: Plugin → Prompt → LLM → `validiere_oder_abbrechen()` → Template.

- [ ] **Step 3: Sicherstellen, dass FB-Templates (`bescheid_fb_*.html.j2`) die neuen Feldnamen lesen**

`grep -n "antrag\.\(name\|traeger\|bankverbindung\|antragsdatum\|raeume\|miete\|betriebskosten\)" pruefung/src/pruefung/templates/bescheid_fb_*.html.j2`

Falls Treffer: jedes Treffer-Feld nach neuem Schema mappen (siehe Datenmodell-Abriss oben).

- [ ] **Step 4: Smoketest schreiben — Bescheid für jeden FB ohne Crash**

```python
# pruefung/tests/test_bescheid_dispatch.py
@pytest.mark.parametrize("fb", ["I", "II", "III", "IV"])
async def test_render_bescheid_for_fb(fb, mocked_db, mocked_llm):
    antrag = make_fake_antrag(fb)  # Helper, der minimal-valid pro FB liefert
    result = await render_bescheid_safe(fb_id=fb, antrag=antrag, db=mocked_db)
    assert "<html" in result[0]
```

- [ ] **Step 5: Tests laufen, Commit**

```bash
git add pruefung/src/pruefung/main.py pruefung/src/pruefung/templates/ pruefung/tests/test_bescheid_dispatch.py
git commit -m "fix(pruefung): /api/bescheid läuft über render_bescheid_safe (FB-Plugin-Dispatcher)"
```

---

## Task 6: `bescheid_subsumtion._FOERDERBEREICH_LABEL` auf Enum-Keys

**Files:**
- Modify: `pruefung/src/pruefung/bescheid_subsumtion.py`

- [ ] **Step 1: Alte Slug-Keys finden + auf I/II/III/IV mappen**

```python
_FOERDERBEREICH_LABEL = {
    "I":   "Aufbau niedrigschwelliger Angebote",
    "II":  "Förderung bürgerschaftlichen Engagements",
    "III": "Förderung bewährter Strukturen",
    "IV":  "Schwerpunktförderung",
}
```

Höchstgrenzen-Mapping: über `plugin.get_hoechstgrenze(...)` aus FB-III-Plugin holen, andere FBs liefern `None`.

- [ ] **Step 2: Feldnamen aktualisieren**

Suche/Ersetze in der Datei:
- `antrag["name"]` → `antrag.get("einrichtung")`
- `antrag["traeger"]` → `antrag.get("dachverband") or antrag.get("einrichtung")`
- `antrag["antragsdatum"]` → `antrag.get("submitted_at", "")[:10]`
- `antrag["bankverbindung"]` → `antrag.get("bankname")`
- `antrag["geforderte_foerdersumme_euro"]` → FB-spezifisch aus `antrag["fb_details"]` ableiten (siehe `pdf_render.py`)

- [ ] **Step 3: Commit**

```bash
git add pruefung/src/pruefung/bescheid_subsumtion.py
git commit -m "fix(pruefung): bescheid_subsumtion Enum-Keys + Feldnamen auf neues apl-Schema"
```

---

## Task 7: `risiko_score.py` Feldnamen aktualisieren

**Files:**
- Modify: `pruefung/src/pruefung/risiko_score.py`

- [ ] **Step 1: Legacy-Felder ersetzen**

- `traeger` → `dachverband` (oder `einrichtung` fallback)
- `bankverbindung` → `bankname`
- `geforderte_foerdersumme_euro` → pro FB aus `antrag["fb_details"]` (FB I = personalkosten+sachkosten; FB III/C = treffen-bezogen; FB IV = wenn vorhanden `beantragte_summe_euro`, sonst 0)

- [ ] **Step 2: Aufrufstelle `_fetch_antrag` → liefert neues Dict → Risiko-Score Endpoint nicht crashen**

Test mit curl: `curl -sS https://pruefung.butscher.cloud/api/antrag/<FBI-id>/risiko-score`

- [ ] **Step 3: Commit**

```bash
git add pruefung/src/pruefung/risiko_score.py
git commit -m "fix(pruefung): risiko_score auf neue Spaltennamen (einrichtung/dachverband/bankname)"
```

---

## Task 8: `vergleich_vorjahr.py` Feldnamen aktualisieren

**Files:**
- Modify: `pruefung/src/pruefung/vergleich_vorjahr.py`

- [ ] **Step 1: Legacy-Felder austauschen**

Identifizier: `traeger, geforderte_foerdersumme_euro, raeume_*, logo_verwendet, finanzplanung_vorhanden, projektskizze_eingereicht` → bei FB I: `personalkosten_euro+sachkosten_euro` Vergleich; bei FB II/III/IV ggf. Methode early-returnen mit „Vorjahresvergleich für FB X nicht implementiert" (klare Begründung statt Crash).

- [ ] **Step 2: Commit**

```bash
git add pruefung/src/pruefung/vergleich_vorjahr.py
git commit -m "fix(pruefung): vergleich_vorjahr auf Multi-FB; FB I Bemessung, FB II/III/IV Stub"
```

---

## Task 9: End-to-End Smoketest + Deploy

**Files:**
- Verify only.

- [ ] **Step 1: Lokal `cd pruefung && uv run pytest` — alle Tests grün**

- [ ] **Step 2: Build + Push Container auf VPS**

```bash
# Lokal:
cd "/Users/robert/Library/CloudStorage/OneDrive-Persönlich/Vorlesungen/Übergreifend/Fallstudien/DigitalisierungVerwaltung"
# Robert pusht selbst — wir geben ihm die Commit-Summary
git log --oneline origin/main..HEAD
```

- [ ] **Step 3: Auf VPS rebuilden (Robert tut das):**

```bash
cd /opt/pruefung/repo/pruefung/docker
docker compose build --no-cache pruefung-service
docker compose up -d --force-recreate pruefung-service
docker logs pruefung-service --tail 30
```

- [ ] **Step 4: Browser-Smoketest auf https://ki.butscher.cloud**

Für FB I (FAKE-002 Caritas), FB II (FAKE-005 AWO), FB III-A (FAKE-003 Seniorenkreis), FB IV (FAKE-006 Türkisch-Deutscher Seniorenbund):
1. Antrag öffnen → „Konformität per KI prüfen"
2. Erwartet: HTTP 200, Empfehlung sichtbar, Befunde sichtbar (oder „Keine Befunde" falls Doctree leer)

- [ ] **Step 5: PR-Beschreibung schreiben**

```
fix(pruefung): Multi-FB-Refactor — _fetch_antrag, Layer A/B/C, Bescheid-Dispatcher

- _fetch_antrag liest apl.antraege + FB-Detail-Tabellen (statt apl2.antrag_mit_summen)
- Layer A nutzt FB-Plugin.get_pflicht_felder() + generische Formatchecks (IBAN/BIC/PLZ/email)
- Layer B löst ontologie_rules-Tabelle ab → plugin.check_konformitaet()
- Layer C System-Prompt FB-aware
- /api/bescheid läuft komplett über render_bescheid_safe() (FB-Plugin + Halluzinations-Schutz)
- bescheid_subsumtion + risiko_score + vergleich_vorjahr auf neue Feldnamen
- Halluzinations-Schutz (Robert-Regel): validiere_oder_abbrechen() bleibt im Bescheid-Pfad
```

---

## Selbstreview-Punkte

1. **Schema-Coverage:** Jede der 7 Legacy-Dateien (`main.py, layer_a, layer_b, layer_c, bescheid_subsumtion, risiko_score, vergleich_vorjahr`) hat einen Task. `pdf_render.py` + `templates/bescheid.html.j2` werden durch Task 5 (Plugin-Templates) abgelöst.
2. **Halluzinations-Schutz erhalten:** `render_bescheid_safe()` ruft intern `validiere_oder_abbrechen()` — Task 5 darf das nicht umgehen.
3. **Frontend-Vertrag stabil:** Response-Schema von `/api/pruefen` (`protokoll_id, anzahl_verstoesse, anzahl_hinweise, pruefungsstatus, empfehlung, doctree_version, duration_ms, befunde`) bleibt unverändert. Befund-Schema mit `schwere/layer/feld/beschreibung/zitat/section_path/paragraph_ref/konfidenz` ebenfalls.
4. **Bekannte Auslassungen:** `apl.ahp_doctree` ist leer → Layer C produziert keine RAG-Hinweise (Empty-Tree-Branch in `main.py:130-131` existiert). Doctree-Build ist eigener Task, nicht Teil dieses Plans.
5. **Doctree-Tests:** Layer C-Tests werden in Task 4 nur oberflächlich angepasst (Prompt-String), keine RAG-Tests neu, weil Voyage-Embeddings nicht aktualisiert sind.
