# UE2-Funktionalität auf UE3-Parität heben (minus KI, minus Externe Validierung)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** UE2 (manuelle Sachbearbeitung) hat exakt dieselbe Funktionalität und denselben Aufbau wie UE3 (KI-Sachbearbeitung), **nur ohne** die KI-Konformitätsprüfung und ohne die externe Validierung. Konkret: UE2-AntragDetail-Page bekommt AntragMetricsBar, BescheideListe (mit manuell-Erstellen-Button), ZweitpruefungsCard (ohne KI-Option), VorjahresVergleich, HistoryTimeline im Article. Status-Workflow + Verlauf bleibt wie aktuell.

**Architecture:** UE3 ist die Quelle. UE2-Komponenten werden 1:1 dupliziert (statt shared package — vermeidet Refactor-Aufwand jetzt; spätere Konsolidierung als eigene Session). Eine Komponente wird parametrisiert:
- `ZweitpruefungsCard`: neue Prop `withKi?: boolean` (default `true`). UE2 übergibt `false` → KI-adversariell-Option ausgeblendet.

Eine Komponente wird erweitert:
- `BescheideListe`: optionale Prop `onCreateManual?: (entscheidung) => Promise<void>` plus eingebauter „Bescheid erstellen"-Button — sichtbar wenn Prop gesetzt. UE3 nutzt das nicht (Bescheid kommt aus KI-Empfehlungs-Flow), UE2 schon.

**Tech Stack:** React 19, vorhandene Hooks-Bibliothek, `pruefung-Service /api/bescheid` als Backend für manuelle Bescheid-Erstellung.

**Halluzinations-Schutz (Robert-Regel):** Beim manuellen Bescheid muss der Halluzinations-Validator (`render_bescheid_safe → validiere_oder_abbrechen`) im Backend genauso laufen wie beim KI-Bescheid — das geschieht bereits, weil der Endpoint identisch ist.

---

## Task 1: UE2-Hooks vervollständigen (Spiegel von UE3)

**Files:**
- Create: `ue2/sachbearbeiter/src/hooks/useBescheide.ts` (Kopie aus UE3 + Anpassung)
- Create: `ue2/sachbearbeiter/src/hooks/usePruefungen.ts` (für ZweitpruefungsCard — Zweitprüfung ist nicht KI-only, auch manuell)
- Create: `ue2/sachbearbeiter/src/hooks/useVergleichVorjahr.ts`

**Verifikation:** Welche Hooks UE3 hat, prüfen:
```bash
ls ue3/sachbearbeitung-ki/src/hooks/
ls ue2/sachbearbeiter/src/hooks/
```
Diese Hooks fehlen UE2:
- useBescheide, usePruefungen, useVergleichVorjahr, useExterneValidierung (NICHT übernehmen), useAhpTree (NICHT übernehmen, KI-spezifisch), usePruefung (NICHT übernehmen, KI-Konformitätsprüfung)

- [ ] **Step 1:** `cp ue3/sachbearbeitung-ki/src/hooks/{useBescheide,usePruefungen,useVergleichVorjahr}.ts ue2/sachbearbeiter/src/hooks/`
- [ ] **Step 2:** Imports in den Files prüfen — sollten `@dv/data-layer` + relative paths nutzen, die in UE2 identisch sind. Keine UE3-spezifischen Imports.
- [ ] **Step 3:** Commit `feat(ue2): Hooks useBescheide + usePruefungen + useVergleichVorjahr (Spiegel UE3)`

---

## Task 2: UE2-Komponenten vervollständigen (Spiegel von UE3, ohne KI-Cards)

**Files zu kopieren (1:1 aus UE3):**
- `ue3/.../components/AntragMetricsBar.tsx` → UE2
- `ue3/.../components/VorjahresVergleich.tsx` → UE2

**Files zu kopieren MIT Anpassung:**
- `ue3/.../components/BescheideListe.tsx` → UE2 (erweitern um `onCreateManual` + Button)
- `ue3/.../components/ZweitpruefungsCard.tsx` → UE2 (Prop `withKi`, default true; UE2 übergibt false)

**KEINE Kopie:**
- PruefungsCard, ExterneValidierungCard, useAhpTree, useExterneValidierung — UE2-spezifisch ausgeschlossen.

- [ ] **Step 1: AntragMetricsBar 1:1 kopieren**
  ```bash
  cp ue3/sachbearbeitung-ki/src/components/AntragMetricsBar.tsx ue2/sachbearbeiter/src/components/
  ```
  Prüfen ob Imports passen (`../lib/supabase`, `../hooks/...`) — sollte ja, weil UE2 ähnliche Struktur hat.

- [ ] **Step 2: VorjahresVergleich 1:1 kopieren**
  ```bash
  cp ue3/sachbearbeitung-ki/src/components/VorjahresVergleich.tsx ue2/sachbearbeiter/src/components/
  ```

- [ ] **Step 3: BescheideListe kopieren + manuelle Erstellung ergänzen**

```bash
cp ue3/sachbearbeitung-ki/src/components/BescheideListe.tsx ue2/sachbearbeiter/src/components/
```

Dann in der UE2-Version (UND der UE3-Version, damit Schnittstelle synchron bleibt) ergänzen:

```tsx
interface BescheideListeProps {
  bescheide: BescheidRow[];
  onOpen: (b: BescheidRow) => void;
  onOpenDocx?: (b: BescheidRow) => void;
  onDelete?: (b: BescheidRow) => Promise<void>;
  error?: string | null;
  // NEU — wenn gesetzt, wird ein "Bescheid erstellen"-Button gezeigt
  onCreateManual?: (entscheidung: "bewilligen" | "ablehnen" | "rueckfrage") => Promise<void>;
  creatingManual?: boolean;
}

// Im JSX, oberhalb der Liste (wenn onCreateManual gesetzt):
{onCreateManual && (
  <div className="border border-slate-200 rounded p-3 space-y-2">
    <p className="text-sm font-medium">Bescheid manuell erstellen</p>
    <p className="text-xs text-slate-500">Wählen Sie die Entscheidung — der Bescheid wird im Hintergrund erzeugt und unterliegt dem Halluzinations-Schutz (Validierung gegen AHP-Norm-Aussagen).</p>
    <div className="flex gap-2">
      <Button size="sm" disabled={creatingManual} onClick={() => onCreateManual("bewilligen")}>
        ✓ Bewilligen
      </Button>
      <Button size="sm" variant="outline" disabled={creatingManual} onClick={() => onCreateManual("rueckfrage")}>
        ↩ Rückfrage
      </Button>
      <Button size="sm" variant="outline" disabled={creatingManual} onClick={() => onCreateManual("ablehnen")}>
        ✖ Ablehnen
      </Button>
    </div>
    {creatingManual && <p className="text-xs text-slate-500">Bescheid wird erstellt …</p>}
  </div>
)}
```

- [ ] **Step 4: ZweitpruefungsCard parametrisieren**

```bash
cp ue3/sachbearbeitung-ki/src/components/ZweitpruefungsCard.tsx ue2/sachbearbeiter/src/components/
```

In **beiden** Versionen (UE2 + UE3) die Komponente um `withKi` erweitern:

```tsx
interface ZweitpruefungsCardProps {
  antragId: string;
  antragStatus?: string;
  withKi?: boolean; // default true (UE3), UE2 übergibt false
}

// Render-Logic:
const showKiOption = withKi !== false;

// Im JSX nur den "KI adversariell"-Button rendern wenn showKiOption
{showKiOption && (
  <Button onClick={...}>
    <span>KI adversariell</span>
  </Button>
)}
```

UE3 nutzt das default (`true` — KI-Button bleibt sichtbar). UE2 übergibt `withKi={false}`.

- [ ] **Step 5: Commit** `feat(ue2): Components AntragMetricsBar + VorjahresVergleich + BescheideListe (mit manuell-Erstellung) + ZweitpruefungsCard (ohne KI)`

---

## Task 3: UE2 AntragDetail.tsx auf UE3-Layout heben

**File:**
- Modify: `ue2/sachbearbeiter/src/pages/AntragDetail.tsx`

**Referenz:** `ue3/sachbearbeitung-ki/src/pages/AntragDetail.tsx`. Strategie: UE3-Layout 1:1 spiegeln, dann PruefungsCard + ExterneValidierungCard entfernen, ZweitpruefungsCard mit `withKi={false}` aufrufen, BescheideListe mit `onCreateManual` versorgen.

**Manueller Bescheid-Flow:**
```tsx
async function handleCreateManualBescheid(
  entscheidung: "bewilligen" | "ablehnen" | "rueckfrage",
) {
  setCreatingBescheid(true);
  try {
    const res = await fetch(`${PRUEFUNG_SERVICE}/api/bescheid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        antrag_id: antrag.id,
        entscheidung,
        sachbearbeiter_email: session?.user?.email,
        manuell: true,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await reload();
    // Status-Wechsel auch persistieren — Bescheid + Antrag konsistent halten
    const target: Status =
      entscheidung === "bewilligen" ? "bewilligt" :
      entscheidung === "ablehnen" ? "abgelehnt" : "rueckfrage";
    await changeStatus(target, `Bescheid manuell ${entscheidung}`);
  } catch (e) {
    alert("Fehler beim Bescheid: " + (e as Error).message);
  } finally {
    setCreatingBescheid(false);
  }
}
```

**Aside-Reihenfolge UE2 (analog UE3, ohne KI/Externe):**
1. BescheideListe (mit `onCreateManual`-Button — also ist das die HAUPT-Aktion in UE2)
2. ZweitpruefungsCard (mit `withKi={false}`)
3. Workflow · Status-Wechsel
4. VorjahresVergleich

**Article-Inhalt (analog UE3):**
1. AntragMetricsBar oben
2. weißer Container: AntragHeader + AntragViewer + Footer
3. HistoryTimeline (statt im Aside)

**Backend-Endpoint:** Prüfe `pruefung/src/pruefung/main.py` ob `POST /api/bescheid` mit `manuell=true` schon funktioniert oder ob `BescheidRequest` einen `manuell`-Flag braucht. Falls die Schema/Logik das nicht unterstützt — entweder kurz ergänzen (eine Zeile in BescheidRequest + Default-Flag durchreichen) oder weglassen und ohne Flag aufrufen (Backend unterscheidet ja sowieso nicht zwischen manuell/automatisch, nur die Audit-Spur).

- [ ] **Step 1: Layout umsetzen**
- [ ] **Step 2: Page-Render-Test in `tests/AntragDetail.test.tsx` anpassen** — alle neuen Cards rendern (Mocks für die neuen Hooks ergänzen)
- [ ] **Step 3: Commit** `feat(ue2): AntragDetail = UE3 minus PruefungsCard minus ExterneValidierungCard + manueller Bescheid`

---

## Task 4: Bescheid-Backend prüfen + ggf. anpassen

Falls `POST /api/bescheid` ein PruefprotokollId zwingend braucht (für KI-Workflow) und manuell ohne KI das nicht hat:
- Backend so anpassen, dass `pruefprotokoll_id` optional ist, Bescheid-Subsumtion ohne KI-Empfehlung läuft mit den Antragsdaten + Halluzinations-Validator
- ODER: Frontend zeigt eine Warnung „Bitte erst manuelle Prüfung abschließen", und der manuelle Pfad nutzt die `manuelle_pruefung`-Tabelle als Quelle

**Pragmatischer Ansatz:** Bescheid-Erstellung in UE2 ohne PruefprotokollId; Bescheid-Subsumtion läuft trotzdem (FB-Plugin + AHP-Norm-Statements). Backend muss eventuell `pruefprotokoll_id: Optional[str] = None` machen.

- [ ] **Step 1:** `grep -n "pruefprotokoll_id\|BescheidRequest" pruefung/src/pruefung/main.py` — sehen ob optional
- [ ] **Step 2:** falls nötig: Pydantic-Model anpassen + Logik um die Optional behandelt
- [ ] **Step 3:** Commit `fix(pruefung): /api/bescheid akzeptiert manuelle Erstellung ohne pruefprotokoll_id`

---

## Task 5: End-to-End-Build + Tests

- [ ] **Step 1:** `cd ue2/sachbearbeiter && pnpm build && pnpm vitest run` — alle grün
- [ ] **Step 2:** UE3 Build, falls geänderte Komponenten (BescheideListe, ZweitpruefungsCard) auch dort kompilieren
- [ ] **Step 3:** Robert pusht + deployt mit `dv-fast-deploy.sh ue2; dv-fast-deploy.sh ue3`

---

## Selbstreview

1. **Optik identisch?** UE2 und UE3 zeigen denselben Bearbeitungsstand-Stepper, AntragHeader, §-Sektionen. Side-by-side im Browser prüfen.
2. **KI/Externe Validierung in UE2 sichtbar?** **NEIN** — wenn doch, Fehler.
3. **Bescheid manuell in UE2 funktioniert?** Buttons sichtbar, Klick erzeugt Bescheid + Status-Wechsel + PDF-Eintrag in Liste.
4. **Halluzinations-Schutz?** Bescheide aus UE2 laufen denselben Validator wie UE3 (Backend unverändert).
5. **Tests:** UE2 Test-Count nimmt um 4-6 zu (neue Cards). UE3 Tests bleiben grün (BescheideListe + ZweitpruefungsCard erweitert, nicht inkompatibel verändert).
6. **DRY-Sicht:** Komponenten in UE2 und UE3 sind Duplikate. Konsolidierung in ein shared package ist eigener Schritt, NICHT Teil dieses Plans.
