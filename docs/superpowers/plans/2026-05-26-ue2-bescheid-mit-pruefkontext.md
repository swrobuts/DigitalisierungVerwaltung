# UE2 Bescheid mit SektionPruefung-Kontext

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Der manuelle UE2-Bescheid bezieht die `apl.manuelle_pruefung`-Einträge (Sektionsstatus + Kommentar pro §) als Kontext beim Bescheid-Subsumtions-Prompt mit ein. So fließen die manuellen Sachbearbeiter-Bewertungen ins Bescheid-PDF — statt einer leeren Begründung.

**Architecture:** 
- Backend (`pruefung/src/pruefung/main.py`): `BescheidRequest` bekommt optionales Feld `manuelle_pruefung_kontext: list[ManuellePruefungEintrag]`. Wenn gesetzt, wird ein „Manuelle Prüfung des Sachbearbeiters"-Block in den Plugin-Subsumtions-Prompt eingefügt — direkt vor dem Antrag, sodass das LLM die Bewertungen als Kontext hat.
- Frontend UE2 (`ue2/sachbearbeiter/.../AntragDetail.tsx`): `handleCreateManualBescheid` lädt vorab alle `manuelle_pruefung`-Einträge für den Antrag (per `useManuellePruefung` oder direkter Supabase-Query) und reicht sie ans Backend.
- UE3 bleibt unverändert (`manuelle_pruefung_kontext` ist optional, Default leer).

**Halluzinations-Schutz:** `validiere_oder_abbrechen()` läuft weiter wie bisher — die manuellen Kommentare sind nur Kontext-Hinweise für das LLM, sie übersteuern den Norm-Validator nicht. Wenn ein Sachbearbeiter-Kommentar einen erfundenen § erwähnt, würde der LLM das nicht in den Bescheid übernehmen, weil der Validator gegen `apl.ahp_norm_statements` greift.

---

## Task 1: Backend — BescheidRequest erweitern + Kontext in Prompt einfügen

**Files:**
- Modify: `pruefung/src/pruefung/main.py` (BescheidRequest + bescheid()-Endpoint)
- Eventuell: `pruefung/src/pruefung/foerderbereiche/_common.py` (Helper für Kontext-Block)

- [ ] **Step 1: Test schreiben — Pydantic-Model akzeptiert Kontext**

```python
# pruefung/tests/test_bescheid_with_kontext.py
from pruefung.main import BescheidRequest

def test_bescheid_request_akzeptiert_manuelle_pruefung_kontext():
    req = BescheidRequest(
        antrag_id="abc",
        entscheidung="bewilligt",
        manuelle_pruefung_kontext=[
            {"paragraph": "antragsteller", "status": "ok", "kommentar": None},
            {"paragraph": "fb_detail", "status": "fraglich",
             "kommentar": "Variante D-Begründung dünn."},
        ],
    )
    assert len(req.manuelle_pruefung_kontext) == 2
    assert req.manuelle_pruefung_kontext[0]["status"] == "ok"

def test_bescheid_request_ohne_kontext_default_none():
    req = BescheidRequest(antrag_id="abc", entscheidung="bewilligt")
    assert req.manuelle_pruefung_kontext is None
```

- [ ] **Step 2: Pydantic-Model erweitern**

```python
# pruefung/src/pruefung/main.py
class ManuellePruefungEintrag(BaseModel):
    paragraph: str  # 'antragsteller' | 'bank' | 'fb_detail' | 'anlagen' | ...
    status: str  # 'offen' | 'ok' | 'fraglich' | 'fehlt'
    kommentar: str | None = None

class BescheidRequest(BaseModel):
    antrag_id: str
    entscheidung: str
    bewilligte_summe_euro: float | None = None
    bearbeiter_kommentar: str | None = None
    ausgestellt_von: str | None = None
    # NEU: optional, von UE2 gesetzt; UE3 verwendet KI-Prüfung statt dessen
    manuelle_pruefung_kontext: list[ManuellePruefungEintrag] | None = None
```

- [ ] **Step 3: Kontext-Block in Prompt einfügen**

Wo der Bescheid-Subsumtions-Prompt zusammengebaut wird (im `bescheid()`-Handler):

```python
# Vor dem Plugin-Aufruf:
manuelle_pruefung_block = ""
if req.manuelle_pruefung_kontext:
    eintraege = []
    for e in req.manuelle_pruefung_kontext:
        status_label = {
            "ok": "✓ OK",
            "fraglich": "⚠ fraglich",
            "fehlt": "✗ fehlt",
            "offen": "○ offen",
        }.get(e.status, e.status)
        zeile = f"  - {e.paragraph}: {status_label}"
        if e.kommentar:
            zeile += f" — Kommentar: „{e.kommentar}\""
        eintraege.append(zeile)
    manuelle_pruefung_block = (
        "\n\nMANUELLE PRÜFUNG des Sachbearbeiters (UE2 — Vier-Augen-Prinzip):\n"
        + "\n".join(eintraege)
        + "\n\n"
        "Berücksichtige diese manuellen Bewertungen in der Bescheid-Begründung, "
        "aber halluziniere KEINE § — zitiere ausschließlich aus den oben gelisteten "
        "Norm-Statements."
    )

# Dann an den Plugin-Prompt anhängen (vor 'Antrag:')
```

Die exakte Verdrahtung hängt davon ab, wie der Plugin-Subsumtions-Prompt im `bescheid()`-Handler aktuell konstruiert wird. Der Subagent muss `main.py:bescheid()` (ab Zeile 606) genau lesen und die richtige Stelle finden.

- [ ] **Step 4: Test laufen — Backend grün**

```bash
cd pruefung && uv run pytest tests/ -q
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pruefung): BescheidRequest akzeptiert manuelle_pruefung_kontext (UE2-Pfad)"
```

---

## Task 2: Frontend UE2 — Kontext laden + mitsenden

**Files:**
- Modify: `ue2/sachbearbeiter/src/pages/AntragDetail.tsx` (handleCreateManualBescheid)
- Eventuell: `ue2/sachbearbeiter/src/hooks/useManuellePruefung.ts` (Listen-Getter ergänzen, falls noch nicht da)
- Eventuell: `ue2/sachbearbeiter/src/hooks/useBescheide.ts` (Type für erstelleBescheid-Parameter erweitern)

- [ ] **Step 1: useManuellePruefung-Hook prüfen, ob Liste aller Einträge zugänglich ist**

Lies `ue2/sachbearbeiter/src/hooks/useManuellePruefung.ts`. Wenn nur `get(paragraph)` da ist, ergänze `listAll()` oder gib die ganze Map an den Caller.

- [ ] **Step 2: useBescheide.erstelleBescheid Param-Typ erweitern**

```typescript
interface ErstellBescheidParams {
  entscheidung: BescheidRow["entscheidung"];
  ausgestellt_von?: string | null;
  bearbeiter_kommentar?: string;
  manuelle_pruefung_kontext?: Array<{
    paragraph: string;
    status: string;
    kommentar: string | null;
  }>;
}
```

- [ ] **Step 3: handleCreateManualBescheid in UE2 AntragDetail anpassen**

```tsx
async function handleCreateManualBescheid(
  entscheidung: "bewilligen" | "ablehnen" | "rueckfrage",
) {
  const dbEntscheidung = ...;
  // NEU: alle manuelle_pruefung-Einträge holen
  const kontext = listAllManuellePruefung(); // aus useManuellePruefung-Context
  const res = await erstelleBescheid({
    entscheidung: dbEntscheidung,
    ausgestellt_von: session?.user?.email ?? null,
    bearbeiter_kommentar: `Bescheid manuell erstellt (${entscheidung}).`,
    manuelle_pruefung_kontext: kontext, // <-- neu
  });
  // ... Rest wie bisher
}
```

- [ ] **Step 4: Test anpassen**

`ue2/sachbearbeiter/tests/AntragDetail.test.tsx`: Mock von erstelleBescheid akzeptiert den neuen Param.

- [ ] **Step 5: Build + Test + Commit**

```bash
cd ue2/sachbearbeiter && pnpm build && pnpm vitest run
git commit -m "feat(ue2): manueller Bescheid reicht SektionPruefung-Kontext ans Backend"
```

---

## Task 3: End-to-End Smoketest (Robert — nach Deploy)

### Deploy

```bash
git push origin main
ssh <server>
cd /opt/pruefung/repo && git pull
cd /opt/pruefung/repo/pruefung/docker
docker compose build --no-cache pruefung-service
docker compose up -d --force-recreate pruefung-service
cd ../../..
./scripts/dv-fast-deploy.sh ue2
```

### Klick-Pfad in UE2 (sachbearbeiter.butscher.cloud)

1. **Login** als thws.de-Account.
2. **Antrag öffnen** — z.B. FB III FAKE-006 (Begegnungsstätte) oder ein FB-II-Antrag mit gefüllten §-Sektionen.
3. **SektionPruefung-Status setzen** in mindestens 2 Sektionen:
   - „Antragsteller / Träger" → **✓ OK** + Kommentar „Träger seit 10 Jahren bekannt, keine Bedenken"
   - „Förderbereichs-Details" → **⚠ fraglich** + Kommentar „Variante D-Begründung dünn — bitte Sozialausschuss anhören"
   - (Optional) „Bankverbindung" → **✗ fehlt** + Kommentar „IBAN-Inhaberschaft nicht belegt"
4. **„Bewilligen"-Button** in der BescheideListe klicken (manuelle Bescheid-Erstellung).
5. **Bescheid-PDF öffnen** über „PDF anzeigen". 

### Erwartetes Bescheid-Verhalten

- Zwischen Befundliste und „Anmerkung der Sachbearbeitung" steht ein **blau-eingerahmter Kasten** mit der Überschrift **MANUELLE VIER-AUGEN-PRÜFUNG (Sachbearbeitung)**.
- Der Kasten listet die gesetzten Bewertungen mit lesbaren Labels („Antragsteller / Träger: ✓ OK", „Förderbereichs-Details: ⚠ fraglich — Kommentar: …").
- Sektionen mit Status `offen` (nicht angefasst) tauchen **nicht** auf.
- Wenn **keine** Sektionen geprüft sind, fehlt der Kasten ganz (kein Rauschen).
- Halluzinations-Schutz: Wenn der manuelle Kommentar einen erfundenen § erwähnt, wird der Bescheid **trotzdem** ausgestellt — der manuelle Kommentar ist nur Sachbearbeiter-Kontext. Aber: wenn jemals KI generierte Befunde mit erfundenen § im Bescheid landen, blockt der bestehende `validiere_oder_abbrechen()` weiterhin (422).

### DOCX-Variante

- „Bescheid als DOCX herunterladen" rendert on-demand aus `apl.bescheide.begruendung_jsonb` — der Vier-Augen-Block ist dort genauso enthalten (blaue Box am selben Platz).

### UE3-Regress-Check

- UE3 (sachbearbeitung-ki.butscher.cloud) öffnen, KI-Bescheid für einen Antrag erstellen.
- Bescheid-PDF darf den Vier-Augen-Block **nicht** enthalten (UE3 sendet kein `manuelle_pruefung_kontext`).
- Befunde + KI-Subsumtion müssen wie bisher erscheinen.

---

## Selbstreview

1. **Halluzinations-Schutz:** Der Validator gegen `apl.ahp_norm_statements` bleibt aktiv, das LLM kann keine § erfinden — auch nicht wenn der manuelle Kommentar einen erfundenen Bezug enthält.
2. **UE3-Regress?** `manuelle_pruefung_kontext` ist optional + default None → UE3-Flow unverändert.
3. **Tests:** Backend +2 (Schema), UE2 Page-Test angepasst (erstelleBescheid-Mock-Signature), UE3 unverändert.
