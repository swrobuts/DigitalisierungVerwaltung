# UE2 — Sachbearbeiter-Workflow

**Stand:** 2026-05-18 (nachmittags)
**Autor:** swrobuts (mit Claude Opus 4.7)
**Vorgänger-Spec:** `2026-05-17-roadmap-5-ue-digitalisierung-verwaltung.md` + `2026-05-18-ue1-persistenz-supabase.md`
**Status:** Entwurf zur Freigabe

## 1. Vision

UE2 schließt die zweite Hälfte des Antragsprozesses: aus „Bürger sendet einen Antrag" wird „Antrag landet beim Sachbearbeiter, wird bearbeitet, der Bürger bekommt eine Eingangsbestätigung". Stufe M des Workflow-Spektrums: Workflow als Datenmodell mit expliziter State-Maschine, Audit-Trail und Rollen — aber kein vollwertiges BPMS (Camunda kommt ggf. als 6. Modul).

Eine eigene Subdomain `amt.butscher.cloud` hostet die Sachbearbeiter-App. Sichtbare Trennung Bürger ↔ Verwaltung als didaktischer Reifegrad-Sprung.

## 2. Roadmap-Position

| | UE1 (live seit 2026-05-18) | UE2 (Spec dieses Dokument) |
|---|---|---|
| **Bürger sieht** | Bestätigungsseite mit Antragsnummer | + Eingangsbestätigungs-Mail im Posteingang |
| **Amt sieht** | nichts | Inbox mit allen Anträgen, kann Status ändern, sieht History |
| **Datenmodell** | `apl2.antraege`, `apl2.anlagen`, `apl2.form_translations` | + `apl2.workflow_transition`, `apl2.antrag_history`, `apl2.allow_email` |
| **Architektur** | GH-Pages-Frontend + Edge Function + DB | + Docker-Frontend auf `amt.butscher.cloud` + n8n-Mail-Workflow + Postgres-Trigger |

## 3. Architektur

```
                                        ┌─────────────────────────────┐
Bürger ───POST FormData───────────────► │ verwaltung.butscher.cloud   │ (UE1)
                                        │ /functions/v1/submit-antrag │
                                        └────────────┬────────────────┘
                                                     │
                                                     ▼
                                           apl2.antraege INSERT
                                                     │
                              ┌──────────────────────┼──────────────────────┐
                              ▼                      ▼                      ▼
                  log_initial_status          notify_n8n_on_…       (UE1-CASCADE
                  in antrag_history           via pg_net POST       in anlagen-Insert)
                                              an n8n-Webhook
                                                     │
                                                     ▼
                                      n8n.butscher.cloud/webhook/apl2-eingang
                                                     │
                                                     ▼
                                    Mail (Sprache: submitted_language) ──► Bürger



Sachbearbeiter ──Magic-Link-Login──► amt.butscher.cloud (React + Tailwind)
                                            │
                                            ▼
                                 supabase.butscher.cloud
                                       (PostgREST)
                                            │
                                            ▼
                                  apl2.antraege SELECT/UPDATE
                                  (RLS: Allowlist-Rolle nötig)
                                            │
                                            ▼
                                  trg_validate_status_transition
                                  trg_log_status_change → apl2.antrag_history
```

**Key-Idee Workflow als Datenmodell:** erlaubte Übergänge stehen in `apl2.workflow_transition`. Frontend liest die Tabelle und rendert dynamisch nur die erlaubten Folge-Status als Buttons. Postgres-Trigger validiert zusätzlich (Defense-in-Depth). → Pflegbar ohne Frontend-Deploy.

## 4. Repo-Struktur

```
DigitalisierungVerwaltung/
├─ supabase/                              # (bestehend, geteilt über UEs)
│  ├─ migrations/
│  │  ├─ 001…006_…                        # (bestehend)
│  │  ├─ 007_workflow_state_machine.sql   # NEU — State-Maschine + Trigger
│  │  ├─ 008_antrag_history.sql           # NEU — Audit-Trail
│  │  ├─ 009_sachbearbeiter_auth.sql      # NEU — allow_email + RLS-Policies
│  │  └─ 010_database_webhook.sql         # NEU — pg_net-Trigger → n8n
│  └─ webhooks/
│     └─ n8n-apl2-eingangsbestaetigung.json   # NEU — exportierter n8n-Workflow
└─ ue2/
   ├─ folien/                             # spätere UE2-PPT
   └─ sachbearbeiter/                     # React-App
      ├─ package.json                     # Vite + React 19 + Tailwind 4 + shadcn + @supabase/supabase-js
      ├─ vite.config.ts
      ├─ tailwind.config.ts
      ├─ tsconfig.json
      ├─ index.html
      ├─ src/
      │  ├─ main.tsx                      # Entry-Point
      │  ├─ App.tsx                       # Router (react-router-dom v7)
      │  ├─ pages/
      │  │  ├─ Login.tsx                  # Magic-Link-Anforderung
      │  │  ├─ AuthCallback.tsx           # Magic-Link-Redirect-Handler
      │  │  ├─ Inbox.tsx                  # Tabelle aller Anträge
      │  │  └─ AntragDetail.tsx           # Detail mit Aktions-Buttons + History
      │  ├─ components/                   # shadcn-Komponenten + eigene
      │  │  ├─ ui/                        # shadcn (button, table, dialog, badge, …)
      │  │  ├─ StatusBadge.tsx
      │  │  ├─ AnlageDownload.tsx
      │  │  └─ HistoryTimeline.tsx
      │  ├─ lib/
      │  │  ├─ supabase.ts                # Client mit Session-Auth
      │  │  ├─ workflow.ts                # Status-Konstanten + erlaubte Übergänge (Cache)
      │  │  └─ rls.ts                     # current_user_role-Helper
      │  ├─ hooks/
      │  │  ├─ useAuthGuard.ts            # Redirect zu /login wenn nicht authenticated
      │  │  ├─ useAntraege.ts             # Realtime-Subscription auf apl2.antraege
      │  │  └─ useAntrag.ts               # Einzelner Antrag + History
      │  └─ styles.css
      ├─ Dockerfile                       # Multi-Stage: Node-Build → Nginx-Unprivileged
      ├─ docker/
      │  ├─ docker-compose.yml            # Service amt-frontend + Traefik-Labels
      │  ├─ nginx.conf
      │  └─ .env.example
      ├─ tests/
      │  ├─ workflow.test.ts              # erlaubte-Übergänge-Logik
      │  ├─ StatusBadge.test.tsx
      │  └─ Inbox.test.tsx                # Filtering, Sortierung
      └─ README.md                        # Setup-Pfade VPS + Cloud-Studi-Variante
```

## 5. DB-Schema-Erweiterung

### Migration 007 — Workflow-State-Machine

```sql
create table apl2.workflow_transition (
  von_status  text not null,
  nach_status text not null,
  primary key (von_status, nach_status)
);

insert into apl2.workflow_transition (von_status, nach_status) values
  ('eingegangen', 'in_pruefung'),
  ('in_pruefung', 'rueckfrage'),
  ('in_pruefung', 'bewilligt'),
  ('in_pruefung', 'abgelehnt'),
  ('rueckfrage', 'in_pruefung');

grant select on apl2.workflow_transition to authenticated, anon;

alter table apl2.workflow_transition enable row level security;
create policy "everyone reads transitions" on apl2.workflow_transition
  for select to authenticated, anon using (true);

create or replace function apl2.validate_status_transition() returns trigger language plpgsql as $$
begin
  if old.status is distinct from new.status then
    if not exists (
      select 1 from apl2.workflow_transition
      where von_status = old.status and nach_status = new.status
    ) then
      raise exception 'Verbotener Status-Übergang: % → %', old.status, new.status
        using errcode = 'P0001', hint = 'Erlaubte Übergänge siehe apl2.workflow_transition';
    end if;
  end if;
  return new;
end $$;

create trigger trg_validate_status_transition
  before update of status on apl2.antraege
  for each row execute function apl2.validate_status_transition();
```

### Migration 008 — Audit-Trail

```sql
create table apl2.antrag_history (
  id            uuid primary key default gen_random_uuid(),
  antrag_id     uuid not null references apl2.antraege(id) on delete cascade,
  von_status    text,
  nach_status   text not null,
  geaendert_von text,
  geaendert_am  timestamptz not null default now(),
  kommentar     text
);

create index idx_antrag_history_antrag on apl2.antrag_history(antrag_id, geaendert_am desc);

create or replace function apl2.log_status_change() returns trigger language plpgsql as $$
begin
  insert into apl2.antrag_history (antrag_id, von_status, nach_status, geaendert_von, kommentar)
  values (new.id, old.status, new.status,
          coalesce(current_setting('request.jwt.claim.email', true), 'unknown'),
          current_setting('apl2.transition_kommentar', true));
  return new;
end $$;

create trigger trg_log_status_change
  after update of status on apl2.antraege
  for each row when (old.status is distinct from new.status)
  execute function apl2.log_status_change();

create or replace function apl2.log_initial_status() returns trigger language plpgsql as $$
begin
  insert into apl2.antrag_history (antrag_id, von_status, nach_status, geaendert_von)
  values (new.id, null, new.status, 'system (submit-antrag)');
  return new;
end $$;

create trigger trg_log_initial_status
  after insert on apl2.antraege
  for each row execute function apl2.log_initial_status();
```

### Migration 009 — Auth + RLS

```sql
create table apl2.allow_email (
  email      text primary key,
  rolle      text not null check (rolle in ('bearbeiter','vorgesetzter','admin')),
  notiz      text,
  created_at timestamptz not null default now()
);

create or replace function apl2.current_user_role() returns text language sql security definer as $$
  select rolle from apl2.allow_email
  where email = current_setting('request.jwt.claim.email', true)
  limit 1
$$;
grant execute on function apl2.current_user_role() to authenticated;

drop policy if exists "authenticated_select_all" on apl2.antraege;
create policy "sachbearbeiter_select" on apl2.antraege
  for select to authenticated using (apl2.current_user_role() is not null);

create policy "sachbearbeiter_update_status" on apl2.antraege
  for update to authenticated
  using (apl2.current_user_role() is not null)
  with check (apl2.current_user_role() is not null);

create policy "sachbearbeiter_select" on apl2.anlagen
  for select to authenticated using (apl2.current_user_role() is not null);

alter table apl2.antrag_history enable row level security;
create policy "sachbearbeiter_select_history" on apl2.antrag_history
  for select to authenticated using (apl2.current_user_role() is not null);

alter table apl2.allow_email enable row level security;
create policy "authenticated_select" on apl2.allow_email
  for select to authenticated using (apl2.current_user_role() is not null);
```

### Migration 010 — n8n-Webhook-Trigger

```sql
create extension if not exists pg_net with schema extensions;

create or replace function apl2.notify_n8n_on_antrag_insert() returns trigger language plpgsql as $$
declare
  webhook_url text;
begin
  webhook_url := current_setting('app.n8n_eingang_webhook', true);
  if webhook_url is null or webhook_url = '' then
    raise warning 'app.n8n_eingang_webhook nicht gesetzt — Webhook übersprungen';
    return new;
  end if;
  perform extensions.http_post(
    url := webhook_url,
    body := jsonb_build_object(
      'antragsnummer', new.antragsnummer,
      'name', new.name,
      'email', new.email,
      'submitted_language', new.submitted_language,
      'submitted_at', new.submitted_at
    )::text,
    headers := '{"content-type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  raise warning 'n8n-Webhook fehlgeschlagen: %', sqlerrm;
  return new;
end $$;

create trigger trg_notify_n8n_on_antrag_insert
  after insert on apl2.antraege
  for each row execute function apl2.notify_n8n_on_antrag_insert();
```

Webhook-URL wird **außerhalb der Migration** gesetzt (sensible Daten):
```sql
alter database postgres set app.n8n_eingang_webhook = 'https://n8n.butscher.cloud/webhook/apl2-eingang';
```

## 6. React-App `amt.butscher.cloud`

### Routen

| Route | Komponente | Auth |
|-------|-----------|------|
| `/` | Redirect | — |
| `/login` | `Login` | anon |
| `/auth/callback` | `AuthCallback` | anon (extrahiert Token) |
| `/inbox` | `Inbox` | authenticated + allowlist |
| `/antrag/:id` | `AntragDetail` | authenticated + allowlist |

### Auth-Flow

1. `/login` → Email-Input → `supabase.auth.signInWithOtp({email, options: {emailRedirectTo: 'https://amt.butscher.cloud/auth/callback'}})`
2. Mail mit Magic-Link → User klickt → Browser auf `/auth/callback`
3. Frontend extrahiert Token aus URL-Hash → `supabase.auth.setSession`
4. Pre-Check: `select rolle from apl2.allow_email where email = …` → null = Logout + Fehlermeldung
5. Erfolg → Redirect `/inbox`

### Inbox

shadcn `<Table>`:
- Spalten: Antragsnummer, Name (Einrichtung), Träger, Eingegangen, Status, Aktion
- Status-Badges farbcodiert
- Filter-Bar: Status-Multi-Select + Suche (Name/Antragsnummer)
- Realtime-Subscription via `supabase.channel('antraege').on('postgres_changes', …)`
- Default-Sortierung: `submitted_at desc`

### AntragDetail

Drei-Spalten- bzw. Card-Layout:

1. **Antragsdaten** (read-only): Träger, Einrichtung, Adresse zusammengesetzt, Bank/IBAN/BIC, Kosten, Räume, Datum, Sprache
2. **Anlagen**: Liste mit Typ-Label, Dateiname, Größe. Download via Storage-Signed-URL (1h Gültigkeit)
3. **Status + Aktion**: Aktueller Status als Badge. Erlaubte Folge-Status aus `workflow_transition` dynamisch als Buttons. Bei Klick → Dialog mit Kommentar-Input → UPDATE. Darunter: `HistoryTimeline` mit allen vergangenen Übergängen

### Stack

```jsonc
{
  "dependencies": {
    "react": "^19", "react-dom": "^19", "react-router-dom": "^7",
    "@supabase/supabase-js": "^2.45",
    "lucide-react": "^0.x"
  },
  "devDependencies": {
    "vite": "^6", "vitest": "^2", "@vitejs/plugin-react": "^4",
    "tailwindcss": "^4", "@tailwindcss/vite": "^4",
    "typescript": "^5", "@types/react": "…",
    "@testing-library/react": "…", "@testing-library/jest-dom": "…"
  }
}
```

shadcn/ui via CLI: `npx shadcn@latest init`, dann `npx shadcn@latest add button table card dialog badge input label select textarea`.

### Testing

- **Unit (vitest)**: `lib/workflow.ts` (`canTransition()`, `allowedTransitions(currentStatus)`), `lib/rls.ts` (Allowlist-Check-Logik)
- **Component (React Testing Library)**: `Inbox`-Filterung, `StatusBadge`-Farben, `AntragDetail`-Aktions-Buttons werden dynamisch gerendert
- **Smoke**: lokales `npm run dev` gegen `supabase.butscher.cloud`, manueller Klick-Test

## 7. n8n-Workflow: APL2-Eingangsbestätigung

**Trigger:** Webhook `POST /webhook/apl2-eingang`

**Nodes:**
1. **Webhook** (Trigger, Public)
2. **Switch** auf `$json.submitted_language` (4 Outputs: de/it/tr/es)
3. **4× SMTP-Send** (one per language, mit existierender Credential `CfjGjVrPcVvoNuWy`):
   - **DE:** Betreff „Ihr Antrag ist bei uns eingegangen: {{antragsnummer}}", Body HTML mit Anrede, Antragsnummer, Datum
   - **IT/TR/ES:** analog übersetzt

**Export** in `supabase/webhooks/n8n-apl2-eingangsbestaetigung.json` (n8n-Export-Format).

## 8. Deployment

### DNS (Robert manuell)
- A-Record `amt.butscher.cloud` → `72.61.83.18` (gleiche VPS-IP wie verwaltung/lve)

### VPS-Setup (Phase 0)
1. Backup: `/root/backups/<TS>-pre-ue2/` mit `pg_dumpall`
2. Klärung wo `/opt/amt-frontend` clonen — vermutlich neues Verzeichnis analog `/opt/lve-cockpit`
3. Docker-Compose-File für `amt-frontend` (Service + Traefik-Labels für `amt.butscher.cloud`, TLS via `mytlschallenge`, Netzwerk `root_default`)
4. `docker compose up -d --build amt-frontend`
5. TLS-Cert via Traefik (~30s)

### Supabase-Auth-Config
GoTrue muss `amt.butscher.cloud/auth/callback` als erlaubten Redirect kennen:
```bash
# /root/supabase/docker/.env
ADDITIONAL_REDIRECT_URLS=https://lve.butscher.cloud,https://amt.butscher.cloud
```
Plus `docker compose up -d auth` Restart.

### Allowlist-Seed (Robert manuell)
```sql
insert into apl2.allow_email (email, rolle, notiz) values
  ('robert.butscher@thws.de', 'admin', 'Owner');
```

### n8n-Workflow-Import
1. n8n-UI öffnen, Workflow importieren aus `supabase/webhooks/n8n-apl2-eingangsbestaetigung.json`
2. Webhook-URL ablesen
3. Auf VPS: `psql -c "alter database postgres set app.n8n_eingang_webhook = 'https://n8n.butscher.cloud/webhook/<id>/apl2-eingang';"`

## 9. Hands-on-Aufgabe für UE2 (Lehrveranstaltung)

Studis erweitern den Workflow um einen zusätzlichen Status **„eskaliert"** (z.B. Förderbetrag > 50k Euro → automatisch eskaliert):

1. SQL: zwei Zeilen in `apl2.workflow_transition` ergänzen (`in_pruefung → eskaliert`, `eskaliert → bewilligt`, `eskaliert → abgelehnt`)
2. Frontend: `StatusBadge` für „eskaliert" mit eigener Farbe ergänzen
3. Diskussion: wer darf eskaliert → bewilligen? Rollen-Modell wird relevant

Bonus für die Schnellen: einen 5. Sprach-Branch im n8n-Workflow ergänzen.

## 10. Entscheidungen (Stand 2026-05-18 nachmittags, nach Spec-Review)

| # | Punkt | Entscheidung |
|---|-------|--------------|
| O1 | n8n-SMTP-Credential | **Bestehende `CfjGjVrPcVvoNuWy` nutzen.** |
| O2 | GoTrue Redirect-URLs | **Ja, `amt.butscher.cloud` in `ADDITIONAL_REDIRECT_URLS` ergänzen + Auth-Container restart.** |
| O3 | Roadmap-Spec-Update | **Ja, am Ende nach erfolgreicher Umsetzung.** |
| O4 | n8n-Webhook-URL ablegen | **`alter database postgres set app.n8n_eingang_webhook = …`** — sensitiv, nicht ins Repo. |
| ✓ | DNS `amt.butscher.cloud` | **Erledigt** durch Robert: A-Record → 72.61.83.18 (verifiziert via `dig`). |

## 11. Nicht im Scope (gehört zu UE3+)

- Inhaltliche Prüfung gegen die Förderrichtlinie (Ontologie, UE3)
- Bescheid-PDF-Generierung
- Multi-Tenant / Mandanten-Trennung
- Workload-Verteilung (assignment_to-Feld)
- Rollen-spezifische Workflow-Übergänge (alle Allowlist-User dürfen alle erlaubten Übergänge)
- Volltextsuche
- Bürger-seitiges Status-Tracking (eigener Status-Link für Bürger)

## 12. Akzeptanzkriterien

- [x] User hat O1–O4 entschieden (alle Default-Vorschläge übernommen)
- [x] Spec ist committed
- [x] DNS `amt.butscher.cloud` ist gesetzt
- [ ] Nächster Schritt: Implementation-Plan via writing-plans, mit Phase 0 (Backup, GoTrue-Config) als erster Task
- [ ] Vor jedem destruktiven VPS-Schritt Robert-OK einholen
