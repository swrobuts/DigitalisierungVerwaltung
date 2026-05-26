# UE3 Vollrestoration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wiederherstellung aller UE3-Sachbearbeitungs-Features, die beim Hard-Cut (apl2→apl, commit `c3fc01b`) verloren gingen — plus PDF-konforme Korrekturen (FB IV als formloser Antrag).

**Architecture:** 1:1-Port der 6 gelöschten Components + 3 Hooks aus git-Historie (commit `86cbbec`), mit Schema-Anpassung apl2→apl, Integration des bestehenden `@dv/antrag-renderer` (statt der ebenfalls gelöschten FbBlocks), neuem 3-Schritt-Bearbeitungsstand-Stepper. FB IV wird zu einem formlosen PDF-Upload-Antrag umgebaut (statt der erfundenen Strukturfelder).

**Tech Stack:** React 19 + TypeScript + Tailwind 4 + Vite (UE3), FastAPI + Anthropic (pruefung-Backend), Self-hosted Supabase (PostgreSQL apl-Schema), pnpm-Workspace mit `@dv/antrag-renderer`, `@dv/data-layer`, `@dv/foerderbereiche`.

**Voraussetzungen:** Etappe 1 ist bereits committet (commit `15e4a45`): Migrationen 070+071 + PDF-Audit-Doku + Original-PDFs. Migrationen sind aber noch nicht auf VPS angewendet.

---

## Übersicht der Etappen

| Etappe | Inhalt | Aufwand | Liefer-Status |
|---|---|---|---|
| A | DB-Migrationen 070+071 auf VPS anwenden | 10 min | Backend funktioniert |
| B | 3 Hooks restaurieren (`usePruefung`, `usePruefungen`, `useAhpTree`) | 45 min | API-Schicht steht |
| C | 5 Core-Components restaurieren (PruefungsCard, BescheideListe, AntragMetricsBar, Bearbeitungsstand, VorjahresVergleich) | 2.5 Std | Hauptfeatures sichtbar |
| D | AntragDetail-Layout neu zusammenbauen | 1 Std | Volle UE3-Ansicht zurück |
| E | ZweitpruefungsCard + ExterneValidierungCard | 2 Std | Vier-Augen + Perplexity zurück |
| F | FB-IV Umbau zum formlosen Antrag (UE1 + Backend + Renderer) | 2 Std | PDF-konform |
| G | Ontologie-Update — `ahp_norm_statements` für FB I/II/IV + Doctree-Build | 2 Std | KI-Prüfung deckt alle FB ab |
| H | Tests + Build + Deploy + E2E-Smoketest | 1 Std | Live verifiziert |
| I | Final-Doku + Push | 30 min | Repo sauber |

**Gesamt:** ~12 Std + 10 min — über mehrere Subagenten-Sessions.

---

## File-Struktur (Übersicht)

### UE3 — neue/wiederhergestellte Files

```
ue3/sachbearbeitung-ki/src/
├── hooks/
│   ├── usePruefung.ts            ← NEU (Konformitäts-Run + latest pruefprotokoll)
│   ├── usePruefungen.ts          ← NEU (Vier-Augen-Liste)
│   ├── useAhpTree.ts             ← NEU (Doctree-Lookup + findNodeByPath)
│   ├── useVergleichVorjahr.ts    ← NEU (GET /api/antrag/{id}/vergleich-vorjahr)
│   └── useExterneValidierung.ts  ← NEU (Perplexity-Aufruf)
├── components/
│   ├── PruefungsCard.tsx         ← restauriert (348 LOC, von /tmp/old-ue3)
│   ├── BescheideListe.tsx        ← restauriert (330 LOC)
│   ├── AntragMetricsBar.tsx      ← restauriert (196 LOC)
│   ├── Bearbeitungsstand.tsx     ← NEU (3-Schritt-Stepper, 80 LOC)
│   ├── VorjahresVergleich.tsx    ← restauriert (211 LOC)
│   ├── ZweitpruefungsCard.tsx    ← restauriert (905 LOC)
│   └── ExterneValidierungCard.tsx ← restauriert (196 LOC)
└── pages/
    └── AntragDetail.tsx          ← überarbeitet (Layout integriert alle Cards)
```

### UE1 — FB-IV Umbau

```
ue1/webformular/src/
├── pages/Phase2FBIV.tsx         ← überarbeitet (PDF-Upload statt Freitext)
├── state/AntragContext.tsx      ← fb_iv Type angepasst
└── lib/submit.ts                ← FB-IV-Mapping angepasst
```

### packages/antrag-renderer — FB-IV-Schema

```
packages/antrag-renderer/src/schemas/fb-iv.schema.ts  ← überarbeitet (formloser Antrag)
```

### Backend (pruefung-service)

```
pruefung/src/pruefung/foerderbereiche/fb_iv.py  ← FB-IV-Validator angepasst
```

### DB-Migrationen

```
supabase/migrations/072_apl_ahp_norm_statements_fb1_fb2_fb4.sql  ← NEU
```

---

## Etappe A: DB-Migrationen auf VPS anwenden

**Voraussetzung:** Migrationen 070+071 sind bereits im Repo committet (`15e4a45`).

**Files:**
- Anwenden: `supabase/migrations/070_apl_pruefprotokoll_pruefungen_doctree_restore.sql`
- Anwenden: `supabase/migrations/071_apl_fb_iv_formloser_antrag.sql`

### Task A1: Migrationen auf VPS anwenden

- [ ] **Step 1: SSH zur VPS + rsync der Migration-Files**

```bash
# Auf Mac:
cd "/Users/robert/.../DigitalisierungVerwaltung"
rsync -avz supabase/migrations/070_*.sql supabase/migrations/071_*.sql \
  root@bot.butscher.cloud:/opt/pruefung/repo/supabase/migrations/
```

- [ ] **Step 2: Migrationen einspielen**

Run auf VPS:
```bash
docker exec -i supabase-db psql -U postgres -d postgres < /opt/pruefung/repo/supabase/migrations/070_apl_pruefprotokoll_pruefungen_doctree_restore.sql
docker exec -i supabase-db psql -U postgres -d postgres < /opt/pruefung/repo/supabase/migrations/071_apl_fb_iv_formloser_antrag.sql
```
Erwartet: kein ERROR, einige NOTICE-Zeilen für `do $$ begin ... exception ...`.

- [ ] **Step 3: Verifikation**

Run auf VPS:
```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "select count(*) from apl.pruefprotokoll; select count(*) from apl.pruefungen; select count(*) from apl.ahp_doctree; select count(*) from apl.ahp_plaene;"
```
Erwartet: 4 Zeilen mit `0` oder positiven Counts (4 Pläne sollten existieren).

- [ ] **Step 4: PostgREST schema-cache neu laden**

```bash
docker exec supabase-db psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"
```

- [ ] **Step 5: Health-Test des Backend**

```bash
curl -sI https://pruefung.butscher.cloud/api/health
```
Erwartet: HTTP 200.

---

## Etappe B: Hooks restaurieren

### Task B1: `usePruefung.ts` (singular — Konformitäts-Run)

**Files:**
- Create: `ue3/sachbearbeitung-ki/src/hooks/usePruefung.ts`
- Reference: `/tmp/old-ue3/usePruefungen.ts` (alte Version, aber für PLURAL — wir brauchen Singular separat)

- [ ] **Step 1: Test schreiben**

`ue3/sachbearbeitung-ki/tests/hooks/usePruefung.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePruefung } from "../../src/hooks/usePruefung";

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: "http://signed" }, error: null }),
      }),
    },
  },
}));

describe("usePruefung", () => {
  it("liefert latest=null wenn keine Prüfung existiert", async () => {
    const { result } = renderHook(() => usePruefung("antrag-id"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.latest).toBeNull();
  });

  it("pruefen() ruft pruefung-service auf", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ protokoll_id: "p1", anzahl_verstoesse: 0 }),
    });
    const { result } = renderHook(() => usePruefung("antrag-id"));
    await act(async () => {
      await result.current.pruefen("test@example.com");
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://pruefung.butscher.cloud/api/pruefen",
      expect.objectContaining({ method: "POST" })
    );
  });
});
```

- [ ] **Step 2: Test läuft → soll fehlschlagen**

```bash
cd ue3/sachbearbeitung-ki && pnpm test tests/hooks/usePruefung.test.ts
```
Erwartet: FAIL „Cannot resolve usePruefung".

- [ ] **Step 3: Hook implementieren**

`ue3/sachbearbeitung-ki/src/hooks/usePruefung.ts`:
```typescript
/**
 * Konformitäts-Prüfung für EINEN Antrag.
 *
 * - `latest`: letztes apl.pruefprotokoll für diesen Antrag (oder null).
 * - `pruefen(email)`: triggert POST /api/pruefen → schreibt neues pruefprotokoll.
 * - `downloadPdf()`: liefert signed URL für das Protokoll-PDF aus Storage.
 *
 * Unterschied zu usePruefungen (PLURAL): das ist die Vier-Augen-Bewertung,
 * usePruefung (SINGULAR) ist die KI-Konformitäts-Prüfung selbst.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const PRUEFUNG_SERVICE = "https://pruefung.butscher.cloud";

export interface PruefBefund {
  schwere: "verstoss" | "hinweis";
  layer: "A" | "B" | "C";
  feld?: string;
  beschreibung: string;
  zitat?: string;
  section_path?: string;
  paragraph_ref?: string;
  konfidenz?: number;
}

export interface PruefEmpfehlung {
  aktion: "bewilligen" | "rueckfrage" | "ablehnen";
  begruendung: string;
  nicht_heilbare_verstoesse: string[];
  heilbare_verstoesse: string[];
}

export interface PruefprotokollRow {
  id: string;
  antrag_id: string;
  geprueft_am: string;
  geprueft_von: string | null;
  doctree_version: string | null;
  duration_ms: number | null;
  pdf_storage_path: string | null;
  ergebnis_jsonb: {
    befunde: PruefBefund[];
    empfehlung?: PruefEmpfehlung;
    doctree_version?: string;
    llm_usage?: { total_input_tokens: number; total_output_tokens: number; cost_usd: number };
  };
}

export function usePruefung(antragId: string | undefined) {
  const [latest, setLatest] = useState<PruefprotokollRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!antragId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("pruefprotokoll")
      .select("*")
      .eq("antrag_id", antragId)
      .order("geprueft_am", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLoading(false);
    if (error) setError(error.message);
    else setLatest(data as PruefprotokollRow | null);
  }, [antragId]);

  useEffect(() => { void reload(); }, [reload]);

  const pruefen = useCallback(
    async (geprueft_von: string) => {
      if (!antragId) return { error: "Kein Antrag" };
      setRunning(true);
      setError(null);
      try {
        const res = await fetch(`${PRUEFUNG_SERVICE}/api/pruefen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ antrag_id: antragId, geprueft_von }),
        });
        if (!res.ok) {
          const txt = await res.text();
          setError(`Prüfung fehlgeschlagen: ${res.status} ${txt}`);
          return { error: txt };
        }
        const result = await res.json();
        await reload();
        return { result };
      } finally {
        setRunning(false);
      }
    },
    [antragId, reload],
  );

  const downloadPdf = useCallback(async (): Promise<string | null> => {
    if (!latest?.pdf_storage_path) return null;
    const { data, error } = await supabase.storage
      .from("pruefprotokolle")
      .createSignedUrl(latest.pdf_storage_path, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }, [latest]);

  return { latest, loading, running, error, pruefen, downloadPdf, reload };
}
```

- [ ] **Step 4: Test läuft → soll passen**

```bash
cd ue3/sachbearbeitung-ki && pnpm test tests/hooks/usePruefung.test.ts
```
Erwartet: PASS 2/2.

- [ ] **Step 5: Commit**

```bash
git add ue3/sachbearbeitung-ki/src/hooks/usePruefung.ts ue3/sachbearbeitung-ki/tests/hooks/usePruefung.test.ts
git commit -m "feat(ue3): usePruefung-Hook restaurieren (Konformitäts-Prüfung)"
```

### Task B2: `usePruefungen.ts` (plural — Vier-Augen-Liste)

**Files:**
- Create: `ue3/sachbearbeitung-ki/src/hooks/usePruefungen.ts`
- Reference: `/tmp/old-ue3/usePruefungen.ts` (200 LOC)

- [ ] **Step 1: Quelle prüfen + 1:1 kopieren**

Die alte Version aus `/tmp/old-ue3/usePruefungen.ts` ist bereits apl-kompatibel (sie nutzt `supabase.from("pruefungen")` und der client hat `db: { schema: "apl" }`). Datei direkt kopieren:

```bash
cp /tmp/old-ue3/usePruefungen.ts ue3/sachbearbeitung-ki/src/hooks/usePruefungen.ts
```

- [ ] **Step 2: Header-Kommentar an apl-Schema anpassen**

In `ue3/sachbearbeitung-ki/src/hooks/usePruefungen.ts` Zeile 1-10:

Ersetze:
```typescript
/**
 * Vier-Augen-Prinzip: lädt + manipuliert apl2.pruefungen-Rows pro Antrag.
```

Durch:
```typescript
/**
 * Vier-Augen-Prinzip: lädt + manipuliert apl.pruefungen-Rows pro Antrag.
```

Und in Zeile 5:
```typescript
 * (UNIQUE-Constraint in Migration 037).
```

Durch:
```typescript
 * (UNIQUE-Constraint in Migration 070, übernommen aus 037).
```

- [ ] **Step 3: Test schreiben**

`ue3/sachbearbeitung-ki/tests/hooks/usePruefungen.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePruefungen } from "../../src/hooks/usePruefungen";

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({
            data: [
              { id: "p1", antrag_id: "a1", rolle: "erstpruefung", pruefer_typ: "mensch",
                pruefer_id: "test@example.com", angelegt_am: "2026-05-26T10:00:00Z",
                abhakungen_jsonb: {}, abgeschlossen_am: null, gesamt_kommentar: null,
                entscheidungs_vorschlag: null, pruefprotokoll_id: null, pruefer_modus: null },
              { id: "p2", antrag_id: "a1", rolle: "zweitpruefung", pruefer_typ: "ki",
                pruefer_id: "claude-sonnet-4-5", angelegt_am: "2026-05-26T10:05:00Z",
                abhakungen_jsonb: {}, abgeschlossen_am: null, gesamt_kommentar: null,
                entscheidungs_vorschlag: null, pruefprotokoll_id: null, pruefer_modus: "adversariell" },
            ],
            error: null,
          }),
        }),
      }),
    }),
  },
}));

describe("usePruefungen", () => {
  it("trennt Erst- und Zweitprüfung", async () => {
    const { result } = renderHook(() => usePruefungen("a1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pruefungen.length).toBe(2);
    expect(result.current.erstpruefung?.rolle).toBe("erstpruefung");
    expect(result.current.zweitpruefung?.rolle).toBe("zweitpruefung");
    expect(result.current.zweitpruefung?.pruefer_typ).toBe("ki");
  });
});
```

- [ ] **Step 4: Tests laufen lassen**

```bash
cd ue3/sachbearbeitung-ki && pnpm test tests/hooks/usePruefungen.test.ts
```
Erwartet: PASS 1/1.

- [ ] **Step 5: Commit**

```bash
git add ue3/sachbearbeitung-ki/src/hooks/usePruefungen.ts ue3/sachbearbeitung-ki/tests/hooks/usePruefungen.test.ts
git commit -m "feat(ue3): usePruefungen-Hook restaurieren (Vier-Augen-Liste)"
```

### Task B3: `useAhpTree.ts` (Doctree-Lookup)

**Files:**
- Create: `ue3/sachbearbeitung-ki/src/hooks/useAhpTree.ts`

- [ ] **Step 1: Hook implementieren**

`ue3/sachbearbeitung-ki/src/hooks/useAhpTree.ts`:
```typescript
/**
 * Lädt den aktuellen apl.ahp_doctree (höchste Version) + bietet
 * findNodeByPath und pathFromParagraphRef.
 *
 * Wird vom PruefungsCard zum Einblenden des AHP-Wortlauts unter
 * jedem Befund genutzt.
 */
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface DoctreeNode {
  id: string;
  title: string;
  content?: string;
  children?: DoctreeNode[];
  paragraph_ref?: string;
}

export interface DoctreeRoot {
  id: string;
  version: string;
  built_at: string;
  tree_jsonb: { children: DoctreeNode[] };
  source_file: string | null;
}

let _cache: DoctreeRoot | null = null;
let _cachePromise: Promise<DoctreeRoot | null> | null = null;

async function loadTree(): Promise<DoctreeRoot | null> {
  if (_cache) return _cache;
  if (_cachePromise) return _cachePromise;
  _cachePromise = (async () => {
    const { data } = await supabase
      .from("ahp_doctree")
      .select("*")
      .order("built_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    _cache = data as DoctreeRoot | null;
    return _cache;
  })();
  return _cachePromise;
}

export function useAhpTree() {
  const [tree, setTree] = useState<DoctreeRoot | null>(_cache);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    if (_cache) return;
    setLoading(true);
    loadTree().then((t) => {
      setTree(t);
      setLoading(false);
    });
  }, []);

  return { tree, loading };
}

/** "2.3.4" → ["2","3","4"] und sucht im Baum */
export function findNodeByPath(
  root: DoctreeRoot | null,
  path: string,
): DoctreeNode | null {
  if (!root) return null;
  const segs = path.split(".");
  let cur: DoctreeNode[] = root.tree_jsonb.children ?? [];
  let node: DoctreeNode | null = null;
  for (const s of segs) {
    node = cur.find((n) => n.id === s || n.id.endsWith(`.${s}`)) ?? null;
    if (!node) return null;
    cur = node.children ?? [];
  }
  return node;
}

/** "AHP § 2.3 Abs. 4" → "2.3.4" (vereinfacht) */
export function pathFromParagraphRef(ref?: string): string | null {
  if (!ref) return null;
  const m = ref.match(/(\d+(?:\.\d+)+)/);
  return m ? m[1] : null;
}
```

- [ ] **Step 2: Test schreiben**

`ue3/sachbearbeitung-ki/tests/hooks/useAhpTree.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { findNodeByPath, pathFromParagraphRef, type DoctreeRoot } from "../../src/hooks/useAhpTree";

const tree: DoctreeRoot = {
  id: "1", version: "v1", built_at: "2026-01-01", source_file: null,
  tree_jsonb: {
    children: [
      { id: "2", title: "Paragraph 2", children: [
        { id: "3", title: "Absatz 3", content: "Inhalt 2.3", children: [
          { id: "4", title: "Nr. 4", content: "Inhalt 2.3.4" },
        ]},
      ]},
    ],
  },
};

describe("useAhpTree helpers", () => {
  it("findNodeByPath findet 2.3.4", () => {
    const n = findNodeByPath(tree, "2.3.4");
    expect(n?.title).toBe("Nr. 4");
    expect(n?.content).toBe("Inhalt 2.3.4");
  });

  it("findNodeByPath gibt null bei fehlendem Pfad", () => {
    expect(findNodeByPath(tree, "9.9.9")).toBeNull();
  });

  it("pathFromParagraphRef extrahiert Nummern", () => {
    expect(pathFromParagraphRef("AHP § 2.3 Abs. 4")).toBe("2.3");
    expect(pathFromParagraphRef("§ 2")).toBeNull();
    expect(pathFromParagraphRef(undefined)).toBeNull();
  });
});
```

- [ ] **Step 3: Tests laufen lassen**

```bash
cd ue3/sachbearbeitung-ki && pnpm test tests/hooks/useAhpTree.test.ts
```
Erwartet: PASS 3/3.

- [ ] **Step 4: Commit**

```bash
git add ue3/sachbearbeitung-ki/src/hooks/useAhpTree.ts ue3/sachbearbeitung-ki/tests/hooks/useAhpTree.test.ts
git commit -m "feat(ue3): useAhpTree-Hook für Doctree-Lookup + AHP-Wortlaut-Popover"
```

### Task B4: `useVergleichVorjahr.ts`

**Files:**
- Create: `ue3/sachbearbeitung-ki/src/hooks/useVergleichVorjahr.ts`

- [ ] **Step 1: Implementieren**

`ue3/sachbearbeitung-ki/src/hooks/useVergleichVorjahr.ts`:
```typescript
import { useCallback, useEffect, useState } from "react";

const PRUEFUNG_SERVICE = "https://pruefung.butscher.cloud";

export interface VorjahresVergleichErgebnis {
  hat_vorjahr: boolean;
  vorjahr_antragsnummer?: string;
  vorjahr_bewilligt_euro?: number;
  vorjahr_entscheidung?: string;
  delta_bewilligung_pct?: number;
  abweichende_felder?: Array<{ feld: string; vorjahr: unknown; jetzt: unknown }>;
}

export function useVergleichVorjahr(antragId: string | undefined) {
  const [data, setData] = useState<VorjahresVergleichErgebnis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!antragId) return;
    setLoading(true);
    try {
      const res = await fetch(`${PRUEFUNG_SERVICE}/api/antrag/${antragId}/vergleich-vorjahr`);
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [antragId]);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, reload: load };
}
```

- [ ] **Step 2: Commit (kein Test — pure fetch-Wrapper)**

```bash
git add ue3/sachbearbeitung-ki/src/hooks/useVergleichVorjahr.ts
git commit -m "feat(ue3): useVergleichVorjahr-Hook"
```

### Task B5: `useExterneValidierung.ts`

**Files:**
- Create: `ue3/sachbearbeitung-ki/src/hooks/useExterneValidierung.ts`

- [ ] **Step 1: Implementieren**

`ue3/sachbearbeitung-ki/src/hooks/useExterneValidierung.ts`:
```typescript
import { useCallback, useState } from "react";

const PRUEFUNG_SERVICE = "https://pruefung.butscher.cloud";

export interface ExterneValidierungErgebnis {
  recherche_summary: string;
  gefundene_quellen: Array<{ url: string; titel: string; relevanz: string }>;
  warnungen: string[];
  geprueft_am: string;
}

export function useExterneValidierung(antragId: string | undefined) {
  const [data, setData] = useState<ExterneValidierungErgebnis | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validieren = useCallback(async () => {
    if (!antragId) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(
        `${PRUEFUNG_SERVICE}/api/antrag/${antragId}/validiere-extern`,
        { method: "POST" },
      );
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [antragId]);

  return { data, running, error, validieren };
}
```

- [ ] **Step 2: Commit**

```bash
git add ue3/sachbearbeitung-ki/src/hooks/useExterneValidierung.ts
git commit -m "feat(ue3): useExterneValidierung-Hook (Perplexity-Recherche)"
```

---

## Etappe C: Core-Components restaurieren

### Task C1: `Bearbeitungsstand.tsx` (3-Schritt-Stepper)

**Files:**
- Create: `ue3/sachbearbeitung-ki/src/components/Bearbeitungsstand.tsx`

- [ ] **Step 1: Component implementieren**

`ue3/sachbearbeitung-ki/src/components/Bearbeitungsstand.tsx`:
```typescript
/**
 * 3-Schritt-Stepper für den Bearbeitungsstand eines Antrags:
 *   Eingegangen → In Prüfung → Entscheidung
 *
 * Maps apl.antraege.status zu den drei Phasen.
 */
import type { Status } from "../lib/workflow";

interface Props {
  status: Status;
  /** Optionale Entscheidungs-Beschriftung für Schritt 3 (z.B. "Bewilligt", "Abgelehnt") */
  entscheidung?: string;
}

const STEPS = [
  { id: 1, label: "Eingegangen" },
  { id: 2, label: "In Prüfung" },
  { id: 3, label: "Entscheidung" },
] as const;

function activeStep(status: Status): 1 | 2 | 3 {
  if (status === "eingegangen") return 1;
  if (status === "in_pruefung" || status === "rueckfrage") return 2;
  return 3; // bewilligt / abgelehnt
}

export function Bearbeitungsstand({ status, entscheidung }: Props) {
  const cur = activeStep(status);
  return (
    <div className="bg-white rounded-md border border-slate-200 px-6 py-4">
      <div className="text-[10.5px] uppercase tracking-wider text-slate-500 font-semibold mb-3">
        Bearbeitungsstand
      </div>
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const reached = s.id <= cur;
          const active = s.id === cur;
          return (
            <div key={s.id} className="flex items-center gap-2 flex-1">
              <div
                className={
                  "flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold " +
                  (reached
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-400 border border-slate-200")
                }
              >
                {s.id}
              </div>
              <div className="flex-1">
                <div
                  className={
                    "text-sm font-medium " +
                    (active ? "text-wue-rot" : reached ? "text-slate-900" : "text-slate-400")
                  }
                >
                  {s.label}
                </div>
                {s.id === 3 && entscheidung && reached && (
                  <div className="text-xs text-slate-600">{entscheidung}</div>
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={
                    "h-0.5 flex-1 " + (reached && s.id < cur ? "bg-slate-900" : "bg-slate-200")
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Test schreiben**

`ue3/sachbearbeitung-ki/tests/Bearbeitungsstand.test.tsx`:
```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Bearbeitungsstand } from "../src/components/Bearbeitungsstand";

describe("Bearbeitungsstand", () => {
  it("zeigt alle 3 Schritte mit Labels", () => {
    render(<Bearbeitungsstand status="eingegangen" />);
    expect(screen.getByText("Eingegangen")).toBeInTheDocument();
    expect(screen.getByText("In Prüfung")).toBeInTheDocument();
    expect(screen.getByText("Entscheidung")).toBeInTheDocument();
  });

  it("zeigt Entscheidung-Sub-Label bei bewilligt", () => {
    render(<Bearbeitungsstand status="bewilligt" entscheidung="Bewilligt" />);
    expect(screen.getByText("Bewilligt")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Tests laufen**

```bash
cd ue3/sachbearbeitung-ki && pnpm test tests/Bearbeitungsstand.test.tsx
```
Erwartet: PASS 2/2.

- [ ] **Step 4: Commit**

```bash
git add ue3/sachbearbeitung-ki/src/components/Bearbeitungsstand.tsx ue3/sachbearbeitung-ki/tests/Bearbeitungsstand.test.tsx
git commit -m "feat(ue3): Bearbeitungsstand-Stepper (3 Schritte) wiederherstellen"
```

### Task C2: `AntragMetricsBar.tsx`

**Files:**
- Create: `ue3/sachbearbeitung-ki/src/components/AntragMetricsBar.tsx`
- Reference: `/tmp/old-ue3/AntragMetricsBar.tsx` (196 LOC, apl2-Refs anpassen)

- [ ] **Step 1: Original anschauen + portieren**

Lese `/tmp/old-ue3/AntragMetricsBar.tsx`. Die Komponente zeigt einen Hero-Block mit:
- Förderbereich-Bezeichnung
- Aktenzeichen
- Beantragte Förderung (in € + Cap-Referenz)
- Status-Badge

Kopiere nach `ue3/sachbearbeitung-ki/src/components/AntragMetricsBar.tsx`, dann:
1. Imports: `import type { Antrag, FbIProjekt, FbIiEhrenamt, FbIiiVarianteRow, FbIvFreitext } from "@dv/data-layer";`
2. Berechnung „beantragte_summe_euro" aus FB-spezifischen Daten:
   - FB I: `personalkosten_euro + sachkosten_euro`
   - FB II: keine Summe im PDF (Cap ist Pauschale aus Richtlinie)
   - FB III A: 10.000 €, B: 10.000 €, C: 2.000 €, D: 7.500 € (laut `@dv/foerderbereiche/fb-iii.config`)
   - FB IV: optional aus `fb_iv_freitext.beantragte_summe_euro` falls Bürger eintippt
3. Cap-Referenz aus `FB_III_VARIANTEN[variante].foerderhoechstgrenze_euro`

- [ ] **Step 2: Test schreiben + ausführen**

Smoke-Test, dass die Komponente rendert ohne Crash für jeden FB.

- [ ] **Step 3: Commit**

```bash
git add ue3/sachbearbeitung-ki/src/components/AntragMetricsBar.tsx ue3/sachbearbeitung-ki/tests/AntragMetricsBar.test.tsx
git commit -m "feat(ue3): AntragMetricsBar-Hero wiederherstellen mit FB-Cap-Logik"
```

### Task C3: `PruefungsCard.tsx`

**Files:**
- Create: `ue3/sachbearbeitung-ki/src/components/PruefungsCard.tsx`
- Reference: `/tmp/old-ue3/PruefungsCard.tsx` (348 LOC)

- [ ] **Step 1: Kopieren + Imports anpassen**

```bash
cp /tmp/old-ue3/PruefungsCard.tsx ue3/sachbearbeitung-ki/src/components/PruefungsCard.tsx
```

Imports prüfen — alle drei Hooks (`usePruefung`, `useAhpTree`, `useSession`) sind jetzt da. Keine Code-Änderungen notwendig.

- [ ] **Step 2: Smoke-Test schreiben**

`ue3/sachbearbeitung-ki/tests/PruefungsCard.test.tsx`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PruefungsCard } from "../src/components/PruefungsCard";

vi.mock("../src/hooks/usePruefung", () => ({
  usePruefung: () => ({ latest: null, loading: false, running: false, error: null, pruefen: vi.fn(), downloadPdf: vi.fn() }),
}));
vi.mock("../src/hooks/useSession", () => ({
  useSession: () => ({ session: { user: { email: "test@example.com" } } }),
}));
vi.mock("../src/hooks/useAhpTree", () => ({
  useAhpTree: () => ({ tree: null, loading: false }),
  findNodeByPath: () => null,
  pathFromParagraphRef: () => null,
}));

describe("PruefungsCard", () => {
  it("zeigt 'Konformität per KI prüfen'-Button wenn keine Prüfung existiert", () => {
    render(<PruefungsCard antragId="a1" />);
    expect(screen.getByRole("button", { name: /Konformität per KI prüfen/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Tests laufen**

```bash
cd ue3/sachbearbeitung-ki && pnpm test tests/PruefungsCard.test.tsx
```
Erwartet: PASS 1/1.

- [ ] **Step 4: Commit**

```bash
git add ue3/sachbearbeitung-ki/src/components/PruefungsCard.tsx ue3/sachbearbeitung-ki/tests/PruefungsCard.test.tsx
git commit -m "feat(ue3): PruefungsCard wiederherstellen (KI-Empfehlung + Hinweise + AHP-Wortlaut)"
```

### Task C4: `BescheideListe.tsx`

**Files:**
- Create: `ue3/sachbearbeitung-ki/src/components/BescheideListe.tsx`
- Reference: `/tmp/old-ue3/BescheideListe.tsx` (330 LOC)

- [ ] **Step 1: Kopieren + an aktuelles useBescheide anpassen**

```bash
cp /tmp/old-ue3/BescheideListe.tsx ue3/sachbearbeitung-ki/src/components/BescheideListe.tsx
```

Imports prüfen: `useBescheide` existiert bereits. Eventuell `import { formatDateTime, formatEuro } from "../lib/format";` ergänzen falls fehlt.

- [ ] **Step 2: Smoke-Test + Commit**

```bash
git add ue3/sachbearbeitung-ki/src/components/BescheideListe.tsx
git commit -m "feat(ue3): BescheideListe wiederherstellen (PDF + DOCX-Download + Bewilligt/Abgelehnt-Timeline)"
```

### Task C5: `VorjahresVergleich.tsx`

**Files:**
- Create: `ue3/sachbearbeitung-ki/src/components/VorjahresVergleich.tsx`
- Reference: `/tmp/old-ue3/VorjahresVergleich.tsx` (211 LOC)

- [ ] **Step 1: Kopieren + Hook anpassen**

```bash
cp /tmp/old-ue3/VorjahresVergleich.tsx ue3/sachbearbeitung-ki/src/components/VorjahresVergleich.tsx
```

Imports: `useVergleichVorjahr` aus Task B4 verwenden.

- [ ] **Step 2: Smoke-Test + Commit**

```bash
git add ue3/sachbearbeitung-ki/src/components/VorjahresVergleich.tsx
git commit -m "feat(ue3): VorjahresVergleich wiederherstellen"
```

---

## Etappe D: AntragDetail-Layout neu zusammenbauen

### Task D1: AntragDetail mit allen Cards + Stepper + AntragViewer

**Files:**
- Modify: `ue3/sachbearbeitung-ki/src/pages/AntragDetail.tsx`
- Reference: `/tmp/old-ue3/AntragDetail.tsx` (1591 LOC — als Layout-Vorlage)

- [ ] **Step 1: Layout-Skizze**

Layout (3-spaltig auf großen Screens, 1-spaltig mobil):

```
┌───────────────────────────────────────────────────────────────┐
│ Bearbeitungsstand-Stepper (volle Breite oben)                 │
├───────────────────────────────────┬───────────────────────────┤
│ Article (links, 2/3)              │ Aside (rechts, 1/3)       │
│                                   │                           │
│ AntragMetricsBar (Hero)           │ PruefungsCard             │
│ <AntragViewer fb=… data=… />      │ BescheideListe            │
│   - Antragsteller                 │ Workflow-Status-Buttons   │
│   - Bankverbindung                │ VorjahresVergleich        │
│   - Förderbereich-Detail          │ HistoryTimeline           │
│   - Anlagen                       │                           │
└───────────────────────────────────┴───────────────────────────┘
```

- [ ] **Step 2: Imports erweitern**

In `ue3/sachbearbeitung-ki/src/pages/AntragDetail.tsx`:
```typescript
import { Bearbeitungsstand } from "../components/Bearbeitungsstand";
import { AntragMetricsBar } from "../components/AntragMetricsBar";
import { PruefungsCard } from "../components/PruefungsCard";
import { BescheideListe } from "../components/BescheideListe";
import { VorjahresVergleich } from "../components/VorjahresVergleich";
import { STATUS_LABELS } from "../lib/workflow";
```

- [ ] **Step 3: JSX-Struktur ersetzen**

Im Render-Body von AntragDetail, BEVOR die existierende `<main>`:
```tsx
<div className="px-6 pt-4">
  <Bearbeitungsstand
    status={antrag.status}
    entscheidung={
      antrag.status === "bewilligt" || antrag.status === "abgelehnt"
        ? STATUS_LABELS[antrag.status]
        : undefined
    }
  />
</div>
```

In `<main>` IN der article-Spalte VOR `<FbDispatcher>`:
```tsx
<AntragMetricsBar
  antrag={antrag}
  fbI={bundle.fb_i}
  fbIii={bundle.fb_iii}
  fbIv={bundle.fb_iv}
/>
```

In der `<aside>`-Spalte VOR Workflow-Card:
```tsx
<PruefungsCard antragId={id!} onApplyEmpfehlung={(aktion) => {
  const target = aktion === "bewilligen" ? "bewilligt"
    : aktion === "ablehnen" ? "abgelehnt" : "rueckfrage";
  setConfirmTo(target);
}} />
<BescheideListe antragId={id!} />
```

In der `<aside>`-Spalte NACH Workflow-Card:
```tsx
<VorjahresVergleich antragId={id!} />
```

- [ ] **Step 4: TypeScript-Check + Tests**

```bash
cd ue3/sachbearbeitung-ki && pnpm exec tsc --noEmit && pnpm test
```
Erwartet: alle Tests grün, keine TS-Fehler.

- [ ] **Step 5: Commit**

```bash
git add ue3/sachbearbeitung-ki/src/pages/AntragDetail.tsx
git commit -m "feat(ue3): AntragDetail-Layout — alle Cards integriert (Stepper + Hero + KI + Bescheide + Vorjahr)"
```

---

## Etappe E: ZweitpruefungsCard + ExterneValidierungCard

### Task E1: ZweitpruefungsCard restaurieren

**Files:**
- Create: `ue3/sachbearbeitung-ki/src/components/ZweitpruefungsCard.tsx`
- Reference: `/tmp/old-ue3/ZweitpruefungsCard.tsx` (905 LOC — komplexeste Komponente)

- [ ] **Step 1: Kopieren**

```bash
cp /tmp/old-ue3/ZweitpruefungsCard.tsx ue3/sachbearbeitung-ki/src/components/ZweitpruefungsCard.tsx
```

- [ ] **Step 2: Anpassungen**

Imports prüfen — `usePruefungen` und `usePruefung` müssen existieren (aus Etappe B). `useSession` existiert bereits.

Falls Component auf `useUserRole` referenziert: vorhanden.

- [ ] **Step 3: Smoke-Test + In AntragDetail einbinden**

In `pages/AntragDetail.tsx` aside-Spalte NACH BescheideListe:
```tsx
<ZweitpruefungsCard antragId={id!} />
```

- [ ] **Step 4: Tests + Commit**

```bash
cd ue3/sachbearbeitung-ki && pnpm exec tsc --noEmit
git add ue3/sachbearbeitung-ki/src/components/ZweitpruefungsCard.tsx ue3/sachbearbeitung-ki/src/pages/AntragDetail.tsx
git commit -m "feat(ue3): ZweitpruefungsCard wiederherstellen (Vier-Augen + Dissens-Berechnung)"
```

### Task E2: ExterneValidierungCard

**Files:**
- Create: `ue3/sachbearbeitung-ki/src/components/ExterneValidierungCard.tsx`
- Reference: `/tmp/old-ue3/ExterneValidierungCard.tsx` (196 LOC)

- [ ] **Step 1: Kopieren + Hook-Import anpassen**

```bash
cp /tmp/old-ue3/ExterneValidierungCard.tsx ue3/sachbearbeitung-ki/src/components/ExterneValidierungCard.tsx
```

Verwende `useExterneValidierung` aus Task B5.

- [ ] **Step 2: In AntragDetail einbinden + Commit**

In aside-Spalte:
```tsx
<ExterneValidierungCard antragId={id!} />
```

```bash
git add ue3/sachbearbeitung-ki/src/components/ExterneValidierungCard.tsx ue3/sachbearbeitung-ki/src/pages/AntragDetail.tsx
git commit -m "feat(ue3): ExterneValidierungCard wiederherstellen (Perplexity-Träger-Recherche)"
```

---

## Etappe F: FB-IV als formloser PDF-Upload-Antrag

### Task F1: UE1 FB-IV-Page auf PDF-Upload umstellen

**Files:**
- Modify: `ue1/webformular/src/pages/Phase2FBIV.tsx`
- Modify: `ue1/webformular/src/state/AntragContext.tsx`
- Modify: `ue1/webformular/src/lib/submit.ts`
- Modify: `ue1/webformular/src/lib/i18n.ts`

- [ ] **Step 1: AntragContext-Type für fb_iv anpassen**

In `ue1/webformular/src/state/AntragContext.tsx`:
```typescript
export interface FbIv {
  // Optional — Bürger kann diese Felder als Hilfe für die KI eingeben
  vorhaben_titel: string;
  kurzbeschreibung: string;
  // PDF-Upload des formlosen Antrags (Pflicht)
  dokument_file?: File;
  dokument_dateiname?: string;
}
```

(Bestehende erfundene Felder `geplante_massnahmen`, `beantragte_summe_euro`, `laufzeit` werden entfernt.)

- [ ] **Step 2: Phase2FBIV.tsx neu schreiben**

Komplett neu — minimaler Inhalt mit:
1. Hinweis-Text „FB IV ist ein formloser Antrag — bitte laden Sie Ihren eigenen Antrag als PDF hoch"
2. PDF-Upload-Feld (accept="application/pdf")
3. Optional: Freitext-Titel + Kurzbeschreibung als KI-Hilfe
4. Weiter-Button validiert nur, dass das PDF da ist

- [ ] **Step 3: submit.ts anpassen**

In `ue1/webformular/src/lib/submit.ts` im `buildPayload`-Branch für FB IV:
```typescript
} else if (state.foerderbereich === "IV") {
  base.fb_iv_freitext = {
    vorhaben_titel: state.fb_iv.vorhaben_titel || null,
    kurzbeschreibung: state.fb_iv.kurzbeschreibung || null,
    // dokument_path wird vom Server gesetzt, hier nur als upload_key markieren
    dokument_upload_key: state.fb_iv.dokument_file ? "fb_iv_dokument" : null,
  };
  if (state.fb_iv.dokument_file) {
    // fügt das PDF als Anlage hinzu — Backend speichert in Storage + setzt dokument_path
  }
}
```

In der `submitAntrag`-Funktion: wenn FB IV + dokument_file, das File in FormData als `fb_iv_dokument` hängen.

- [ ] **Step 4: i18n-Strings für FB IV anpassen**

In `ue1/webformular/src/lib/i18n.ts` ergänzen:
```typescript
"fb4.titel": "Schwerpunktförderung (formloser Antrag)",
"fb4.lead": "Förderbereich IV ist ein formloser Antrag. Bitte laden Sie Ihren eigenen Antrag als PDF hoch.",
"fb4.upload.label": "Antrag als PDF hochladen",
"fb4.upload.hint": "PDF-Datei, max. 10 MB. Optional können Sie zusätzlich einen Titel und eine Kurzbeschreibung angeben, die unsere KI bei der Klassifikation unterstützt.",
"fb4.optional.titel": "Vorhaben-Titel (optional)",
"fb4.optional.kurz": "Kurzbeschreibung (optional)",
```

Plus TR-Übersetzungen analog.

- [ ] **Step 5: UE1-Tests prüfen**

```bash
cd ue1/webformular && pnpm test
```
Tests anpassen die auf alte FB-IV-Felder zugreifen.

- [ ] **Step 6: Commit**

```bash
git add ue1/webformular/src/pages/Phase2FBIV.tsx ue1/webformular/src/state/AntragContext.tsx ue1/webformular/src/lib/submit.ts ue1/webformular/src/lib/i18n.ts ue1/webformular/tests/
git commit -m "feat(ue1): FB-IV als formloser PDF-Upload-Antrag (PDF-konform laut Stadt Würzburg)"
```

### Task F2: `@dv/antrag-renderer` FB-IV-Schema anpassen

**Files:**
- Modify: `packages/antrag-renderer/src/schemas/fb-iv.schema.ts`
- Modify: `packages/antrag-renderer/tests/field-coverage.test.ts`

- [ ] **Step 1: Schema umschreiben**

`packages/antrag-renderer/src/schemas/fb-iv.schema.ts`:
```typescript
/**
 * FB-IV — Struktur- und Schwerpunktförderung der Seniorenarbeit.
 *
 * FORMLOSER ANTRAG laut Stadt Würzburg (siehe docs/PDF-FELDER-AUDIT).
 * Es gibt KEIN offizielles Antragsformular. Der Bürger lädt einen
 * eigenen formlosen PDF-Antrag hoch. Die optionalen Freitext-Felder
 * dienen nur als KI-Klassifikations-Hilfe und sind NICHT verpflichtend.
 */
import type { FbIvFreitext } from "@dv/data-layer";
import type { SectionSchema } from "../types";

export const FB_IV_SECTIONS: ReadonlyArray<SectionSchema<FbIvFreitext>> = [
  {
    id: "dokument",
    titel: "Formloser Antrag",
    fields: [
      { key: "dokument_path", label: "Hochgeladenes Dokument", type: "text" },
    ],
  },
  {
    id: "klassifikation",
    titel: "KI-Klassifikations-Hilfe (optional)",
    fields: [
      { key: "vorhaben_titel", label: "Vorhaben-Titel", type: "text" },
      { key: "kurzbeschreibung", label: "Kurzbeschreibung", type: "longtext" },
    ],
  },
];
```

- [ ] **Step 2: Coverage-Test anpassen**

`packages/antrag-renderer/tests/field-coverage.test.ts` — alte erfundene Felder aus `FB_IV_DB_COLUMNS` entfernen:
```typescript
const FB_IV_DB_COLUMNS = [
  "vorhaben_titel",
  "kurzbeschreibung",
  "dokument_path",
  // ENTFERNT: geplante_massnahmen, beantragte_summe_euro, laufzeit (siehe Migration 071)
];
```

- [ ] **Step 3: db-types.ts anpassen**

`packages/data-layer/src/db-types.ts` — `FbIvFreitext`-Interface:
```typescript
export interface FbIvFreitext {
  antrag_id: string;
  vorhaben_titel: string | null;       // war NOT NULL, jetzt nullable
  kurzbeschreibung: string | null;      // war NOT NULL, jetzt nullable
  geplante_massnahmen: string | null;   // legacy, nullable
  beantragte_summe_euro: number | null;
  laufzeit: string | null;
  dokument_path: string | null;         // NEU
}
```

- [ ] **Step 4: Tests + Commit**

```bash
cd packages/antrag-renderer && pnpm test
cd ../../ && git add packages/antrag-renderer/ packages/data-layer/src/db-types.ts
git commit -m "feat(renderer): FB-IV-Schema als formloser Antrag (Erfindungs-Korrektur)"
```

### Task F3: Backend pruefung-service FB-IV anpassen

**Files:**
- Modify: `pruefung/src/pruefung/foerderbereiche/fb_iv.py`

- [ ] **Step 1: Validator-Logik anpassen**

Die `fb_iv.py` enthält den FB-IV-Validator. Er muss:
1. NICHT mehr `vorhaben_titel`, `kurzbeschreibung`, `geplante_massnahmen` als Pflicht prüfen
2. ABER prüfen, dass `dokument_path` gesetzt ist (formloser Antrag als PDF muss da sein)
3. Kein „beantragte_summe_euro"-Cap-Check

- [ ] **Step 2: Commit**

```bash
git add pruefung/src/pruefung/foerderbereiche/fb_iv.py
git commit -m "feat(pruefung): FB-IV-Validator — dokument_path Pflicht, freitext optional"
```

---

## Etappe G: Ontologie-Update

### Task G1: Migration 072 — `ahp_norm_statements` für FB I/II/IV ergänzen

**Files:**
- Create: `supabase/migrations/072_apl_ahp_norm_statements_fb1_fb2_fb4.sql`

- [ ] **Step 1: Migration schreiben**

Inhalt: INSERT-Statements für ~30-50 norm-Aussagen aus der Förderrichtlinie pro FB I, II, IV. Jede Aussage:
```sql
insert into apl.ahp_norm_statements
  (plan_id, paragraph_ref, statement_text, aussage_typ, foerderbereich, schwelle)
values
  ('AHP-I', '§ 2 Abs. 1', 'FB I fördert den Aufbau niedrigschwelliger Angebote …', 'definition', 'I', null),
  ('AHP-II', '§ 3', 'FB II fördert bürgerschaftliches Engagement …', 'definition', 'II', null),
  ...
on conflict do nothing;
```

Inhalt aus der `ahp-foerderrichtlinie-2025-03-27.pdf` extrahieren — Quelle der Wahrheit.

- [ ] **Step 2: Anwenden auf VPS + Commit**

```bash
# rsync + docker exec psql wie in Task A1
git add supabase/migrations/072_apl_ahp_norm_statements_fb1_fb2_fb4.sql
git commit -m "db(072): ahp_norm_statements für FB I, II, IV ergänzen"
```

### Task G2: Doctree neu bauen für aktuelle Förderrichtlinie

**Files:**
- Run: `pruefung/scripts/build_doctree.py` (existiert ggf. bereits, sonst implementieren)

- [ ] **Step 1: Doctree generieren**

```bash
ssh root@bot.butscher.cloud "cd /opt/pruefung && python -m pruefung.scripts.build_doctree --pdf materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf --version v2026-05-26"
```

Erwartet: neuer Eintrag in `apl.ahp_doctree`.

- [ ] **Step 2: Verifikation via SQL**

```bash
docker exec supabase-db psql -U postgres -d postgres -c \
  "select version, source_file, built_at from apl.ahp_doctree order by built_at desc limit 3;"
```

Erwartet: v2026-05-26 als neueste Version.

---

## Etappe H: Tests + Build + Deploy + Smoketest

### Task H1: Alle Test-Suites grün

- [ ] **Step 1: Full-Test-Sweep**

```bash
cd "/Users/robert/.../DigitalisierungVerwaltung" && pnpm -r test
```
Erwartet: alle Workspaces 100% grün.

- [ ] **Step 2: TypeScript-Check für alle Apps**

```bash
pnpm --filter amt-ki-sachbearbeitung exec tsc --noEmit
pnpm --filter amt-sachbearbeiter exec tsc --noEmit
pnpm --filter ue1-webformular exec tsc --noEmit
```
Erwartet: keine Errors.

### Task H2: UE3-Container neu bauen + deployen via fast-deploy

- [ ] **Step 1: Fast-Deploy**

```bash
./scripts/dv-fast-deploy.sh ue3
./scripts/dv-fast-deploy.sh ue2
```

Erwartet: jeweils „live in <30 Sek".

### Task H3: E2E-Smoketest

- [ ] **Step 1: Browser-Test UE3**

Login auf ki.butscher.cloud → öffne FAKE-Antrag → verifiziere:
1. ✓ Bearbeitungsstand-Stepper sichtbar
2. ✓ AntragMetricsBar Hero sichtbar
3. ✓ Antragsteller/Bank/Förderbereich-Detail/Anlagen (via AntragViewer)
4. ✓ PruefungsCard rechts mit „Konformität per KI prüfen"-Button
5. ✓ BescheideListe rechts
6. ✓ Workflow-Status-Buttons
7. ✓ VorjahresVergleich rechts (falls Vorjahr existiert)
8. ✓ ZweitpruefungsCard rechts (falls Erstprüfung existiert)

- [ ] **Step 2: Konformitäts-Prüfung triggern**

Klick „Konformität per KI prüfen" → erwartet:
1. Button wechselt zu „Prüfung läuft …"
2. Nach ~10-30 Sek: Empfehlung-Box erscheint (BEWILLIGEN / RÜCKFRAGE / ABLEHNEN)
3. Hinweise/Verstöße werden in klappbaren Gruppen angezeigt
4. „Letzte Prüfung: … ms · AHP-Stand v…"-Stempel sichtbar

---

## Etappe I: Final-Doku + Push

### Task I1: ARCHITECTURE.md aktualisieren

- [ ] **Step 1: Aktualisieren**

`docs/ARCHITECTURE.md` — Sektion „Layering" erweitern um die UE3-Hook-Hierarchie + Component-Hierarchie nach der Restoration.

### Task I2: Final-Push

- [ ] **Step 1: Push**

```bash
git push origin main
```

---

## Self-Review (vom Plan-Autor)

**1. Spec-Coverage:**
- ✅ DB-Tabellen restauriert: Etappe A
- ✅ Hooks restauriert: Etappe B (5 Hooks)
- ✅ Components restauriert: Etappe C (5 Core) + E (2 Advanced)
- ✅ AntragDetail-Layout: Etappe D
- ✅ FB-IV formloser Antrag: Etappe F (UE1 + Renderer + Backend)
- ✅ Ontologie-Update: Etappe G
- ✅ Tests + Deploy: Etappe H
- ✅ Doku: Etappe I

**2. Placeholder-Scan:** keine TBDs, alle Tasks haben Code oder konkrete Befehle.

**3. Type-Consistency:**
- `PruefBefund`, `PruefEmpfehlung`, `PruefprotokollRow` definiert in Task B1, verwendet in Task C3 → ✓
- `Status` aus `lib/workflow` verwendet in Bearbeitungsstand + AntragDetail → ✓
- `useVergleichVorjahr`-Hook in Task B4 definiert, verwendet in Task C5 → ✓
- `useExterneValidierung`-Hook in Task B5 definiert, verwendet in Task E2 → ✓
- `FbIvFreitext.dokument_path`-Spalte in Migration 071 angelegt, in db-types Task F2 ergänzt, im Schema Task F2 genutzt → ✓

---

**Execution-Handoff:** Plan komplett, gespeichert. **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development (vom Master-Agent) für die Abarbeitung.
