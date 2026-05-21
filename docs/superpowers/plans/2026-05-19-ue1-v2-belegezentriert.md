# UE1-v2 Belegezentriertes Stepper-Formular Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `ue1/webformular/` zu einem Stepper-basierten, belegezentrierten Online-Formular mit Live-Validation, das sich „spürbar besser als PDF" anfühlt; UE2 wird auf die neue View umgestellt; DB bekommt Belegpositionen, Wochenplan und Hash-Dedupe.

**Architecture:** Bestehender Vite + Vanilla-TS-Stack bleibt erhalten, mit Tailwind v4 hinzugefügt. State-Management via Proxy-basierten Signals (~20 LOC). Datenmodell wird additiv um `belegposition` + `oeffnungszeit` erweitert, die zwei Summen-Spalten auf `antraege` werden durch eine berechnete View ersetzt. UE2-Detail-Page bekommt eine Belegpositionen-Liste und einen Wochenplan-Block.

**Tech Stack:** Vite 6, TypeScript 5, Tailwind 4 (neu), Vitest 2, Supabase (Postgres + Storage + Edge Functions), GitHub Pages.

**Vorgänger-Spec:** `docs/superpowers/specs/2026-05-19-ue1-v2-belegezentriert-design.md`

**Repo-Variable:** `REPO="/Users/robert/Library/CloudStorage/OneDrive-Persönlich/Vorlesungen/Übergreifend/Fallstudien/DigitalisierungVerwaltung"`

**VPS:** `ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud`

---

## Phase 0 — Vorbereitung

### Task 0.1: VPS-Backup vor destructive Migration 016

**Files:** keine — Bash-Befehl auf VPS.

- [ ] **Step 1: Backup-Verzeichnis anlegen + pg_dumpall**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "
  TS=\$(date +%Y-%m-%d-%H%M)
  mkdir -p /root/backups/\${TS}-pre-ue1v2
  docker exec supabase-db pg_dumpall -U postgres > /root/backups/\${TS}-pre-ue1v2/full-dump.sql
  ls -lh /root/backups/\${TS}-pre-ue1v2/
"
```
Expected: `full-dump.sql` mit ca. 3 GB.

- [ ] **Step 2: Robert OK einholen, bevor du mit Migration 016 startest** (Akzeptanzkriterium aus der UE2-Spec übernommen)

### Task 0.2: Lokaler Repo-State sauber

- [ ] **Step 1: Git-Status prüfen**

Run:
```bash
cd "$REPO" && git status --short && git rev-list --left-right --count origin/main...HEAD
```
Expected: 0 ahead 0 behind; nur erlaubte untracked Files (`.claude/`, `ue1/folien/*.pptx`).

---

## Phase 1 — DB-Migrationen

### Task 1.1: Migration 015 — Belegposition + Wochenplan

**Files:**
- Create: `supabase/migrations/015_belegposition_oeffnungszeit.sql`

- [ ] **Step 1: Migration schreiben**

`supabase/migrations/015_belegposition_oeffnungszeit.sql`:
```sql
-- 015_belegposition_oeffnungszeit.sql
-- Additive Migration für UE1-v2 (belegezentriertes Stepper-Formular).
-- - apl2.belegposition: einzelne Belegzeilen mit Betrag + Bezeichnung + ggf. Anlage-Referenz
-- - apl2.oeffnungszeit: Wochenplan-Tabelle (Anlage 1 des AHP-PDF strukturiert)

create table apl2.belegposition (
  id              uuid primary key default gen_random_uuid(),
  antrag_id       uuid not null references apl2.antraege(id) on delete cascade,
  belegtyp        text not null check (belegtyp in ('betriebskosten','personalkosten','miete')),
  bezeichnung     text not null,
  betrag_euro     numeric(12,2) not null check (betrag_euro >= 0),
  anlage_id       uuid references apl2.anlagen(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index idx_belegposition_antrag on apl2.belegposition(antrag_id);
create index idx_belegposition_belegtyp on apl2.belegposition(antrag_id, belegtyp);

create table apl2.oeffnungszeit (
  antrag_id       uuid not null references apl2.antraege(id) on delete cascade,
  wochentag       text not null check (wochentag in ('mo','di','mi','do','fr','sa','so')),
  oeffnungszeit   text,
  angebot         text,
  primary key (antrag_id, wochentag)
);

-- RLS
alter table apl2.belegposition enable row level security;
create policy "sachbearbeiter_select_belegposition" on apl2.belegposition
  for select to authenticated using (apl2.current_user_role() is not null);

alter table apl2.oeffnungszeit enable row level security;
create policy "sachbearbeiter_select_oeffnungszeit" on apl2.oeffnungszeit
  for select to authenticated using (apl2.current_user_role() is not null);

-- Grants: service_role schreibt (Edge Function), authenticated liest (Sachbearbeiter)
grant insert, select on apl2.belegposition to service_role;
grant insert, select on apl2.oeffnungszeit to service_role;
grant select on apl2.belegposition to authenticated;
grant select on apl2.oeffnungszeit to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Migration auf VPS anwenden**

```bash
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/015_belegposition_oeffnungszeit.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 < /tmp/015_belegposition_oeffnungszeit.sql"
```
Expected: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `CREATE POLICY`, `GRANT`, `NOTIFY` ohne Fehler.

- [ ] **Step 3: Schema verifizieren**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c '\\d apl2.belegposition' && docker exec supabase-db psql -U postgres -c '\\d apl2.oeffnungszeit'"
```
Expected: Beide Tabellen mit den erwarteten Spalten + Constraints sichtbar.

- [ ] **Step 4: Commit**

```bash
cd "$REPO" && git add supabase/migrations/015_belegposition_oeffnungszeit.sql && git commit -m "feat(supabase): Migration 015 — Belegposition + Wochenplan für UE1-v2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 1.2: Migration 016 — View + Drop Columns

**Files:**
- Create: `supabase/migrations/016_summen_view_drop_columns.sql`

**⚠ Destructive Migration. Backup aus Task 0.1 muss vorhanden sein. Erst nach UE2-Anpassung (Phase 2) auf VPS anwenden.**

- [ ] **Step 1: Migration schreiben**

`supabase/migrations/016_summen_view_drop_columns.sql`:
```sql
-- 016_summen_view_drop_columns.sql
-- Destructive Migration: ersetzt die starren Summen-Spalten auf antraege
-- durch eine View, die live aus belegposition aggregiert.
--
-- Schritte:
-- 1. Bestand sichern in *_legacy-Spalten (rollback-fähig)
-- 2. Belegpositionen für Bestandsdaten generieren (1 Sammel-Position pro Belegtyp)
-- 3. Drop Spalten
-- 4. View ersetzen

-- Schritt 1: Legacy sichern
alter table apl2.antraege add column if not exists betriebskosten_vorjahr_euro_legacy numeric(12,2);
alter table apl2.antraege add column if not exists personalkosten_vorjahr_euro_legacy numeric(12,2);
alter table apl2.antraege add column if not exists monatliche_miete_euro_legacy numeric(12,2);

update apl2.antraege set betriebskosten_vorjahr_euro_legacy = betriebskosten_vorjahr_euro;
update apl2.antraege set personalkosten_vorjahr_euro_legacy = personalkosten_vorjahr_euro;
update apl2.antraege set monatliche_miete_euro_legacy = monatliche_miete_euro;

-- Schritt 2: Bestandsdaten in Belegpositionen migrieren
insert into apl2.belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro)
select id, 'betriebskosten', 'Legacy-Summe aus PDF-Import (Migration 016)', betriebskosten_vorjahr_euro
from apl2.antraege
where betriebskosten_vorjahr_euro > 0;

insert into apl2.belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro)
select id, 'personalkosten', 'Legacy-Summe aus PDF-Import (Migration 016)', personalkosten_vorjahr_euro
from apl2.antraege
where personalkosten_vorjahr_euro > 0;

insert into apl2.belegposition (antrag_id, belegtyp, bezeichnung, betrag_euro)
select id, 'miete', 'Legacy-Monatsmiete × 12 (Migration 016)', monatliche_miete_euro * 12
from apl2.antraege
where monatliche_miete_euro > 0;

-- Schritt 3: Drop Spalten
alter table apl2.antraege drop column betriebskosten_vorjahr_euro;
alter table apl2.antraege drop column personalkosten_vorjahr_euro;
alter table apl2.antraege drop column monatliche_miete_euro;

-- Schritt 4: View
create or replace view apl2.antrag_mit_summen as
select
  a.*,
  coalesce((select sum(betrag_euro) from apl2.belegposition
            where antrag_id = a.id and belegtyp = 'betriebskosten'), 0) as betriebskosten_vorjahr_euro,
  coalesce((select sum(betrag_euro) from apl2.belegposition
            where antrag_id = a.id and belegtyp = 'personalkosten'), 0) as personalkosten_vorjahr_euro,
  coalesce((select sum(betrag_euro) from apl2.belegposition
            where antrag_id = a.id and belegtyp = 'miete'), 0) as miete_jahr_euro
from apl2.antraege a;

grant select on apl2.antrag_mit_summen to authenticated, anon, service_role;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: ⏸ Nicht jetzt anwenden** — wartet auf Phase 2 (UE2-Anpassung).

- [ ] **Step 3: Commit**

```bash
cd "$REPO" && git add supabase/migrations/016_summen_view_drop_columns.sql && git commit -m "feat(supabase): Migration 016 — Summen-View + Drop alte Spalten (destructive)

Wird auf VPS erst nach UE2-Anpassung (Phase 2) angewendet, sonst bricht
die Sachbearbeiter-App, weil sie auf nicht-existente Spalten zugreift.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 1.3: Migration 017 — Hash-Dedupe

**Files:**
- Create: `supabase/migrations/017_anlagen_file_hash.sql`

- [ ] **Step 1: Migration schreiben**

`supabase/migrations/017_anlagen_file_hash.sql`:
```sql
-- 017_anlagen_file_hash.sql
-- Hash-Dedupe für Anlagen: SHA-256 des File-Inhalts ermöglicht es der
-- Edge Function submit-antrag, identische Files nur einmal zu speichern.

alter table apl2.anlagen add column if not exists file_hash text;
create index if not exists idx_anlagen_hash on apl2.anlagen(file_hash);

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Auf VPS anwenden**

```bash
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/017_anlagen_file_hash.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 < /tmp/017_anlagen_file_hash.sql"
```
Expected: `ALTER TABLE`, `CREATE INDEX`, `NOTIFY`.

- [ ] **Step 3: Commit**

```bash
cd "$REPO" && git add supabase/migrations/017_anlagen_file_hash.sql && git commit -m "feat(supabase): Migration 017 — file_hash auf anlagen für Dedupe

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — UE2 anpassen (vor Migration 016!)

### Task 2.1: useAntraege-Hook auf View umstellen

**Files:**
- Modify: `ue2/sachbearbeiter/src/hooks/useAntraege.ts`

- [ ] **Step 1: Hook editieren**

Ersetze die `.from("antraege")`-Zeile durch `.from("antrag_mit_summen")`. Volle Datei:

```typescript
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Status } from "../lib/workflow";

export interface AntragRow {
  id: string;
  antragsnummer: string;
  name: string;
  traeger: string;
  submitted_at: string;
  status: Status;
  submitted_language: string;
}

export function useAntraege(): {
  antraege: AntragRow[];
  loading: boolean;
  error: string | null;
} {
  const [antraege, setAntraege] = useState<AntragRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data, error } = await supabase
        .from("antrag_mit_summen")
        .select(
          "id, antragsnummer, name, traeger, submitted_at, status, submitted_language",
        )
        .order("submitted_at", { ascending: false });
      if (!mounted) return;
      if (error) setError(error.message);
      else setAntraege((data ?? []) as AntragRow[]);
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel("antraege-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "apl2", table: "antraege" },
        () => {
          load();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { antraege, loading, error };
}
```

- [ ] **Step 2: Test ausführen + Smoke**

```bash
cd "$REPO/ue2/sachbearbeiter" && npm test
```
Expected: 15/15 grün (Tests unverändert).

### Task 2.2: useAntrag-Hook erweitern

**Files:**
- Modify: `ue2/sachbearbeiter/src/hooks/useAntrag.ts`

- [ ] **Step 1: AntragFull-Type erweitern um Summen aus View**

Im Type `AntragFull` ersetzen wir die drei Summen-Spalten durch die View-Spalten (gleicher Name, kommt aus `antrag_mit_summen`):

```typescript
export interface AntragFull {
  // ... bestehende Felder bis ip_address
  // die folgenden 3 kommen jetzt aus der View:
  betriebskosten_vorjahr_euro: number;
  personalkosten_vorjahr_euro: number;
  miete_jahr_euro: number;
  status: Status;
}

// Neue Types
export interface BelegpositionRow {
  id: string;
  belegtyp: "betriebskosten" | "personalkosten" | "miete";
  bezeichnung: string;
  betrag_euro: number;
  anlage_id: string | null;
}

export interface OeffnungszeitRow {
  wochentag: "mo" | "di" | "mi" | "do" | "fr" | "sa" | "so";
  oeffnungszeit: string | null;
  angebot: string | null;
}
```

- [ ] **Step 2: Reload-Funktion erweitern**

In `reload()` zwei zusätzliche Promise.all-Queries und state-Setter. Komplette neue Datei `ue2/sachbearbeiter/src/hooks/useAntrag.ts`:

```typescript
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Status } from "../lib/workflow";

export interface AntragFull {
  id: string;
  antragsnummer: string;
  haushaltsjahr: number;
  name: string;
  traeger: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  bankverbindung: string;
  iban: string;
  bic: string | null;
  ansprechpartner: string;
  telefon: string;
  email: string;
  raeume_vorhanden: "ja" | "nein";
  raeume_unentgeltlich: "ja" | "nein";
  antragsdatum: string;
  submitted_language: string;
  submitted_at: string;
  user_agent: string | null;
  ip_address: string | null;
  betriebskosten_vorjahr_euro: number;
  personalkosten_vorjahr_euro: number;
  miete_jahr_euro: number;
  status: Status;
}

export interface AnlageRow {
  id: string;
  typ: string;
  dateiname: string;
  groesse_bytes: number;
  mime_type: string;
  storage_path: string;
  uploaded_at: string;
}

export interface BelegpositionRow {
  id: string;
  belegtyp: "betriebskosten" | "personalkosten" | "miete";
  bezeichnung: string;
  betrag_euro: number;
  anlage_id: string | null;
}

export interface OeffnungszeitRow {
  wochentag: "mo" | "di" | "mi" | "do" | "fr" | "sa" | "so";
  oeffnungszeit: string | null;
  angebot: string | null;
}

export interface HistoryRow {
  id: string;
  von_status: Status | null;
  nach_status: Status;
  geaendert_von: string;
  geaendert_am: string;
  kommentar: string | null;
}

export function useAntrag(id: string | undefined) {
  const [antrag, setAntrag] = useState<AntragFull | null>(null);
  const [anlagen, setAnlagen] = useState<AnlageRow[]>([]);
  const [belegpositionen, setBelegpositionen] = useState<BelegpositionRow[]>([]);
  const [oeffnungszeiten, setOeffnungszeiten] = useState<OeffnungszeitRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!id) return;
    setLoading(true);
    const [a, an, bp, oz, h] = await Promise.all([
      supabase.from("antrag_mit_summen").select("*").eq("id", id).single(),
      supabase.from("anlagen").select("*").eq("antrag_id", id).order("uploaded_at"),
      supabase.from("belegposition").select("*").eq("antrag_id", id).order("belegtyp"),
      supabase.from("oeffnungszeit").select("*").eq("antrag_id", id),
      supabase.from("antrag_history").select("*").eq("antrag_id", id)
        .order("geaendert_am", { ascending: false }),
    ]);
    if (a.error) setError(a.error.message);
    else setAntrag(a.data as AntragFull);
    setAnlagen(((an.data as AnlageRow[]) ?? []));
    setBelegpositionen(((bp.data as BelegpositionRow[]) ?? []));
    setOeffnungszeiten(((oz.data as OeffnungszeitRow[]) ?? []));
    setHistory(((h.data as HistoryRow[]) ?? []));
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function changeStatus(
    neuerStatus: Status,
    kommentar: string,
  ): Promise<{ error: string | null }> {
    if (!antrag) return { error: "Kein Antrag geladen" };
    const { error } = await supabase
      .from("antraege")
      .update({ status: neuerStatus })
      .eq("id", antrag.id);
    if (error) return { error: error.message };

    if (kommentar.trim().length > 0) {
      const latest = await supabase
        .from("antrag_history")
        .select("id")
        .eq("antrag_id", antrag.id)
        .eq("nach_status", neuerStatus)
        .order("geaendert_am", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest.data?.id) {
        await supabase
          .from("antrag_history")
          .update({ kommentar })
          .eq("id", latest.data.id);
      }
    }
    await reload();
    return { error: null };
  }

  return {
    antrag, anlagen, belegpositionen, oeffnungszeiten, history,
    loading, error, changeStatus, reload,
  };
}
```

- [ ] **Step 3: Test**

```bash
cd "$REPO/ue2/sachbearbeiter" && npm test
```
Expected: 15/15 grün.

### Task 2.3: AntragDetail-Page erweitern

**Files:**
- Modify: `ue2/sachbearbeiter/src/pages/AntragDetail.tsx`

- [ ] **Step 1: Zwei neue Card-Blöcke einfügen**

Direkt vor dem „Anlagen"-Card-Block in der rechten Spalte (gleicher `<div className="space-y-4">`-Container) zwei neue Cards einfügen: „Belegpositionen" und „Wochenplan". Außerdem die destructured Werte aus `useAntrag()` erweitern und die linke Spalte (Antragsdaten) auf die neuen Summen-Felder anpassen.

Ersetze in `ue2/sachbearbeiter/src/pages/AntragDetail.tsx` die Zeile
```tsx
const { antrag, anlagen, history, loading, error, changeStatus } =
    useAntrag(id);
```
durch:
```tsx
const { antrag, anlagen, belegpositionen, oeffnungszeiten, history, loading, error, changeStatus } =
    useAntrag(id);
```

Ersetze die Felder zu Kosten in der linken Spalte (die jetzt aus der View kommen) sowie das `monatliche_miete_euro`-Feld:

```tsx
<Field label="Betriebskosten Vorjahr">
  {formatEuro(antrag.betriebskosten_vorjahr_euro)}
</Field>
<Field label="Personalkosten Vorjahr">
  {formatEuro(antrag.personalkosten_vorjahr_euro)}
</Field>
<Field label="Räume vorhanden / unentgeltlich">
  {antrag.raeume_vorhanden} / {antrag.raeume_unentgeltlich}
  {antrag.miete_jahr_euro > 0 && (
    <> · Miete (Jahr) {formatEuro(antrag.miete_jahr_euro)}</>
  )}
</Field>
```

Füge in der rechten Spalte (zwischen „Aktionen" und „Anlagen") ein:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Belegpositionen</CardTitle>
  </CardHeader>
  <CardContent className="space-y-2 text-sm">
    {belegpositionen.length === 0 ? (
      <p className="text-slate-500">Keine Belegpositionen.</p>
    ) : (
      (["betriebskosten", "personalkosten", "miete"] as const).map((typ) => {
        const items = belegpositionen.filter((b) => b.belegtyp === typ);
        if (items.length === 0) return null;
        const summe = items.reduce((s, b) => s + Number(b.betrag_euro), 0);
        return (
          <div key={typ} className="border-b border-slate-100 pb-2">
            <p className="font-medium capitalize mb-1">{typ}</p>
            {items.map((b) => (
              <div key={b.id} className="flex justify-between text-xs">
                <span>{b.bezeichnung}</span>
                <span>{formatEuro(Number(b.betrag_euro))}</span>
              </div>
            ))}
            <div className="flex justify-between mt-1 font-semibold text-xs">
              <span>Summe</span>
              <span>{formatEuro(summe)}</span>
            </div>
          </div>
        );
      })
    )}
  </CardContent>
</Card>

<Card>
  <CardHeader>
    <CardTitle>Öffnungszeiten</CardTitle>
  </CardHeader>
  <CardContent>
    {oeffnungszeiten.length === 0 ? (
      <p className="text-sm text-slate-500">Kein Wochenplan hinterlegt.</p>
    ) : (
      <table className="w-full text-xs">
        <tbody>
          {(["mo", "di", "mi", "do", "fr", "sa", "so"] as const).map((tag) => {
            const eintrag = oeffnungszeiten.find((o) => o.wochentag === tag);
            const label = { mo: "Mo", di: "Di", mi: "Mi", do: "Do", fr: "Fr", sa: "Sa", so: "So" }[tag];
            return (
              <tr key={tag}>
                <td className="font-medium pr-2">{label}</td>
                <td className="pr-2">{eintrag?.oeffnungszeit ?? "—"}</td>
                <td>{eintrag?.angebot ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    )}
  </CardContent>
</Card>
```

- [ ] **Step 2: Test + Build**

```bash
cd "$REPO/ue2/sachbearbeiter" && npm test && npm run build
```
Expected: 15/15 Tests grün, Build ohne TS-Errors.

- [ ] **Step 3: Commit Phase 2**

```bash
cd "$REPO" && git add ue2/sachbearbeiter/src/hooks/ ue2/sachbearbeiter/src/pages/AntragDetail.tsx && git commit -m "feat(ue2): View antrag_mit_summen lesen + Belegpositionen + Wochenplan in Detail-Page

Vorbereitung für Migration 016. Hooks fragen Belegpositionen + Wochenplan
mit. AntragDetail zeigt zwei neue Cards in der rechten Spalte.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 2.4: Migration 016 anwenden + UE2 redeploy

**Files:** keine — VPS-Operationen.

- [ ] **Step 1: Migration 016 auf VPS**

```bash
scp -i ~/.ssh/id_vps -P 22 "$REPO/supabase/migrations/016_summen_view_drop_columns.sql" root@bot.butscher.cloud:/tmp/
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 < /tmp/016_summen_view_drop_columns.sql"
```
Expected: `ALTER TABLE`, `UPDATE`, `INSERT 0 N`, `ALTER TABLE` (drop), `CREATE VIEW`, `GRANT`, `NOTIFY`.

- [ ] **Step 2: View-Smoke**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker exec supabase-db psql -U postgres -c 'select count(*) from apl2.antrag_mit_summen;'"
```
Expected: count > 0 (Bestandsdaten + Test-Antrag).

- [ ] **Step 3: Push + UE2 redeploy**

```bash
cd "$REPO" && git push origin main
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "cd /opt/amt-frontend && git pull && cd ue2/sachbearbeiter/docker && docker compose --env-file .env build amt-frontend && docker compose --env-file .env up -d amt-frontend"
```

- [ ] **Step 4: Smoke `amt.butscher.cloud`**

```bash
curl -ksI -m 10 https://amt.butscher.cloud/ | head -1
```
Expected: HTTP/2 200. Robert prüft Inbox + 1 Antrag-Detail → Belegpositionen-Card zeigt die migrierten Legacy-Summen.

---

## Phase 3 — UE1-v2 Frontend Foundation

### Task 3.1: Tailwind v4 einrichten

**Files:**
- Modify: `ue1/webformular/package.json`
- Modify: `ue1/webformular/vite.config.ts`
- Modify: `ue1/webformular/src/styles.css`

- [ ] **Step 1: Dependencies installieren**

```bash
cd "$REPO/ue1/webformular" && npm install -D tailwindcss@^4 @tailwindcss/vite@^4
```

- [ ] **Step 2: `vite.config.ts` updaten**

```typescript
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  base: "/DigitalisierungVerwaltung/ue1/webformular/",
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5173 },
});
```

- [ ] **Step 3: `src/styles.css` ersetzen**

```css
@import "tailwindcss";

@theme {
  --color-wue-rot: #AD0E36;
  --color-wue-akzent: #FF680E;
  --color-step-active: #1e3a8a;
  --color-step-done: #16a34a;
}

body {
  font-family: "Open Sans", system-ui, -apple-system, sans-serif;
  background: #f8fafc;
}
```

- [ ] **Step 4: Build-Smoke**

```bash
cd "$REPO/ue1/webformular" && npm run build
```
Expected: dist/ erzeugt mit CSS-Bundle das Tailwind-Klassen enthält.

- [ ] **Step 5: Commit**

```bash
cd "$REPO" && git add ue1/webformular/ && git commit -m "feat(ue1): Tailwind v4 setup für UE1-v2-Refactor

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.2: signals.ts — Proxy-basierte Reactivity

**Files:**
- Create: `ue1/webformular/src/signals.ts`
- Create: `ue1/webformular/tests/signals.test.ts`

- [ ] **Step 1: Failing Test**

`ue1/webformular/tests/signals.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { signal } from "../src/signals";

describe("signal", () => {
  it("hat get/set", () => {
    const s = signal({ a: 1 });
    expect(s.value.a).toBe(1);
    s.value = { a: 2 };
    expect(s.value.a).toBe(2);
  });

  it("notifiziert Subscriber bei value-Reassignment", () => {
    const s = signal({ count: 0 });
    const cb = vi.fn();
    s.subscribe(cb);
    s.value = { count: 1 };
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ count: 1 });
  });

  it("unsubscribe stoppt Notifikationen", () => {
    const s = signal({ x: 0 });
    const cb = vi.fn();
    const unsub = s.subscribe(cb);
    unsub();
    s.value = { x: 5 };
    expect(cb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run + verify FAIL**

```bash
cd "$REPO/ue1/webformular" && npm test -- signals
```
Expected: FAIL (`Cannot find module '../src/signals'`).

- [ ] **Step 3: Implementation**

`ue1/webformular/src/signals.ts`:
```typescript
// Minimaler Signal-Helper (~20 LOC), keine Framework-Dependency.
// API: signal(initial).value (read/write) + .subscribe(cb) → unsubscribe-Fn.

export interface Signal<T> {
  value: T;
  subscribe(cb: (v: T) => void): () => void;
}

export function signal<T>(initial: T): Signal<T> {
  let val = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get value() { return val; },
    set value(next: T) {
      val = next;
      for (const cb of subs) cb(val);
    },
    subscribe(cb) {
      subs.add(cb);
      return () => { subs.delete(cb); };
    },
  };
}
```

- [ ] **Step 4: Run + verify PASS**

```bash
cd "$REPO/ue1/webformular" && npm test -- signals
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/signals.ts ue1/webformular/tests/signals.test.ts && git commit -m "feat(ue1): signals.ts — minimaler Reactivity-Helper (TDD, 3 Tests)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.3: validation.ts — IBAN, E-Mail, PLZ

**Files:**
- Create: `ue1/webformular/src/validation.ts`
- Create: `ue1/webformular/tests/validation.test.ts`

- [ ] **Step 1: Failing Test**

`ue1/webformular/tests/validation.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { isValidIBAN, isValidEmail, isValidPLZ } from "../src/validation";

describe("isValidIBAN", () => {
  it("akzeptiert valide DE-IBAN", () => {
    expect(isValidIBAN("DE89370400440532013000")).toBe(true);
    expect(isValidIBAN("DE89 3704 0044 0532 0130 00")).toBe(true);
  });
  it("akzeptiert valide AT-IBAN", () => {
    expect(isValidIBAN("AT611904300234573201")).toBe(true);
  });
  it("lehnt ungültige Checksumme ab", () => {
    expect(isValidIBAN("DE00000000000000000000")).toBe(false);
  });
  it("lehnt zu kurze IBAN ab", () => {
    expect(isValidIBAN("DE89")).toBe(false);
  });
  it("lehnt leere/null ab", () => {
    expect(isValidIBAN("")).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("akzeptiert normale Adressen", () => {
    expect(isValidEmail("foo@bar.de")).toBe(true);
    expect(isValidEmail("a.b+c@example.co.uk")).toBe(true);
  });
  it("lehnt Adressen ohne @ ab", () => {
    expect(isValidEmail("foo.bar.de")).toBe(false);
  });
  it("lehnt Adressen ohne TLD ab", () => {
    expect(isValidEmail("foo@bar")).toBe(false);
  });
});

describe("isValidPLZ", () => {
  it("akzeptiert 5-stellige Zahlen", () => {
    expect(isValidPLZ("97070")).toBe(true);
  });
  it("lehnt kürzere ab", () => {
    expect(isValidPLZ("9707")).toBe(false);
  });
  it("lehnt Buchstaben ab", () => {
    expect(isValidPLZ("97A70")).toBe(false);
  });
});
```

- [ ] **Step 2: Verify FAIL**

```bash
cd "$REPO/ue1/webformular" && npm test -- validation
```
Expected: FAIL.

- [ ] **Step 3: Implementation**

`ue1/webformular/src/validation.ts`:
```typescript
// IBAN-Prüfung nach ISO 13616: Länder-Buchstaben → Zahlen, Mod-97-Check = 1.

export function isValidIBAN(input: string): boolean {
  const s = (input ?? "").replace(/\s+/g, "").toUpperCase();
  if (s.length < 15 || s.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return false;
  // Rearrange: Länder-Code + Prüfziffer ans Ende
  const rearranged = s.slice(4) + s.slice(0, 4);
  // Buchstaben → Zahlen (A=10, B=11, ..., Z=35)
  let numeric = "";
  for (const c of rearranged) {
    if (c >= "0" && c <= "9") numeric += c;
    else numeric += (c.charCodeAt(0) - 55).toString();
  }
  // mod 97 schrittweise (numeric kann sehr lang sein)
  let remainder = 0;
  for (const c of numeric) {
    remainder = (remainder * 10 + Number(c)) % 97;
  }
  return remainder === 1;
}

export function isValidEmail(input: string): boolean {
  // Einfacher RFC-5322-Subset: irgendwas @ irgendwas . irgendwas
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input ?? "");
}

export function isValidPLZ(input: string): boolean {
  return /^\d{5}$/.test(input ?? "");
}
```

- [ ] **Step 4: Verify PASS**

```bash
cd "$REPO/ue1/webformular" && npm test -- validation
```
Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/validation.ts ue1/webformular/tests/validation.test.ts && git commit -m "feat(ue1): validation.ts — IBAN (mod-97), E-Mail, PLZ (TDD, 11 Tests)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.4: format.ts erweitern — parseEuro

**Files:**
- Modify: `ue1/webformular/src/format.ts`
- Modify: `ue1/webformular/tests/format.test.ts`

- [ ] **Step 1: Failing Test ergänzen**

Hänge an `ue1/webformular/tests/format.test.ts`:
```typescript
import { parseEuro } from "../src/format";

describe("parseEuro", () => {
  it("parsed deutsches Format mit Tausenderpunkt + Komma", () => {
    expect(parseEuro("1.234,56")).toBe(1234.56);
  });
  it("parsed ohne Tausenderpunkt", () => {
    expect(parseEuro("1234,56")).toBe(1234.56);
  });
  it("parsed Ganzzahl", () => {
    expect(parseEuro("1234")).toBe(1234);
  });
  it("parsed mit € Suffix", () => {
    expect(parseEuro("1.234,56 €")).toBe(1234.56);
  });
  it("returnt NaN bei nicht-parsebarer Eingabe", () => {
    expect(parseEuro("abc")).toBeNaN();
  });
  it("returnt 0 bei leerem String", () => {
    expect(parseEuro("")).toBe(0);
  });
});
```

- [ ] **Step 2: Verify FAIL**

```bash
cd "$REPO/ue1/webformular" && npm test -- format
```
Expected: FAIL (parseEuro nicht exportiert).

- [ ] **Step 3: Implementation in `format.ts`**

Hänge an `ue1/webformular/src/format.ts`:
```typescript
export function parseEuro(input: string): number {
  if (input === "" || input == null) return 0;
  const cleaned = input
    .replace(/€/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isNaN(n) ? NaN : n;
}
```

- [ ] **Step 4: Verify PASS**

```bash
cd "$REPO/ue1/webformular" && npm test -- format
```
Expected: alle (bestehende + 6 neue) grün.

- [ ] **Step 5: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/format.ts ue1/webformular/tests/format.test.ts && git commit -m "feat(ue1): format.ts parseEuro für deutsches Format (TDD, 6 Tests)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.5: types.ts + state.ts — FormState + isStepComplete

**Files:**
- Modify: `ue1/webformular/src/types.ts`
- Create: `ue1/webformular/src/state.ts`
- Create: `ue1/webformular/tests/state.test.ts`

- [ ] **Step 1: Types erweitern**

Im `ue1/webformular/src/types.ts` ergänzen (ohne bestehende Types zu zerstören):

```typescript
export type Wochentag = "mo" | "di" | "mi" | "do" | "fr" | "sa" | "so";
export type Belegtyp = "betriebskosten" | "personalkosten" | "miete";

export interface BelegpositionEntry {
  id: string;          // Client-side UUID
  belegtyp: Belegtyp;
  bezeichnung: string;
  betrag_euro: number;
  file: File | null;   // null = noch nicht hochgeladen
  file_hash: string | null;
}

export interface OeffnungszeitEntry {
  wochentag: Wochentag;
  oeffnungszeit: string;
  angebot: string;
}

export interface FormState {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  // Step 1
  haushaltsjahr: number;
  name: string;
  traeger: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  // Step 2
  ansprechpartner: string;
  telefon: string;
  email: string;
  bankverbindung: string;
  iban: string;
  bic: string;
  // Step 3
  oeffnungszeiten: OeffnungszeitEntry[];
  // Step 4
  raeume_vorhanden: "ja" | "nein" | null;
  raeume_unentgeltlich: "ja" | "nein" | null;
  belegpositionen: BelegpositionEntry[];
  // Step 5
  programm_flyer: File | null;
  // Step 6
  bestaetigt: boolean;
  // i18n
  language: Sprache;
}
```

- [ ] **Step 2: Failing Test**

`ue1/webformular/tests/state.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { initialState, isStepComplete } from "../src/state";
import type { FormState } from "../src/types";

function makeState(overrides: Partial<FormState> = {}): FormState {
  return { ...initialState(), ...overrides };
}

describe("isStepComplete", () => {
  it("Step 1 leer ist nicht complete", () => {
    expect(isStepComplete(1, initialState())).toBe(false);
  });

  it("Step 1 mit allen Pflichtfeldern ist complete", () => {
    const s = makeState({
      name: "Test", traeger: "X", strasse: "Hauptstr", hausnummer: "1",
      plz: "97070", ort: "Würzburg", haushaltsjahr: 2026,
    });
    expect(isStepComplete(1, s)).toBe(true);
  });

  it("Step 1 mit ungültiger PLZ ist nicht complete", () => {
    const s = makeState({
      name: "Test", traeger: "X", strasse: "Hauptstr", hausnummer: "1",
      plz: "abc", ort: "Würzburg", haushaltsjahr: 2026,
    });
    expect(isStepComplete(1, s)).toBe(false);
  });

  it("Step 2 mit DE-IBAN ohne BIC ist complete", () => {
    const s = makeState({
      ansprechpartner: "M. Schmidt", telefon: "0931 1", email: "m@x.de",
      bankverbindung: "Sparkasse", iban: "DE89370400440532013000", bic: "",
    });
    expect(isStepComplete(2, s)).toBe(true);
  });

  it("Step 2 mit AT-IBAN ohne BIC ist NICHT complete", () => {
    const s = makeState({
      ansprechpartner: "M", telefon: "1", email: "m@x.de",
      bankverbindung: "Erste", iban: "AT611904300234573201", bic: "",
    });
    expect(isStepComplete(2, s)).toBe(false);
  });

  it("Step 3 mit 0 Öffnungstagen ist nicht complete", () => {
    expect(isStepComplete(3, initialState())).toBe(false);
  });

  it("Step 3 mit mind 1 Tag ist complete", () => {
    const s = makeState({
      oeffnungszeiten: [
        { wochentag: "mo", oeffnungszeit: "10:00-16:00", angebot: "Kaffee" },
        { wochentag: "di", oeffnungszeit: "", angebot: "" },
        { wochentag: "mi", oeffnungszeit: "", angebot: "" },
        { wochentag: "do", oeffnungszeit: "", angebot: "" },
        { wochentag: "fr", oeffnungszeit: "", angebot: "" },
        { wochentag: "sa", oeffnungszeit: "", angebot: "" },
        { wochentag: "so", oeffnungszeit: "", angebot: "" },
      ],
    });
    expect(isStepComplete(3, s)).toBe(true);
  });

  it("Step 4 mit Räume unentgeltlich=ja braucht keine Mietposition", () => {
    const s = makeState({
      raeume_vorhanden: "nein", raeume_unentgeltlich: "ja",
    });
    expect(isStepComplete(4, s)).toBe(true);
  });

  it("Step 4 mit Räume nicht unentgeltlich braucht Mietposition mit Beleg", () => {
    const s1 = makeState({
      raeume_vorhanden: "ja", raeume_unentgeltlich: "nein",
    });
    expect(isStepComplete(4, s1)).toBe(false);
    const s2 = makeState({
      raeume_vorhanden: "ja", raeume_unentgeltlich: "nein",
      belegpositionen: [{ id: "1", belegtyp: "miete", bezeichnung: "Miete",
        betrag_euro: 1200, file: null, file_hash: null }],
    });
    expect(isStepComplete(4, s2)).toBe(false); // Beleg fehlt
    const s3 = makeState({
      raeume_vorhanden: "ja", raeume_unentgeltlich: "nein",
      belegpositionen: [{ id: "1", belegtyp: "miete", bezeichnung: "Miete",
        betrag_euro: 1200, file: new File([], "m.pdf"), file_hash: "h" }],
    });
    expect(isStepComplete(4, s3)).toBe(true);
  });

  it("Step 5 ohne Programm-Flyer ist nicht complete", () => {
    expect(isStepComplete(5, initialState())).toBe(false);
  });

  it("Step 6 braucht Bestätigung", () => {
    expect(isStepComplete(6, initialState())).toBe(false);
    const s = makeState({ bestaetigt: true });
    expect(isStepComplete(6, s)).toBe(true);
  });
});
```

- [ ] **Step 3: Verify FAIL**

```bash
cd "$REPO/ue1/webformular" && npm test -- state
```
Expected: FAIL (state.ts nicht da).

- [ ] **Step 4: Implementation**

`ue1/webformular/src/state.ts`:
```typescript
import type { FormState, Sprache } from "./types";
import { isValidIBAN, isValidEmail, isValidPLZ } from "./validation";

export function initialState(): FormState {
  const wochentage: Array<"mo"|"di"|"mi"|"do"|"fr"|"sa"|"so"> =
    ["mo","di","mi","do","fr","sa","so"];
  return {
    step: 1,
    haushaltsjahr: new Date().getFullYear(),
    name: "", traeger: "", strasse: "", hausnummer: "", plz: "", ort: "",
    ansprechpartner: "", telefon: "", email: "",
    bankverbindung: "", iban: "", bic: "",
    oeffnungszeiten: wochentage.map((t) => ({ wochentag: t, oeffnungszeit: "", angebot: "" })),
    raeume_vorhanden: null, raeume_unentgeltlich: null,
    belegpositionen: [],
    programm_flyer: null,
    bestaetigt: false,
    language: detectLanguage(),
  };
}

function detectLanguage(): Sprache {
  const code = (navigator.language ?? "de").slice(0, 2).toLowerCase();
  if (code === "it" || code === "tr" || code === "es") return code as Sprache;
  return "de";
}

export function isStepComplete(step: number, s: FormState): boolean {
  switch (step) {
    case 1:
      return (
        s.name.trim().length > 1 &&
        s.traeger.trim().length > 1 &&
        s.strasse.trim().length > 0 &&
        s.hausnummer.trim().length > 0 &&
        isValidPLZ(s.plz) &&
        s.ort.trim().length > 0 &&
        s.haushaltsjahr >= 2020 && s.haushaltsjahr <= 2030
      );
    case 2:
      if (
        s.ansprechpartner.trim().length < 1 ||
        s.telefon.trim().length < 1 ||
        !isValidEmail(s.email) ||
        s.bankverbindung.trim().length < 1 ||
        !isValidIBAN(s.iban)
      ) return false;
      const ibanCountry = s.iban.replace(/\s+/g, "").slice(0, 2).toUpperCase();
      if (ibanCountry !== "DE" && s.bic.trim().length < 8) return false;
      return true;
    case 3:
      return s.oeffnungszeiten.some(
        (o) => o.oeffnungszeit.trim().length > 0 && o.angebot.trim().length > 0,
      );
    case 4: {
      if (s.raeume_vorhanden === null || s.raeume_unentgeltlich === null) return false;
      if (s.raeume_unentgeltlich === "ja") return true;
      // Miete-Pflicht: mind 1 Position belegtyp=miete mit file
      const mietePos = s.belegpositionen.filter((b) => b.belegtyp === "miete");
      if (mietePos.length === 0) return false;
      return mietePos.every((p) => p.bezeichnung.trim().length > 0 && p.betrag_euro > 0 && p.file !== null);
    }
    case 5:
      return s.programm_flyer !== null;
    case 6:
      return s.bestaetigt === true;
    default:
      return false;
  }
}
```

- [ ] **Step 5: Verify PASS**

```bash
cd "$REPO/ue1/webformular" && npm test -- state
```
Expected: 11 passed.

- [ ] **Step 6: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/types.ts ue1/webformular/src/state.ts ue1/webformular/tests/state.test.ts && git commit -m "feat(ue1): FormState + isStepComplete für 6 Steps (TDD, 11 Tests)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.6: translations.ts + i18n.ts erweitern

**Files:**
- Modify: `ue1/webformular/src/translations.ts`
- Modify: `ue1/webformular/tests/i18n.test.ts`

- [ ] **Step 1: Keys ergänzen** in `ue1/webformular/src/translations.ts`

Für jede der 4 Sprachen die folgenden Keys hinzufügen (sinnvoll übersetzt). Beispielhaft DE:

```typescript
// In translations.de:
"stepper.1.titel": "Einrichtung",
"stepper.2.titel": "Kontakt & Bank",
"stepper.3.titel": "Wochenplan",
"stepper.4.titel": "Kosten",
"stepper.5.titel": "Anlage",
"stepper.6.titel": "Senden",
"stepper.weiter": "Weiter",
"stepper.zurueck": "Zurück",
"stepper.fortschritt": "Schritt {n} von {total}",
"belegposition.hinzufuegen": "+ Position hinzufügen",
"belegposition.bezeichnung": "Bezeichnung",
"belegposition.betrag": "Betrag",
"belegposition.beleg": "Beleg",
"belegposition.hochladen": "Beleg hochladen",
"belegposition.entfernen": "Entfernen",
"summe.betriebskosten": "Summe Betriebskosten",
"summe.personalkosten": "Summe Personalkosten",
"summe.miete": "Summe Miete (Jahr)",
"summe.gesamt": "Gesamt geltend gemachte Kosten",
"wochenplan.tag.mo": "Montag",
"wochenplan.tag.di": "Dienstag",
"wochenplan.tag.mi": "Mittwoch",
"wochenplan.tag.do": "Donnerstag",
"wochenplan.tag.fr": "Freitag",
"wochenplan.tag.sa": "Samstag",
"wochenplan.tag.so": "Sonntag",
"wochenplan.oeffnungszeit": "Öffnungszeit",
"wochenplan.angebot": "Angebot",
"uebersicht.titel": "Ihre Eingaben — bitte prüfen",
"uebersicht.bearbeiten": "Bearbeiten",
"uebersicht.bestaetigung": "Ich bestätige, dass die Angaben wahrheitsgemäß sind.",
"validation.pflicht": "Pflichtfeld",
"validation.iban_ungueltig": "IBAN-Format/Checksumme ungültig",
"validation.email_ungueltig": "E-Mail ungültig",
"validation.plz_ungueltig": "PLZ muss 5 Ziffern haben",
```

(IT/TR/ES analog übersetzt — fließend, AHP-typisch.)

- [ ] **Step 2: i18n-Vollständigkeits-Test verifizieren**

Der bestehende Test prüft, dass alle Sprachen dieselben Keys haben. Run:
```bash
cd "$REPO/ue1/webformular" && npm test -- i18n
```
Expected: PASS (alle 4 Sprachen vollständig).

- [ ] **Step 3: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/translations.ts && git commit -m "feat(ue1): translations.ts um Stepper-, Belegposition-, Wochenplan-, Übersicht-Keys erweitert (DE/IT/TR/ES)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — Wiederverwendbare Komponenten

### Task 4.1: field-input.ts — Field-Wrapper

**Files:**
- Create: `ue1/webformular/src/components/field-input.ts`

- [ ] **Step 1: Implementation** (kein Test — pure DOM-Helper, in Step-Tests indirekt abgedeckt)

`ue1/webformular/src/components/field-input.ts`:
```typescript
import { t } from "../i18n";

interface FieldOptions {
  id: string;
  label: string;
  type?: "text" | "email" | "tel" | "number";
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  validate?: (v: string) => string | null; // returns error message or null
  placeholder?: string;
}

export function renderFieldInput(opts: FieldOptions): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "mb-3";

  const label = document.createElement("label");
  label.htmlFor = opts.id;
  label.className = "block text-sm font-medium text-slate-700 mb-1";
  label.textContent = opts.label + (opts.required ? " *" : "");
  wrap.appendChild(label);

  const input = document.createElement("input");
  input.id = opts.id;
  input.type = opts.type ?? "text";
  input.value = opts.value;
  input.placeholder = opts.placeholder ?? "";
  input.className = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  if (opts.required) input.required = true;
  wrap.appendChild(input);

  const errEl = document.createElement("p");
  errEl.className = "mt-1 text-xs text-rose-600 hidden";
  wrap.appendChild(errEl);

  input.addEventListener("input", () => {
    opts.onChange(input.value);
    if (opts.validate) {
      const err = opts.validate(input.value);
      if (err && input.value.length > 0) {
        errEl.textContent = err;
        errEl.classList.remove("hidden");
        input.classList.add("border-rose-400");
      } else {
        errEl.classList.add("hidden");
        input.classList.remove("border-rose-400");
      }
    }
  });

  return wrap;
}
```

- [ ] **Step 2: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/components/field-input.ts && git commit -m "feat(ue1): field-input.ts — Wrapper mit Label, Sternchen, Live-Validation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 4.2: belegposition-row.ts

**Files:**
- Create: `ue1/webformular/src/components/belegposition-row.ts`

- [ ] **Step 1: Implementation**

`ue1/webformular/src/components/belegposition-row.ts`:
```typescript
import type { BelegpositionEntry } from "../types";
import { formatEuro, parseEuro } from "../format";
import { t } from "../i18n";

async function sha256(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface RowOptions {
  position: BelegpositionEntry;
  onChange: (next: BelegpositionEntry) => void;
  onRemove: () => void;
}

export function renderBelegpositionRow(opts: RowOptions): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex flex-wrap items-center gap-2 border border-slate-200 rounded p-2 mb-1";

  // Bezeichnung
  const bez = document.createElement("input");
  bez.placeholder = t("belegposition.bezeichnung");
  bez.value = opts.position.bezeichnung;
  bez.className = "flex-1 min-w-[140px] rounded border border-slate-300 px-2 py-1 text-sm";
  bez.addEventListener("input", () => opts.onChange({ ...opts.position, bezeichnung: bez.value }));
  row.appendChild(bez);

  // Betrag
  const betragInput = document.createElement("input");
  betragInput.placeholder = "0,00";
  betragInput.value = opts.position.betrag_euro > 0 ? formatEuro(opts.position.betrag_euro).replace(/\s€$/, "") : "";
  betragInput.className = "w-32 rounded border border-slate-300 px-2 py-1 text-sm text-right";
  betragInput.addEventListener("input", () => {
    const n = parseEuro(betragInput.value);
    opts.onChange({ ...opts.position, betrag_euro: Number.isNaN(n) ? 0 : n });
  });
  row.appendChild(betragInput);

  const eurLabel = document.createElement("span");
  eurLabel.textContent = "€";
  eurLabel.className = "text-sm text-slate-500";
  row.appendChild(eurLabel);

  // File-Upload
  const fileBtn = document.createElement("label");
  fileBtn.className = "inline-flex items-center gap-1 cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/pdf,image/jpeg,image/png";
  fileInput.className = "hidden";
  const labelText = document.createElement("span");
  labelText.textContent = opts.position.file
    ? `✓ ${opts.position.file.name}`
    : t("belegposition.hochladen");
  fileBtn.appendChild(fileInput);
  fileBtn.appendChild(labelText);
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0] ?? null;
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      alert("Datei > 10 MB nicht erlaubt");
      return;
    }
    const hash = await sha256(f);
    opts.onChange({ ...opts.position, file: f, file_hash: hash });
  });
  row.appendChild(fileBtn);

  // Remove
  const rm = document.createElement("button");
  rm.type = "button";
  rm.textContent = "×";
  rm.className = "ml-auto h-7 w-7 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600";
  rm.addEventListener("click", () => opts.onRemove());
  row.appendChild(rm);

  return row;
}
```

- [ ] **Step 2: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/components/belegposition-row.ts && git commit -m "feat(ue1): belegposition-row.ts — Repeater-Zeile mit Inline-Upload + SHA-256

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 4.3: stepper.ts

**Files:**
- Create: `ue1/webformular/src/stepper.ts`

- [ ] **Step 1: Implementation**

`ue1/webformular/src/stepper.ts`:
```typescript
import type { Signal } from "./signals";
import type { FormState } from "./types";
import { isStepComplete } from "./state";
import { t } from "./i18n";

const STEP_LABEL_KEYS = [
  "stepper.1.titel", "stepper.2.titel", "stepper.3.titel",
  "stepper.4.titel", "stepper.5.titel", "stepper.6.titel",
];

export function renderStepper(stateSig: Signal<FormState>): HTMLElement {
  const wrap = document.createElement("nav");
  wrap.className = "mb-6";

  const bubbles = document.createElement("ol");
  bubbles.className = "flex items-center justify-between gap-1 mb-2";

  const update = () => {
    const s = stateSig.value;
    bubbles.innerHTML = "";
    for (let i = 1; i <= 6; i++) {
      const li = document.createElement("li");
      li.className = "flex-1 flex flex-col items-center";
      const btn = document.createElement("button");
      btn.type = "button";
      const done = i < s.step && isStepComplete(i, s);
      const active = i === s.step;
      const cls = active
        ? "bg-blue-700 text-white"
        : done
          ? "bg-emerald-600 text-white"
          : "bg-slate-200 text-slate-600";
      btn.className = `h-8 w-8 rounded-full text-xs font-semibold ${cls}`;
      btn.textContent = done ? "✓" : String(i);
      btn.addEventListener("click", () => {
        stateSig.value = { ...s, step: i as FormState["step"] };
      });
      li.appendChild(btn);
      const lbl = document.createElement("span");
      lbl.className = "mt-1 text-[10px] sm:text-xs text-slate-600 text-center";
      lbl.textContent = t(STEP_LABEL_KEYS[i - 1]);
      li.appendChild(lbl);
      bubbles.appendChild(li);
    }
  };
  update();
  stateSig.subscribe(update);

  wrap.appendChild(bubbles);

  const progress = document.createElement("p");
  progress.className = "text-center text-xs text-slate-500";
  const updateProgress = () => {
    progress.textContent = t("stepper.fortschritt")
      .replace("{n}", String(stateSig.value.step))
      .replace("{total}", "6");
  };
  updateProgress();
  stateSig.subscribe(updateProgress);
  wrap.appendChild(progress);

  return wrap;
}
```

- [ ] **Step 2: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/stepper.ts && git commit -m "feat(ue1): stepper.ts — Step-Bubble-Navigation mit Live-Status

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 — Steps

### Task 5.1: Step 1 — Träger & Einrichtung

**Files:**
- Create: `ue1/webformular/src/steps/step1-traeger.ts`

- [ ] **Step 1: Implementation**

`ue1/webformular/src/steps/step1-traeger.ts`:
```typescript
import type { Signal } from "../signals";
import type { FormState } from "../types";
import { renderFieldInput } from "../components/field-input";
import { isValidPLZ } from "../validation";
import { t } from "../i18n";

export function renderStep1(stateSig: Signal<FormState>): HTMLElement {
  const root = document.createElement("section");
  root.className = "bg-white p-6 rounded-lg border border-slate-200";

  const h = document.createElement("h2");
  h.className = "text-lg font-semibold mb-4";
  h.textContent = t("form.legend.traeger");
  root.appendChild(h);

  const set = (patch: Partial<FormState>) => {
    stateSig.value = { ...stateSig.value, ...patch };
  };

  // Haushaltsjahr
  root.appendChild(renderFieldInput({
    id: "haushaltsjahr", label: t("form.label.haushaltsjahr"), type: "number",
    required: true, value: String(stateSig.value.haushaltsjahr),
    onChange: (v) => set({ haushaltsjahr: Number(v) || 0 }),
  }));
  root.appendChild(renderFieldInput({
    id: "name", label: t("form.label.name"), required: true,
    value: stateSig.value.name, onChange: (v) => set({ name: v }),
  }));
  root.appendChild(renderFieldInput({
    id: "traeger", label: t("form.label.traeger"), required: true,
    value: stateSig.value.traeger, onChange: (v) => set({ traeger: v }),
  }));

  // Adresse-Grid (4 atomare)
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-1 sm:grid-cols-4 gap-3";
  grid.appendChild(wrapInGrid(renderFieldInput({
    id: "strasse", label: t("form.label.strasse"), required: true,
    value: stateSig.value.strasse, onChange: (v) => set({ strasse: v }),
  }), "sm:col-span-2"));
  grid.appendChild(wrapInGrid(renderFieldInput({
    id: "hausnummer", label: t("form.label.hausnummer"), required: true,
    value: stateSig.value.hausnummer, onChange: (v) => set({ hausnummer: v }),
  }), ""));
  grid.appendChild(wrapInGrid(renderFieldInput({
    id: "plz", label: t("form.label.plz"), required: true,
    value: stateSig.value.plz, onChange: (v) => set({ plz: v }),
    validate: (v) => (v.length > 0 && !isValidPLZ(v) ? t("validation.plz_ungueltig") : null),
  }), ""));
  grid.appendChild(wrapInGrid(renderFieldInput({
    id: "ort", label: t("form.label.ort"), required: true,
    value: stateSig.value.ort, onChange: (v) => set({ ort: v }),
  }), "sm:col-span-4"));
  root.appendChild(grid);

  return root;
}

function wrapInGrid(el: HTMLElement, colSpan: string): HTMLElement {
  const wrap = document.createElement("div");
  if (colSpan) wrap.className = colSpan;
  wrap.appendChild(el);
  return wrap;
}
```

- [ ] **Step 2: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/steps/step1-traeger.ts && git commit -m "feat(ue1): Step 1 — Träger & Einrichtung mit atomarer Adresse + PLZ-Validation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5.2: Step 2 — Kontakt & Bank

**Files:**
- Create: `ue1/webformular/src/steps/step2-kontakt-bank.ts`

- [ ] **Step 1: Implementation**

`ue1/webformular/src/steps/step2-kontakt-bank.ts`:
```typescript
import type { Signal } from "../signals";
import type { FormState } from "../types";
import { renderFieldInput } from "../components/field-input";
import { isValidEmail, isValidIBAN } from "../validation";
import { t } from "../i18n";

export function renderStep2(stateSig: Signal<FormState>): HTMLElement {
  const root = document.createElement("section");
  root.className = "bg-white p-6 rounded-lg border border-slate-200";

  const h = document.createElement("h2");
  h.className = "text-lg font-semibold mb-4";
  h.textContent = t("form.legend.kontakt") + " & " + t("form.legend.bank");
  root.appendChild(h);

  const set = (patch: Partial<FormState>) => {
    stateSig.value = { ...stateSig.value, ...patch };
  };

  root.appendChild(renderFieldInput({
    id: "ansprechpartner", label: t("form.label.ansprechpartner"), required: true,
    value: stateSig.value.ansprechpartner, onChange: (v) => set({ ansprechpartner: v }),
  }));
  root.appendChild(renderFieldInput({
    id: "telefon", label: t("form.label.telefon"), type: "tel", required: true,
    value: stateSig.value.telefon, onChange: (v) => set({ telefon: v }),
  }));
  root.appendChild(renderFieldInput({
    id: "email", label: t("form.label.email"), type: "email", required: true,
    value: stateSig.value.email, onChange: (v) => set({ email: v }),
    validate: (v) => (v.length > 0 && !isValidEmail(v) ? t("validation.email_ungueltig") : null),
  }));
  root.appendChild(renderFieldInput({
    id: "bankverbindung", label: t("form.label.bankverbindung"), required: true,
    value: stateSig.value.bankverbindung, onChange: (v) => set({ bankverbindung: v }),
  }));
  root.appendChild(renderFieldInput({
    id: "iban", label: t("form.label.iban"), required: true,
    value: stateSig.value.iban,
    onChange: (v) => set({ iban: v }),
    validate: (v) => (v.length > 0 && !isValidIBAN(v) ? t("validation.iban_ungueltig") : null),
  }));

  // BIC nur wenn nicht-DE
  const bicWrap = document.createElement("div");
  const updateBic = () => {
    const ibanCountry = stateSig.value.iban.replace(/\s+/g, "").slice(0, 2).toUpperCase();
    const show = ibanCountry.length === 2 && ibanCountry !== "DE";
    bicWrap.style.display = show ? "block" : "none";
  };
  bicWrap.appendChild(renderFieldInput({
    id: "bic", label: t("form.label.bic"), required: false,
    value: stateSig.value.bic, onChange: (v) => set({ bic: v }),
  }));
  updateBic();
  stateSig.subscribe(updateBic);
  root.appendChild(bicWrap);

  return root;
}
```

- [ ] **Step 2: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/steps/step2-kontakt-bank.ts && git commit -m "feat(ue1): Step 2 — Kontakt & Bank mit IBAN/E-Mail-Validation + bedingtem BIC

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5.3: Step 3 — Wochenplan

**Files:**
- Create: `ue1/webformular/src/steps/step3-wochenplan.ts`

- [ ] **Step 1: Implementation**

`ue1/webformular/src/steps/step3-wochenplan.ts`:
```typescript
import type { Signal } from "../signals";
import type { FormState, Wochentag } from "../types";
import { t } from "../i18n";

const WOCHENTAGE: Wochentag[] = ["mo","di","mi","do","fr","sa","so"];

export function renderStep3(stateSig: Signal<FormState>): HTMLElement {
  const root = document.createElement("section");
  root.className = "bg-white p-6 rounded-lg border border-slate-200";

  const h = document.createElement("h2");
  h.className = "text-lg font-semibold mb-4";
  h.textContent = t("stepper.3.titel");
  root.appendChild(h);

  const hint = document.createElement("p");
  hint.className = "text-sm text-slate-500 mb-4";
  hint.textContent = t("wochenplan.hinweis") || "Bitte mindestens einen Wochentag mit Öffnungszeit + Angebot füllen.";
  root.appendChild(hint);

  const table = document.createElement("table");
  table.className = "w-full text-sm";
  const tbody = document.createElement("tbody");

  const set = (wochentag: Wochentag, patch: { oeffnungszeit?: string; angebot?: string }) => {
    const next = stateSig.value.oeffnungszeiten.map((o) =>
      o.wochentag === wochentag ? { ...o, ...patch } : o,
    );
    stateSig.value = { ...stateSig.value, oeffnungszeiten: next };
  };

  for (const tag of WOCHENTAGE) {
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-100";

    const tdName = document.createElement("td");
    tdName.className = "py-2 font-medium pr-3 w-28";
    tdName.textContent = t(`wochenplan.tag.${tag}`);
    tr.appendChild(tdName);

    const tdZeit = document.createElement("td");
    tdZeit.className = "py-2 pr-3 w-40";
    const zeitInput = document.createElement("input");
    zeitInput.placeholder = "10:00–16:00";
    zeitInput.value = stateSig.value.oeffnungszeiten.find((o) => o.wochentag === tag)?.oeffnungszeit ?? "";
    zeitInput.className = "w-full rounded border border-slate-300 px-2 py-1";
    zeitInput.addEventListener("input", () => set(tag, { oeffnungszeit: zeitInput.value }));
    tdZeit.appendChild(zeitInput);
    tr.appendChild(tdZeit);

    const tdAng = document.createElement("td");
    tdAng.className = "py-2";
    const angInput = document.createElement("input");
    angInput.placeholder = t("wochenplan.angebot");
    angInput.value = stateSig.value.oeffnungszeiten.find((o) => o.wochentag === tag)?.angebot ?? "";
    angInput.className = "w-full rounded border border-slate-300 px-2 py-1";
    angInput.addEventListener("input", () => set(tag, { angebot: angInput.value }));
    tdAng.appendChild(angInput);
    tr.appendChild(tdAng);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  root.appendChild(table);

  return root;
}
```

- [ ] **Step 2: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/steps/step3-wochenplan.ts && git commit -m "feat(ue1): Step 3 — Wochenplan-Tabelle (Anlage 1 strukturiert)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5.4: Step 4 — Kosten & Belege

**Files:**
- Create: `ue1/webformular/src/steps/step4-kosten-belege.ts`

- [ ] **Step 1: Implementation**

`ue1/webformular/src/steps/step4-kosten-belege.ts`:
```typescript
import type { Signal } from "../signals";
import type { FormState, BelegpositionEntry, Belegtyp } from "../types";
import { renderBelegpositionRow } from "../components/belegposition-row";
import { formatEuro } from "../format";
import { t } from "../i18n";

function uuid(): string {
  return crypto.randomUUID();
}

export function renderStep4(stateSig: Signal<FormState>): HTMLElement {
  const root = document.createElement("section");
  root.className = "bg-white p-6 rounded-lg border border-slate-200";

  const h = document.createElement("h2");
  h.className = "text-lg font-semibold mb-4";
  h.textContent = t("stepper.4.titel");
  root.appendChild(h);

  // Räume-Frage
  const raeumeBlock = document.createElement("div");
  raeumeBlock.className = "mb-6 space-y-2";
  raeumeBlock.appendChild(makeRadio(stateSig, "raeume_vorhanden", t("form.label.raeumeVorhanden")));
  raeumeBlock.appendChild(makeRadio(stateSig, "raeume_unentgeltlich", t("form.label.raeumeUnentgeltlich")));
  root.appendChild(raeumeBlock);

  // Belegtyp-Blocks
  const renderTyp = (typ: Belegtyp, titel: string) => {
    const block = document.createElement("div");
    block.className = "mb-6";
    const h3 = document.createElement("h3");
    h3.className = "font-medium mb-2";
    h3.textContent = titel;
    block.appendChild(h3);

    const list = document.createElement("div");
    block.appendChild(list);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "text-sm text-blue-700 hover:underline";
    addBtn.textContent = t("belegposition.hinzufuegen");
    addBtn.addEventListener("click", () => {
      const neu: BelegpositionEntry = {
        id: uuid(), belegtyp: typ, bezeichnung: "", betrag_euro: 0,
        file: null, file_hash: null,
      };
      stateSig.value = {
        ...stateSig.value,
        belegpositionen: [...stateSig.value.belegpositionen, neu],
      };
    });
    block.appendChild(addBtn);

    const summe = document.createElement("p");
    summe.className = "mt-2 text-right font-semibold text-sm";
    block.appendChild(summe);

    const update = () => {
      list.innerHTML = "";
      const items = stateSig.value.belegpositionen.filter((b) => b.belegtyp === typ);
      for (const pos of items) {
        list.appendChild(renderBelegpositionRow({
          position: pos,
          onChange: (next) => {
            stateSig.value = {
              ...stateSig.value,
              belegpositionen: stateSig.value.belegpositionen.map((b) =>
                b.id === pos.id ? next : b),
            };
          },
          onRemove: () => {
            stateSig.value = {
              ...stateSig.value,
              belegpositionen: stateSig.value.belegpositionen.filter((b) => b.id !== pos.id),
            };
          },
        }));
      }
      const sum = items.reduce((s, b) => s + b.betrag_euro, 0);
      summe.textContent = `${t(`summe.${typ}`)}: ${formatEuro(sum)}`;
    };
    update();
    stateSig.subscribe(update);

    return block;
  };

  // Miete-Block — nur sichtbar wenn nicht unentgeltlich
  const mieteBlock = renderTyp("miete", t("summe.miete").replace("Summe ", ""));
  const updateMieteVis = () => {
    mieteBlock.style.display = stateSig.value.raeume_unentgeltlich === "ja" ? "none" : "block";
  };
  updateMieteVis();
  stateSig.subscribe(updateMieteVis);
  root.appendChild(mieteBlock);

  root.appendChild(renderTyp("betriebskosten", t("summe.betriebskosten").replace("Summe ", "")));
  root.appendChild(renderTyp("personalkosten", t("summe.personalkosten").replace("Summe ", "")));

  // Grand-Total
  const total = document.createElement("p");
  total.className = "mt-6 text-right text-lg font-bold border-t border-slate-300 pt-3";
  const updateTotal = () => {
    const sum = stateSig.value.belegpositionen.reduce((s, b) => s + b.betrag_euro, 0);
    total.textContent = `${t("summe.gesamt")}: ${formatEuro(sum)}`;
  };
  updateTotal();
  stateSig.subscribe(updateTotal);
  root.appendChild(total);

  return root;
}

function makeRadio(
  stateSig: Signal<FormState>,
  key: "raeume_vorhanden" | "raeume_unentgeltlich",
  label: string,
): HTMLElement {
  const wrap = document.createElement("div");
  const lbl = document.createElement("p");
  lbl.className = "text-sm font-medium mb-1";
  lbl.textContent = label + " *";
  wrap.appendChild(lbl);

  for (const opt of ["ja", "nein"] as const) {
    const r = document.createElement("label");
    r.className = "inline-flex items-center mr-4 text-sm";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = key;
    input.value = opt;
    input.className = "mr-1";
    input.checked = stateSig.value[key] === opt;
    input.addEventListener("change", () => {
      stateSig.value = { ...stateSig.value, [key]: opt };
    });
    r.appendChild(input);
    r.appendChild(document.createTextNode(t(`form.option.${opt}`)));
    wrap.appendChild(r);
  }
  return wrap;
}
```

- [ ] **Step 2: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/steps/step4-kosten-belege.ts && git commit -m "feat(ue1): Step 4 — Kosten & Belege mit 3 Repeatern + Live-Summen + Grand-Total

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5.5: Step 5 — Programm-Flyer

**Files:**
- Create: `ue1/webformular/src/steps/step5-flyer.ts`

- [ ] **Step 1: Implementation**

`ue1/webformular/src/steps/step5-flyer.ts`:
```typescript
import type { Signal } from "../signals";
import type { FormState } from "../types";
import { t } from "../i18n";

export function renderStep5(stateSig: Signal<FormState>): HTMLElement {
  const root = document.createElement("section");
  root.className = "bg-white p-6 rounded-lg border border-slate-200";

  const h = document.createElement("h2");
  h.className = "text-lg font-semibold mb-4";
  h.textContent = t("form.label.anlage.programm") + " *";
  root.appendChild(h);

  const dropzone = document.createElement("label");
  dropzone.className = "block border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:bg-slate-50";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/pdf,image/jpeg,image/png";
  fileInput.className = "hidden";
  const status = document.createElement("p");
  status.className = "text-slate-600";

  const updateStatus = () => {
    const f = stateSig.value.programm_flyer;
    status.textContent = f
      ? `✓ ${f.name} (${(f.size / 1024).toFixed(0)} KB)`
      : "Datei wählen oder hierher ziehen";
  };
  updateStatus();
  stateSig.subscribe(updateStatus);

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0] ?? null;
    if (f && f.size > 10 * 1024 * 1024) {
      alert("Datei > 10 MB nicht erlaubt");
      return;
    }
    stateSig.value = { ...stateSig.value, programm_flyer: f };
  });

  dropzone.appendChild(fileInput);
  dropzone.appendChild(status);
  root.appendChild(dropzone);

  return root;
}
```

- [ ] **Step 2: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/steps/step5-flyer.ts && git commit -m "feat(ue1): Step 5 — Programm-Flyer Drop-Zone

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5.6: Step 6 — Übersicht & Senden

**Files:**
- Create: `ue1/webformular/src/steps/step6-uebersicht.ts`

- [ ] **Step 1: Implementation**

`ue1/webformular/src/steps/step6-uebersicht.ts`:
```typescript
import type { Signal } from "../signals";
import type { FormState } from "../types";
import { formatEuro, formatAdresse } from "../format";
import { t } from "../i18n";

export function renderStep6(
  stateSig: Signal<FormState>,
  onSubmit: () => Promise<void>,
): HTMLElement {
  const root = document.createElement("section");
  root.className = "bg-white p-6 rounded-lg border border-slate-200";

  const h = document.createElement("h2");
  h.className = "text-lg font-semibold mb-4";
  h.textContent = t("uebersicht.titel");
  root.appendChild(h);

  const list = document.createElement("div");
  list.className = "space-y-4 text-sm";
  root.appendChild(list);

  const renderSummary = () => {
    list.innerHTML = "";
    const s = stateSig.value;
    list.appendChild(sectionBlock(stateSig, 1, "Einrichtung & Träger", [
      `${s.name} · ${s.traeger} · Haushaltsjahr ${s.haushaltsjahr}`,
      formatAdresse(s.strasse, s.hausnummer, s.plz, s.ort),
    ]));
    list.appendChild(sectionBlock(stateSig, 2, "Kontakt & Bank", [
      `${s.ansprechpartner} · ${s.telefon}`,
      s.email,
      `${s.bankverbindung} · ${s.iban}${s.bic ? " · " + s.bic : ""}`,
    ]));
    const wp = s.oeffnungszeiten
      .filter((o) => o.oeffnungszeit.trim() || o.angebot.trim())
      .map((o) => `${o.wochentag.toUpperCase()} ${o.oeffnungszeit} ${o.angebot}`)
      .join(" · ");
    list.appendChild(sectionBlock(stateSig, 3, "Öffnungszeiten", [wp || "—"]));
    const sumByTyp = (typ: string) =>
      s.belegpositionen.filter((b) => b.belegtyp === typ).reduce((s, b) => s + b.betrag_euro, 0);
    const grand = s.belegpositionen.reduce((s, b) => s + b.betrag_euro, 0);
    list.appendChild(sectionBlock(stateSig, 4, "Kosten", [
      `Betriebskosten: ${formatEuro(sumByTyp("betriebskosten"))}`,
      `Personalkosten: ${formatEuro(sumByTyp("personalkosten"))}`,
      `Miete (Jahr): ${formatEuro(sumByTyp("miete"))}`,
      `Gesamt: ${formatEuro(grand)}`,
    ]));
    list.appendChild(sectionBlock(stateSig, 5, "Anlage", [
      s.programm_flyer?.name ?? "—",
    ]));
  };
  renderSummary();
  stateSig.subscribe(renderSummary);

  // Bestätigung
  const checkboxWrap = document.createElement("label");
  checkboxWrap.className = "mt-6 flex items-start gap-2";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = stateSig.value.bestaetigt;
  cb.addEventListener("change", () => {
    stateSig.value = { ...stateSig.value, bestaetigt: cb.checked };
  });
  checkboxWrap.appendChild(cb);
  const cbLbl = document.createElement("span");
  cbLbl.className = "text-sm";
  cbLbl.textContent = t("uebersicht.bestaetigung");
  checkboxWrap.appendChild(cbLbl);
  root.appendChild(checkboxWrap);

  // Submit-Button
  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "mt-4 w-full rounded-md bg-rose-700 px-4 py-2 text-white font-semibold hover:bg-rose-800 disabled:opacity-50";
  submitBtn.textContent = t("form.button.absenden");
  const updateBtn = () => {
    submitBtn.disabled = !stateSig.value.bestaetigt;
  };
  updateBtn();
  stateSig.subscribe(updateBtn);
  submitBtn.addEventListener("click", async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = "Wird gesendet …";
    try {
      await onSubmit();
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = t("form.button.absenden");
      alert("Fehler beim Absenden: " + (e as Error).message);
    }
  });
  root.appendChild(submitBtn);

  return root;
}

function sectionBlock(
  stateSig: Signal<FormState>,
  step: 1|2|3|4|5,
  title: string,
  lines: string[],
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "border border-slate-200 rounded p-3";
  const header = document.createElement("div");
  header.className = "flex justify-between items-center mb-2";
  const h = document.createElement("p");
  h.className = "font-medium";
  h.textContent = title;
  header.appendChild(h);
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "text-xs text-blue-700 hover:underline";
  edit.textContent = t("uebersicht.bearbeiten") + " →";
  edit.addEventListener("click", () => {
    stateSig.value = { ...stateSig.value, step };
  });
  header.appendChild(edit);
  wrap.appendChild(header);
  for (const ln of lines) {
    const p = document.createElement("p");
    p.className = "text-xs text-slate-700";
    p.textContent = ln;
    wrap.appendChild(p);
  }
  return wrap;
}
```

- [ ] **Step 2: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/steps/step6-uebersicht.ts && git commit -m "feat(ue1): Step 6 — Pre-Submit-Übersicht mit Edit-Sprung + Bestätigung

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 6 — Main + Submit-Integration

### Task 6.1: Edge Function submit-antrag erweitern

**Files:**
- Modify: `supabase/functions/submit-antrag/index.ts`

- [ ] **Step 1: Edge Function updaten**

Die bestehende Function nimmt heute ein JSON-Objekt + Files entgegen, schreibt antraege + anlagen. Erweitern auf:
- `belegpositionen[]` als JSON-Array (mit `file_hash` je Position)
- `oeffnungszeiten[]` als JSON-Array
- Hash-Dedupe: vor Upload prüfen, ob `anlagen.file_hash = X` existiert; wenn ja, ID wiederverwenden

Volle erweiterte Function in `supabase/functions/submit-antrag/index.ts`:
```typescript
// Erweitert um belegpositionen + oeffnungszeiten + Hash-Dedupe.
// Geht weiter mit direktem fetch an Kong (kein ESM-Import wegen Cold-Start).
//
// Erwartetes FormData:
//   - antrag: JSON-Blob {haushaltsjahr, name, ..., raeume_*, oeffnungszeiten[], belegpositionen[]}
//   - file_<sha256>: Binary für jede in belegpositionen referenzierte file_hash
//   - flyer: Programm-Flyer (separater Slot)

// Hinweis: Genaue Edge-Function-URL-Konvention + Kong-Header-Setup bleibt wie UE1 v1.
// (Plan-Ausführer: bestehende submit-antrag/index.ts als Vorlage nutzen,
//  diese Erweiterungen einbauen; Variablen für SUPABASE_URL und SERVICE_ROLE_KEY
//  aus Deno.env wie bisher.)

import { generateAntragsnummer } from "./antragsnummer.ts"; // bestehend

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface BelegpositionPayload {
  belegtyp: "betriebskosten" | "personalkosten" | "miete";
  bezeichnung: string;
  betrag_euro: number;
  file_hash: string | null;
}

interface OeffnungszeitPayload {
  wochentag: "mo" | "di" | "mi" | "do" | "fr" | "sa" | "so";
  oeffnungszeit: string;
  angebot: string;
}

interface AntragPayload {
  haushaltsjahr: number;
  name: string;
  traeger: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  bankverbindung: string;
  iban: string;
  bic: string | null;
  ansprechpartner: string;
  telefon: string;
  email: string;
  raeume_vorhanden: "ja" | "nein";
  raeume_unentgeltlich: "ja" | "nein";
  submitted_language: string;
  oeffnungszeiten: OeffnungszeitPayload[];
  belegpositionen: BelegpositionPayload[];
}

async function dbInsert(table: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": "apl2",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Insert ${table}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function dbSelect(table: string, query: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Accept-Profile": "apl2",
    },
  });
  if (!r.ok) throw new Error(`Select ${table}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function uploadFile(antragId: string, typ: string, file: File, hash: string): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${antragId}/${typ}__${hash.slice(0, 8)}.${ext}`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/antragsbelege/${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: file,
  });
  if (!r.ok) throw new Error(`Upload ${path}: ${r.status} ${await r.text()}`);
  return path;
}

async function ensureAnlage(antragId: string, typ: string, file: File, hash: string): Promise<string> {
  // Dedupe: existiert anlage mit diesem hash?
  const existing = await dbSelect("anlagen", `file_hash=eq.${hash}&select=id`);
  if (Array.isArray(existing) && existing.length > 0) return existing[0].id;

  const path = await uploadFile(antragId, typ, file, hash);
  const created = await dbInsert("anlagen", {
    antrag_id: antragId,
    typ,
    dateiname: file.name,
    groesse_bytes: file.size,
    mime_type: file.type || "application/octet-stream",
    storage_path: path,
    file_hash: hash,
  });
  return created[0].id;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const form = await req.formData();
    const antrag = JSON.parse(form.get("antrag") as string) as AntragPayload;

    // 1. Antrag einfügen
    const antragsnummer = await generateAntragsnummer();
    const created = await dbInsert("antraege", {
      antragsnummer,
      haushaltsjahr: antrag.haushaltsjahr,
      name: antrag.name,
      traeger: antrag.traeger,
      strasse: antrag.strasse,
      hausnummer: antrag.hausnummer,
      plz: antrag.plz,
      ort: antrag.ort,
      bankverbindung: antrag.bankverbindung,
      iban: antrag.iban.replace(/\s+/g, ""),
      bic: antrag.bic,
      ansprechpartner: antrag.ansprechpartner,
      telefon: antrag.telefon,
      email: antrag.email,
      raeume_vorhanden: antrag.raeume_vorhanden,
      raeume_unentgeltlich: antrag.raeume_unentgeltlich,
      antragsdatum: new Date().toISOString().slice(0, 10),
      submitted_language: antrag.submitted_language,
      user_agent: req.headers.get("user-agent"),
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0],
    });
    const antragId = created[0].id;

    // 2. Wochenplan
    if (antrag.oeffnungszeiten.length > 0) {
      const rows = antrag.oeffnungszeiten
        .filter((o) => o.oeffnungszeit.trim() || o.angebot.trim())
        .map((o) => ({ antrag_id: antragId, ...o }));
      if (rows.length > 0) await dbInsert("oeffnungszeit", rows);
    }

    // 3. Belegpositionen + Files (Hash-Dedupe)
    for (const pos of antrag.belegpositionen) {
      let anlageId: string | null = null;
      if (pos.file_hash) {
        const file = form.get(`file_${pos.file_hash}`) as File | null;
        if (file) {
          anlageId = await ensureAnlage(antragId, pos.belegtyp, file, pos.file_hash);
        }
      }
      await dbInsert("belegposition", {
        antrag_id: antragId,
        belegtyp: pos.belegtyp,
        bezeichnung: pos.bezeichnung,
        betrag_euro: pos.betrag_euro,
        anlage_id: anlageId,
      });
    }

    // 4. Programm-Flyer
    const flyer = form.get("flyer") as File | null;
    if (flyer) {
      const buf = await flyer.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      const hashHex = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      await ensureAnlage(antragId, "programm-altentagesstaette", flyer, hashHex);
    }

    return new Response(JSON.stringify({ antragsnummer, id: antragId }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "access-control-allow-origin": "*",
      },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "access-control-allow-origin": "*" },
    });
  }
});
```

- [ ] **Step 2: Edge Function auf VPS deployen**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "cd /root/supabase/docker && docker compose restart functions"
```
Hinweis: Edge Function liegt im Repo unter `supabase/functions/submit-antrag/`. Robert hat in UE1 das Deployment-Pattern etabliert (Source wird auf VPS in `/root/supabase/volumes/functions/submit-antrag/` gespiegelt, dann functions-Container restart). Falls anders strukturiert: bestehendes Deploy-Vorgehen aus UE1 wiederverwenden.

- [ ] **Step 3: Commit**

```bash
cd "$REPO" && git add supabase/functions/submit-antrag/index.ts && git commit -m "feat(supabase): submit-antrag v2 — Belegpositionen + Wochenplan + Hash-Dedupe

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 6.2: submit.ts — Frontend-Submit

**Files:**
- Create: `ue1/webformular/src/submit.ts`

- [ ] **Step 1: Implementation**

`ue1/webformular/src/submit.ts`:
```typescript
import type { FormState } from "./types";

const FUNCTION_URL = "https://verwaltung.butscher.cloud/functions/v1/submit-antrag";
const ANON_KEY = import.meta.env.VITE_ANON_KEY;

export async function submitAntrag(state: FormState): Promise<{ antragsnummer: string; id: string }> {
  const form = new FormData();

  const antragPayload = {
    haushaltsjahr: state.haushaltsjahr,
    name: state.name,
    traeger: state.traeger,
    strasse: state.strasse,
    hausnummer: state.hausnummer,
    plz: state.plz,
    ort: state.ort,
    bankverbindung: state.bankverbindung,
    iban: state.iban.replace(/\s+/g, ""),
    bic: state.bic.trim() || null,
    ansprechpartner: state.ansprechpartner,
    telefon: state.telefon,
    email: state.email,
    raeume_vorhanden: state.raeume_vorhanden!,
    raeume_unentgeltlich: state.raeume_unentgeltlich!,
    submitted_language: state.language,
    oeffnungszeiten: state.oeffnungszeiten.filter(
      (o) => o.oeffnungszeit.trim() || o.angebot.trim(),
    ),
    belegpositionen: state.belegpositionen.map((b) => ({
      belegtyp: b.belegtyp,
      bezeichnung: b.bezeichnung,
      betrag_euro: b.betrag_euro,
      file_hash: b.file_hash,
    })),
  };
  form.append("antrag", JSON.stringify(antragPayload));

  // Eindeutige Files (durch hash dedupliziert)
  const seen = new Set<string>();
  for (const pos of state.belegpositionen) {
    if (pos.file && pos.file_hash && !seen.has(pos.file_hash)) {
      form.append(`file_${pos.file_hash}`, pos.file, pos.file.name);
      seen.add(pos.file_hash);
    }
  }

  // Flyer
  if (state.programm_flyer) {
    form.append("flyer", state.programm_flyer, state.programm_flyer.name);
  }

  const r = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { apikey: ANON_KEY },
    body: form,
  });
  if (!r.ok) throw new Error(`Submit failed: ${r.status} ${await r.text()}`);
  return r.json();
}
```

- [ ] **Step 2: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/submit.ts && git commit -m "feat(ue1): submit.ts — FormData-Build mit Hash-deduplizierten Files

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 6.3: main.ts — Orchestrierung

**Files:**
- Modify: `ue1/webformular/src/main.ts`

- [ ] **Step 1: main.ts ersetzen**

`ue1/webformular/src/main.ts`:
```typescript
import "./styles.css";
import { signal } from "./signals";
import { initialState, isStepComplete } from "./state";
import { renderStepper } from "./stepper";
import { renderStep1 } from "./steps/step1-traeger";
import { renderStep2 } from "./steps/step2-kontakt-bank";
import { renderStep3 } from "./steps/step3-wochenplan";
import { renderStep4 } from "./steps/step4-kosten-belege";
import { renderStep5 } from "./steps/step5-flyer";
import { renderStep6 } from "./steps/step6-uebersicht";
import { submitAntrag } from "./submit";
import { setLanguage, t } from "./i18n";
import type { FormState, Sprache } from "./types";

const root = document.getElementById("app")!;
const state = signal<FormState>(initialState());
setLanguage(state.value.language);

// Layout: Header + Stepper + active Step + Nav
const header = document.createElement("header");
header.className = "py-4 border-b border-slate-200 bg-white sticky top-0 z-10";
const headerInner = document.createElement("div");
headerInner.className = "max-w-3xl mx-auto px-4 flex justify-between items-center";
const title = document.createElement("h1");
title.className = "font-semibold";
title.textContent = "APL 2 — Stadt Würzburg";
headerInner.appendChild(title);

// Sprach-Switcher
const langSel = document.createElement("select");
langSel.className = "text-sm rounded border border-slate-300 px-2 py-1";
for (const code of ["de","it","tr","es"] as Sprache[]) {
  const opt = document.createElement("option");
  opt.value = code;
  opt.textContent = code.toUpperCase();
  opt.selected = state.value.language === code;
  langSel.appendChild(opt);
}
langSel.addEventListener("change", () => {
  const lang = langSel.value as Sprache;
  setLanguage(lang);
  state.value = { ...state.value, language: lang };
  // Re-Render der aktuellen Step (Labels neu)
  state.value = { ...state.value }; // trigger
});
headerInner.appendChild(langSel);
header.appendChild(headerInner);
root.appendChild(header);

const main = document.createElement("main");
main.className = "max-w-3xl mx-auto p-4";
root.appendChild(main);

const stepper = renderStepper(state);
main.appendChild(stepper);

const stepContainer = document.createElement("div");
main.appendChild(stepContainer);

const nav = document.createElement("div");
nav.className = "mt-6 flex justify-between gap-2";
const backBtn = document.createElement("button");
backBtn.type = "button";
backBtn.className = "rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50";
backBtn.textContent = t("stepper.zurueck");
backBtn.addEventListener("click", () => {
  if (state.value.step > 1) state.value = { ...state.value, step: (state.value.step - 1) as FormState["step"] };
});
nav.appendChild(backBtn);
const nextBtn = document.createElement("button");
nextBtn.type = "button";
nextBtn.className = "rounded bg-blue-700 text-white px-4 py-2 text-sm hover:bg-blue-800 disabled:opacity-50";
nextBtn.textContent = t("stepper.weiter");
nextBtn.addEventListener("click", () => {
  if (state.value.step < 6) state.value = { ...state.value, step: (state.value.step + 1) as FormState["step"] };
});
nav.appendChild(nextBtn);
main.appendChild(nav);

const onSubmit = async () => {
  const result = await submitAntrag(state.value);
  // Bestätigungsseite
  main.innerHTML = "";
  const ok = document.createElement("div");
  ok.className = "bg-white p-6 rounded-lg border border-slate-200 text-center";
  ok.innerHTML = `
    <p class="text-2xl mb-3">✓</p>
    <h2 class="text-lg font-semibold mb-2">Antrag eingegangen</h2>
    <p>Ihre Antragsnummer: <strong>${result.antragsnummer}</strong></p>
    <p class="text-sm text-slate-500 mt-2">Sie erhalten eine Eingangsbestätigung per E-Mail.</p>
  `;
  main.appendChild(ok);
};

const renderActive = () => {
  stepContainer.innerHTML = "";
  let el: HTMLElement;
  switch (state.value.step) {
    case 1: el = renderStep1(state); break;
    case 2: el = renderStep2(state); break;
    case 3: el = renderStep3(state); break;
    case 4: el = renderStep4(state); break;
    case 5: el = renderStep5(state); break;
    case 6: el = renderStep6(state, onSubmit); break;
  }
  stepContainer.appendChild(el!);
  // Nav-Buttons enable/disable
  backBtn.disabled = state.value.step === 1;
  if (state.value.step === 6) {
    nextBtn.style.display = "none";
  } else {
    nextBtn.style.display = "inline-block";
    nextBtn.disabled = !isStepComplete(state.value.step, state.value);
  }
};

state.subscribe(renderActive);
renderActive();
```

- [ ] **Step 2: Commit**

```bash
cd "$REPO" && git add ue1/webformular/src/main.ts && git commit -m "feat(ue1): main.ts — Orchestrierung Stepper + Steps + Nav-Buttons + Submit

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 6.4: index.html anpassen

**Files:**
- Modify: `ue1/webformular/index.html`

- [ ] **Step 1: HTML auf Tailwind/Stepper anpassen**

`ue1/webformular/index.html`:
```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>APL 2 — Antrag</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Build + Test**

```bash
cd "$REPO/ue1/webformular" && npm test && npm run build
```
Expected: alle Tests grün, dist/ erzeugt.

- [ ] **Step 3: Commit**

```bash
cd "$REPO" && git add ue1/webformular/index.html && git commit -m "chore(ue1): index.html — entferne Inline-Styles, Tailwind kommt via styles.css

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 7 — Deploy + E2E

### Task 7.1: Lokaler Smoke-Test

- [ ] **Step 1: Dev-Server starten**

```bash
cd "$REPO/ue1/webformular" && npm run dev
```
- [ ] **Step 2: Browser-Test** — Robert öffnet `http://localhost:5173/DigitalisierungVerwaltung/ue1/webformular/`, geht durch alle 6 Steps, submitted Test-Antrag mit Test-PDFs, prüft Inbox in UE2.

### Task 7.2: GitHub-Pages-Deploy

- [ ] **Step 1: Push auf main triggert Pages-Workflow**

```bash
cd "$REPO" && git push origin main
```
- [ ] **Step 2: Workflow-Status prüfen**

```bash
gh run list --workflow=deploy-ue1.yml --limit=1
```
- [ ] **Step 3: Live-Smoke**

```bash
curl -ksI -m 10 https://swrobuts.github.io/DigitalisierungVerwaltung/ue1/webformular/ | head -3
```
Expected: HTTP/2 200, neuer HTML-Bundle.

### Task 7.3: End-to-End mit Robert

- [ ] **Step 1: Robert füllt Antrag aus** auf `https://swrobuts.github.io/DigitalisierungVerwaltung/ue1/webformular/` mit Test-Belegen (mehrere Positionen je Belegtyp).

- [ ] **Step 2: Eingangsbestätigung-Mail prüfen** im THWS-Posteingang (UE2 n8n-Pipeline triggert automatisch).

- [ ] **Step 3: Sachbearbeiter-View** auf `https://amt.butscher.cloud/` — Robert öffnet seinen Antrag, prüft:
  - Belegpositionen-Card zeigt alle Positionen mit Beträgen + Summen
  - Wochenplan-Card zeigt die 7 Wochentage korrekt
  - Status-Wechsel auf „In Prüfung" funktioniert

### Task 7.4: Roadmap-Update + Memory

- [ ] **Step 1: Roadmap-Spec § 3 Tabelle UE1-Zeile updaten**

In `docs/superpowers/specs/2026-05-17-roadmap-5-ue-digitalisierung-verwaltung.md`:
```markdown
| **1** | Intelligentes Webformular **v2 mit Belegen** | Stepper-basiertes Online-Formular; atomare Belegpositionen mit Inline-Upload, Live-Summen, Wochenplan-Tabelle, Pre-Submit-Übersicht; mehrsprachig (DE/IT/TR/ES) | Vite + TS + Tailwind 4 + Supabase | Demo + Mini-Hands-on |
```

Sektion am Ende ergänzen:
```markdown
**Spec-Update 2026-05-19**: UE1 v2 live (Stepper, Belegpositionen, Wochenplan).
Detail-Spec: `docs/superpowers/specs/2026-05-19-ue1-v2-belegezentriert-design.md`.
```

- [ ] **Step 2: Memory-Update**

In `~/.claude/projects/-Users-robert-Library-CloudStorage-OneDrive-Pers-nlich-Arbeit-THWS-Auswertungen-csv/memory/projekt_digitalisierung_verwaltung.md` am Ende ergänzen (nach dem UE2-Block):

```markdown
**UE1 v2 (2026-05-19):** Belegezentriertes Stepper-Formular auf GitHub Pages. 6 Steps (Träger, Kontakt+Bank, Wochenplan, Kosten+Belege, Flyer, Übersicht). State via Proxy-Signals (~20 LOC), Tailwind 4. Datenmodell-Konsequenz: apl2.belegposition + apl2.oeffnungszeit Tabellen, View apl2.antrag_mit_summen ersetzt die dropped Summen-Spalten, apl2.anlagen.file_hash für Dedupe. UE2 nutzt nun die View (useAntraege + useAntrag umgestellt). Edge Function submit-antrag v2 nimmt FormData mit JSON-Antrag + Hash-deduplizierten Files. Migrations 015 (additive), 016 (destructive) und 017 (additive).
```

- [ ] **Step 3: Commit**

```bash
cd "$REPO" && git add docs/superpowers/specs/2026-05-17-roadmap-5-ue-digitalisierung-verwaltung.md && git commit -m "docs(roadmap): UE1 v2 implementiert — Stepper + Belegpositionen + Wochenplan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" && git push origin main
```

---

## Self-Review

**Spec coverage check:**
- ✅ Stepper-Layout (§ 2.1) → Tasks 4.3 + 6.3
- ✅ Steps 1–6 (§ 2.2) → Tasks 5.1–5.6
- ✅ Live-Validation (IBAN, E-Mail, PLZ) → Tasks 3.3 + 5.1 + 5.2 (Field-Wrapper)
- ✅ Belegpositionen-Repeater + Inline-Upload + Hash-Dedupe → Tasks 4.2 + 5.4 + 6.1 + 6.2
- ✅ Wochenplan-Tabelle → Task 5.3
- ✅ Live-Summen + Grand-Total → Task 5.4 (in render-Logik)
- ✅ Bedingte Felder (BIC, Miete) → Tasks 5.2, 5.4
- ✅ Pre-Submit-Übersicht mit Edit-Sprung → Task 5.6
- ✅ DSGVO-Checkbox als Submit-Gate → Task 5.6
- ✅ Migration 015/016/017 → Tasks 1.1–1.3
- ✅ UE2-Anpassung auf View → Tasks 2.1–2.4
- ✅ Edge-Function-Erweiterung → Task 6.1
- ✅ E2E-Smoke mit Robert → Task 7.3
- ✅ Roadmap-Spec + Memory-Update → Task 7.4

**Type-Konsistenz:** `BelegpositionEntry` (Frontend) und `BelegpositionPayload` (Edge Function) sind bewusst getrennt: Frontend hat `file: File | null`, Edge Function hat nur `file_hash` (das File wird separat in FormData). `belegtyp` Union ist überall identisch (`betriebskosten | personalkosten | miete`). `Wochentag` als Union ist einheitlich.

**Placeholder-Scan:** Keine TBD/TODO im Plan. Eine Annahme zur Edge-Function-Deploy-Pipeline (Task 6.1 Step 2): „bestehendes UE1-Deploy-Vorgehen wiederverwenden". Plan-Ausführer kann ggf. die Memory-Notiz zur UE1-Persistenz konsultieren.

**Type-Konsistenz Cross-Check:** `BelegpositionRow` in `useAntrag.ts` (UE2) hat `belegtyp: "betriebskosten" | "personalkosten" | "miete"` — match mit `Belegtyp` in UE1-Frontend ✅. `OeffnungszeitRow` in UE2 hat `wochentag` als Union — match mit `Wochentag` in UE1 ✅.

---

## Execution Handoff

Plan complete und gespeichert unter `docs/superpowers/plans/2026-05-19-ue1-v2-belegezentriert.md`.

**Zwei Ausführungs-Optionen:**

**1. Subagent-Driven (empfohlen)** — Ich dispatche pro Task einen frischen Subagent (Implementer → Spec-Reviewer → Code-Quality-Reviewer), reviewe zwischen den Tasks. Bei den Phase-0/1-Tasks mit VPS-Operationen hole ich dein OK ab, bevor destructive Migration 016 läuft.

**2. Inline Execution** — Tasks laufen in dieser Session sequenziell mit Checkpoints nach jeder Phase.

Welche Variante?
