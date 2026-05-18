# UE1-Erweiterung: Persistenz via Supabase

**Stand:** 2026-05-18
**Autor:** swrobuts (mit Claude Opus 4.7)
**Repo:** https://github.com/swrobuts/DigitalisierungVerwaltung
**Vorgänger-Spec:** `2026-05-17-roadmap-5-ue-digitalisierung-verwaltung.md` (wird durch dieses Dokument punktuell überschrieben)

## 1. Vision

UE1 erhält eine vollständige Persistenz-Schicht: Anträge werden in einer PostgreSQL-Datenbank gespeichert, Anlagen (PDF / Bilder) in einem Storage-Bucket. Wir nutzen die **bereits existierende Supabase-Instanz** auf Roberts VPS (LVE-Cockpit-Stack), legen aber ein dediziertes Schema `apl2` an. Eine neue Subdomain `verwaltung.butscher.cloud` routet via Traefik auf den bestehenden `supabase-kong`-Container. Studierende können die identische Code-Basis mit einer eigenen Supabase-Cloud-Instanz betreiben.

Damit deckt UE1 jetzt die Stufen „Webformular + Persistenz" ab. UE2 wird auf den Sachbearbeiter-Workflow (Inbox, Status-Tracking, Magic-Link-Auth, Eingangsbestätigungs-Mail) verschoben.

**Setup-Entscheidung (revidiert 2026-05-18):** Zuerst war eine dedizierte zweite Supabase-Instanz geplant. Inspektion des VPS ergab: bestehende Instanz hat alles, was wir brauchen (Postgres, Auth, Storage, Edge Runtime, Studio, Kong). Schema-Trennung in einer Instanz ist genauso isoliert wie zwei Stacks (Postgres ist genau dafür gebaut) und spart ~4 GB RAM + doppelten Pflegeaufwand.

**Sicherheitskonsequenz** (kritisch): Bestehende Supabase ist aktuell rein intern (`http://supabase-kong:8000`). Wir exponieren sie nach außen. Damit wird RLS zur alleinigen Sicherheitsbarriere. **Vor dem Exponieren muss ein RLS-Audit der bestehenden Schemas (`lve`, `qs`, `public` etc.) stehen** — sonst öffnet der anon-Key Türen in fremde Daten. Phase 0 des Implementation-Plans behandelt das explizit als Gate.

## 2. Roadmap-Drift (zur Erinnerung)

Das ursprüngliche Reifegradmodell sah Persistenz erst in UE2 vor und UE1 explizit „ohne Backend" (Cliffhanger „Was passiert nach dem Absenden?"). Die heutige Spec-Entscheidung:

| | Vorher (2026-05-17) | Nachher (2026-05-18) |
|---|---|---|
| UE1 | Webformular, kein Backend | Webformular + Persistenz (DB + Storage) |
| UE2 | Persistenz + Eingangsbestätigung + Auth | **Neu:** Sachbearbeiter-Inbox + Status-Tracking + Magic-Link-Auth + Mail-Workflow |
| UE3–5 | Unverändert (Ontologie / RAG / Agent) | Unverändert |

Zusätzlich: `supabase/` wird **Top-Level** im Repo (geteilt über UE1–5), nicht UE1-spezifisch. Damit löst sich das „5 eigenständige Demos"-Prinzip zugunsten eines „wachsenden Showcase" — bewusste Spec-Korrektur.

## 3. Architektur (Direct Frontend → Edge Function → DB + Storage)

```
Browser                              Supabase (verwaltung.butscher.cloud)
  │                                      │
  │  POST /functions/v1/submit-antrag    │
  │  + JSON {antrag, anlagen[]}          │
  │  + Files (multipart)                 │
  │ ─────────────────────────────────▶   │ ─▶ Edge Function (Deno):
  │                                      │     1. Validiere Payload
  │                                      │     2. IP aus Request-Headers
  │                                      │     3. Insert apl2.antraege
  │                                      │     4. Upload Files in Bucket
  │                                      │     5. Insert apl2.anlagen-Rows
  │                                      │     6. Bei Fehler: full rollback
  │                                      │        (DELETE antrag + Storage-clean)
  │ ◀─ {antragsnummer} oder {error}      │
```

**Begründung Edge Function:** Liefert echte Server-side IP-Erfassung, echte Transaktionalität über DB+Storage (Service-Role-Key bleibt server-side), und passt zu Roberts Sauberkeit-vor-Geschwindigkeit-Präferenz.

**Frontend ruft NICHT direkt DB-Inserts auf** — anon-Key hat nur Read-Zugriff auf `apl2.form_translations` (für zukünftige Lokalisierung).

## 4. Repo-Struktur (Top-Level supabase/)

```
DigitalisierungVerwaltung/
├─ materialien/                       # (bestehend)
├─ supabase/                          # NEU — geteilt über alle UEs
│  ├─ migrations/
│  │  ├─ 001_schema_apl2.sql          # Schema + Tabellen + Trigger
│  │  ├─ 002_storage_belege.sql       # Bucket + Storage-Policies
│  │  ├─ 003_seed_translations.sql    # 41 Keys × 4 Sprachen
│  │  └─ 004_rls_policies.sql         # RLS für anon / service_role / future authenticated
│  ├─ functions/
│  │  └─ submit-antrag/
│  │     ├─ index.ts                  # Deno Edge Function
│  │     └─ deno.json
│  ├─ traefik-router-snippet.yml      # Labels für verwaltung.butscher.cloud → supabase-kong
│  ├─ kong-cors.yml                   # CORS-Plugin-Config (Origin allowlist für GH-Pages)
│  └─ README.md                       # Setup-Pfad VPS (bestehende Instanz nutzen) + Cloud (Studis)
├─ ue1/
│  ├─ folien/                         # (bestehend)
│  └─ webformular/
│     ├─ .env.example                 # NEU — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
│     ├─ src/
│     │  ├─ supabase.ts               # NEU — Supabase-Client (~20 Zeilen)
│     │  ├─ submit.ts                 # MODIFIED — ruft Edge Function statt clientseitige Nummer
│     │  └─ ... (rest unverändert)
│     └─ ... (rest unverändert)
├─ docs/superpowers/{specs,plans}/
└─ .github/workflows/
   ├─ deploy-ue1.yml                  # MODIFIED — ENV-Secrets im Build
   └─ ... (später deploy-edge-functions.yml etc.)
```

## 5. DB-Schema (apl2-Schema)

### Tabellen

```sql
create schema if not exists apl2;

create table apl2.antraege (
  id                          uuid primary key default gen_random_uuid(),
  antragsnummer               text unique not null,
  haushaltsjahr               int not null,
  name                        text not null,
  anschrift                   text not null,
  traeger                     text not null,
  bankverbindung              text not null,
  iban                        text not null,
  bic                         text,
  ansprechpartner             text not null,
  telefon                     text not null,
  email                       text not null,
  betriebskosten_vorjahr_euro numeric(12,2) not null,
  personalkosten_vorjahr_euro numeric(12,2) not null,
  raeume_vorhanden            text not null check (raeume_vorhanden in ('ja','nein')),
  raeume_unentgeltlich        text not null check (raeume_unentgeltlich in ('ja','nein')),
  monatliche_miete_euro       numeric(12,2) not null default 0,
  antragsdatum                date not null,
  -- Metadaten
  submitted_language          text not null check (submitted_language in ('de','it','tr','es')),
  submitted_at                timestamptz not null default now(),
  user_agent                  text,
  ip_address                  inet,
  status                      text not null default 'eingegangen'
);

create table apl2.anlagen (
  id            uuid primary key default gen_random_uuid(),
  antrag_id     uuid not null references apl2.antraege(id) on delete cascade,
  typ           text not null check (typ in
                  ('mietvertrag','programm-altentagesstaette',
                   'anlage-1-kostennachweis','personalkostenbelege')),
  dateiname     text not null,
  groesse_bytes bigint not null,
  mime_type     text not null,
  storage_path  text not null,
  uploaded_at   timestamptz not null default now()
);

create table apl2.form_translations (
  key         text not null,
  language    text not null check (language in ('de','it','tr','es')),
  value       text not null,
  updated_at  timestamptz not null default now(),
  primary key (key, language)
);
```

### Antragsnummer-Trigger

```sql
create or replace function apl2.set_antragsnummer() returns trigger language plpgsql as $$
declare
  kuerzel text;
begin
  kuerzel := upper(rpad(regexp_replace(coalesce(new.traeger,'XXX'),
                       '[^A-Za-zÄÖÜäöüß]','','g'), 3, 'X'));
  kuerzel := substr(kuerzel, 1, 3);
  new.antragsnummer := format('APL2-%s-%s-%s', new.haushaltsjahr, kuerzel,
                               upper(substr(md5(random()::text), 1, 6)));
  return new;
end;
$$;

create trigger trg_set_antragsnummer
  before insert on apl2.antraege
  for each row when (new.antragsnummer is null)
  execute function apl2.set_antragsnummer();
```

## 6. Storage + RLS

### Storage-Bucket

- Name: `antragsbelege`, **private**
- Erlaubte MIME-Types: `application/pdf`, `image/jpeg`, `image/png`
- Max. Datei-Größe: 10 MB
- Pfad-Schema: `<antrag-uuid>/<typ>__<filename>`

### RLS-Policies

```sql
alter table apl2.antraege          enable row level security;
alter table apl2.anlagen           enable row level security;
alter table apl2.form_translations enable row level security;

-- antraege/anlagen: NUR service_role kann INSERT (= über Edge Function).
-- anon und authenticated haben default-deny.
-- (SELECT/UPDATE/DELETE für Sachbearbeiter folgt in UE2 mit Auth.)

-- form_translations: anon darf SELECT (zukünftiges Live-Reload), Schreib-Rechte nur service_role.
create policy "anon kann translations lesen" on apl2.form_translations
  for select to anon using (true);
```

**Storage-Policies:** `antragsbelege`-Bucket INSERT nur für `service_role` (also Edge Function), SELECT nur für `authenticated` (UE2).

## 7. Edge Function `submit-antrag` (Sketch)

Datei `supabase/functions/submit-antrag/index.ts`:

```typescript
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "apl2" } }
);

serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const form = await req.formData();
  const antrag = JSON.parse(form.get("antrag") as string);
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0];

  // 1. INSERT antraege
  const { data: row, error } = await supabase.from("antraege").insert({
    ...antrag,  // Felder bereits snake_case vom Frontend
    user_agent: req.headers.get("user-agent"),
    ip_address: ip,
  }).select("id, antragsnummer").single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 2. Uploads + anlagen-Rows
  try {
    const fileEntries = [...form.entries()].filter(([k]) => k.startsWith("file__"));
    for (const [key, file] of fileEntries) {
      const typ = key.replace(/^file__/, "");
      const f = file as File;
      const path = `${row.id}/${typ}__${f.name}`;
      const up = await supabase.storage.from("antragsbelege")
        .upload(path, f, { contentType: f.type });
      if (up.error) throw up.error;
      const ins = await supabase.from("anlagen").insert({
        antrag_id: row.id, typ, dateiname: f.name,
        groesse_bytes: f.size, mime_type: f.type, storage_path: path,
      });
      if (ins.error) throw ins.error;
    }
  } catch (e) {
    // Full rollback
    await supabase.from("antraege").delete().eq("id", row.id);
    // Best-effort Storage-Cleanup
    const { data: files } = await supabase.storage.from("antragsbelege")
      .list(row.id);
    if (files) await supabase.storage.from("antragsbelege")
      .remove(files.map(f => `${row.id}/${f.name}`));
    return Response.json({ error: `Upload fehlgeschlagen: ${e.message}` }, { status: 500 });
  }

  return Response.json({ antragsnummer: row.antragsnummer });
});
```

CORS-Header sind im echten Code mitzuliefern (Vite-Dev-Origin + GitHub-Pages-Origin).

## 8. Frontend-Integration

### Neue Datei `src/supabase.ts`
```typescript
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function submitAntrag(antrag, files): Promise<{antragsnummer: string} | {error: string}> {
  const fd = new FormData();
  fd.append("antrag", JSON.stringify(toSnakeCase(antrag)));
  files.forEach(f => fd.append(`file__${f.typ}`, f.file, f.dateiname));
  const res = await fetch(`${url}/functions/v1/submit-antrag`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: fd,
  });
  return res.json();
}
```

### Submit-Flow (`main.ts`)
1. Validation (wie bisher)
2. Submit-Button → Spinner + disabled, Felder readonly
3. `submitAntrag(...)` await
4. Bei Erfolg: Bestätigungsseite mit echter Antragsnummer vom Server
5. Bei Fehler: Toast „Übermittlung fehlgeschlagen, bitte später erneut versuchen", Felder wieder editierbar
6. Files werden im Frontend als `File`-Objekte gehalten (nicht nur Metadaten wie bisher in `Anlage[]`) → kleine Anpassung in `attachments.ts`

### Tests

- `submit.ts` Logik (Snake-case-Mapping, FormData-Building) → Vitest pur
- `supabase.ts` Submit-Wrapper → Mock-`fetch` via `vi.spyOn`
- Edge Function `index.ts` → Deno-Tests (optional, in `supabase/functions/submit-antrag/test.ts`)
- Bestehende 30 Tests bleiben grün

## 9. Setup-Pfade

### Pfad A — Roberts VPS (bestehende Supabase, neue Subdomain)

**Voraussetzungen erfüllt:**
- ✅ DNS A-Record `verwaltung.butscher.cloud` → 72.61.83.18 (gleiche IP wie LVE)
- ✅ SSH-Zugang verifiziert: `ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud`
- ✅ Supabase-Stack läuft bereits: `supabase-db` (v15.8), `supabase-kong`, `supabase-auth`, `supabase-storage`, `supabase-edge-functions` (v1.70.3), Studio, Realtime, Meta, Analytics, Pooler
- ✅ Traefik v3.6.10 mit Resolver `mytlschallenge`, Netzwerk `root_default`
- ✅ Disk: 298 GB frei · RAM: 15 GB frei

**Vorgehen (im Implementation-Plan, Phase 0 = Gate, Phase 1 = Setup):**
1. **Phase 0 (Bestätigungs-Gate)**: Audit der bestehenden Postgres-Schemas auf RLS-Coverage. Auflisten aller Tabellen ohne RLS, Robert entscheidet pro Tabelle (Risiko durch externes Exponieren tragbar oder nicht). Falls Risiko: Kong-Routing-Filter, der externe Requests nur an Schema `apl2` durchlässt (Plugin oder Header-Routing).
2. Backup: `pg_dump` aller bestehenden Schemas + Snapshot der `docker-compose.yml`
3. Schema-Migrations einspielen (`psql` in `supabase-db`-Container)
4. Storage-Bucket `antragsbelege` via Studio/SQL erstellen
5. Edge Function `submit-antrag` in bestehende `supabase-edge-functions`-Runtime deployen
6. Traefik-Router-Block in `/root/docker-compose.yml` ergänzen → `verwaltung.butscher.cloud` → `supabase-kong:8000`
7. Kong-CORS-Plugin für GH-Pages-Origin + localhost-Dev-Origin aktivieren
8. `docker compose up -d` (nur die betroffenen Services neu)
9. Anon-Key + URL aus bestehender Instanz ablesen, `.env.local` befüllen, Smoke-Test

### Pfad B — Studis (supabase.com Cloud)

`supabase/README.md` Schritt-für-Schritt:
1. Konto auf supabase.com (Free-Tier), neues Projekt
2. SQL-Editor: 4 Migrations + Seed copy-paste
3. Bucket `antragsbelege` per Studio-UI anlegen (oder via SQL aus Migration 002)
4. Edge Function: `supabase login`, `supabase link --project-ref XXX`, `supabase functions deploy submit-antrag`
5. URL + Anon-Key in `.env.local`
6. `npm install && npm run dev`

## 10. Konsequenzen für UE2-5 (zu adressieren in späteren Specs)

- **UE2** wird neu: Sachbearbeiter-Inbox (Magic-Link-Auth via GoTrue), Status-Update, Eingangsbestätigungs-Mail via n8n. Liest aus `apl2.antraege` und `apl2.anlagen`.
- **UE3** Ontologie liest weiterhin aus DB, kann Cross-Antrag-Auswertungen machen
- **UE4** RAG-Dialog kann Antrags-Historie kontextualisieren
- **UE5** Agent orchestriert die ganze Verarbeitungskette

`materialien/`-Konzept (geteilt über UEs) wird strukturell durch `supabase/` (auch geteilt) erweitert.

## 11. Entscheidungen (Stand 2026-05-18, nach Spec-Review)

| # | Punkt | Entscheidung |
|---|-------|--------------|
| O1 | Translations zur Laufzeit aus DB oder build-time gebundled? | **build-time gebundled.** DB-Seed bleibt Source of Truth, Live-Reload erst wenn nötig. |
| O2 | UE1-Live-Deployment auf GitHub Pages erhalten? | **Ja.** ENV-Vars als GitHub-Secrets, im Vite-Build injiziert. |
| O3 | Cron-Cleanup für verwaiste Storage-Files? | **Nein.** Edge Function macht selbst Rollback. |
| O4 | UE1-Doku (01/02/03-md) anpassen? | **Ja.** „Was diese Stufe nicht löst" kürzer, neue Voraussetzungen (Supabase + DSGVO). |
| O5 | Roadmap-Spec (2026-05-17) updaten? | **Ja, als letzter Schritt** nach erfolgreicher Umsetzung. |
| O6 (neu) | RLS-Audit existierende Schemas vor Exponieren? | **Pflicht-Gate** in Plan-Phase 0. Bei nicht-RLS-Schemas Kong-Routing-Filter (whitelist `/rest/v1/apl2.*` für externes Routing). |

## 12. Nicht im Scope

- Keine Authentifizierung (kommt in UE2 für Sachbearbeiter; Bürger bleibt anon)
- Keine Eingangsbestätigung per Mail (UE2)
- Keine Sachbearbeiter-Sicht (UE2)
- Keine OCR-Extraktion der Belege (spätere UE)
- Keine Live-Translations-Reload vom DB (UE2/3 wenn nötig)
- Keine Multi-Tenant-Trennung (Würzburg bleibt einziger Mandant)
- Keine Backup/Disaster-Recovery-Strategie für die VPS-Instanz (Robert macht das mit seinem üblichen LVE-Cockpit-Pattern)

## 13. Akzeptanzkriterien

- [x] User hat O1–O5 entschieden (alle Defaults); zusätzlich O6 (RLS-Audit-Gate)
- [x] VPS-Infrastruktur sondiert (SSH, Container, Disk/RAM, Traefik, Subdomain)
- [x] Architektur-Revision: bestehende Supabase statt neuer Stack
- [x] Spec committed
- [ ] Nächster Schritt: Implementation-Plan via writing-plans, mit Phase 0 (RLS-Audit-Gate + Backup) als erste Task
- [ ] In Plan-Phase 0 wird vor jedem destruktiven VPS-Schritt Roberts OK eingeholt (kein LVE-Cockpit-Risiko)
