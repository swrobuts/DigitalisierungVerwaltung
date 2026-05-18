# Supabase-Setup für DigitalisierungVerwaltung

Das Schema `apl2` und der Storage-Bucket `antragsbelege` werden über alle UEs hinweg geteilt.
Edge Function `submit-antrag` ist der einzige Schreib-Endpoint für das Frontend.

## Architektur (in Betrieb)

```
Browser
  ↓ POST FormData
Traefik (verwaltung.butscher.cloud + PathPrefix /functions/v1/submit-antrag)
  ↓
Kong (supabase-kong:8000)
  ↓
Edge Runtime (supabase-edge-functions:9000/submit-antrag)
  ↓ direkter fetch
PostgREST (apl2.antraege + apl2.anlagen) + Storage (antragsbelege)
```

## Pfad A — Roberts Self-Hosted Instanz (`verwaltung.butscher.cloud`)

Bestehende Supabase-Instanz auf `bot.butscher.cloud` wird genutzt — nicht neu aufgesetzt.

1. **DB-Migrations** (per psql im supabase-db-Container):
   ```bash
   for f in 001_schema_apl2 002_storage_belege 003_seed_translations 004_rls_policies 005_pgrst_apl2_schema; do
     scp -i ~/.ssh/id_vps -P 22 supabase/migrations/${f}.sql root@bot.butscher.cloud:/tmp/
     ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
       "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 < /tmp/${f}.sql"
   done
   ```
2. **Edge Function deployen** (Bind-Mount-Kopie):
   ```bash
   ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "mkdir -p /root/supabase/docker/volumes/functions/submit-antrag"
   scp -i ~/.ssh/id_vps -P 22 \
     supabase/functions/submit-antrag/index.ts \
     supabase/functions/submit-antrag/deno.json \
     root@bot.butscher.cloud:/root/supabase/docker/volumes/functions/submit-antrag/
   ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "docker restart supabase-edge-functions"
   ```
3. **Traefik-Router** (Labels am supabase-kong-Service in `/root/supabase/docker/docker-compose.yml`,
   siehe `supabase/traefik-router-snippet.yml` für das Snippet — PathPrefix-Filter schützt die LVE-Daten):
   ```bash
   ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud "cd /root/supabase/docker && docker compose up -d kong"
   ```
4. **Anon-Key + URL** aus `/root/supabase/docker/.env` ablesen, in GitHub-Secrets als
   `VITE_SUPABASE_URL` (`https://verwaltung.butscher.cloud`) und `VITE_SUPABASE_ANON_KEY` setzen.

## Pfad B — Eigene supabase.com Cloud-Instanz (Studis)

1. **Account anlegen** auf https://supabase.com (Region: `eu-central-1` für DSGVO-Bewusstsein),
   neues Projekt erstellen.
2. **SQL-Editor öffnen**, nacheinander einspielen:
   - `migrations/001_schema_apl2.sql`
   - `migrations/002_storage_belege.sql`
   - `migrations/003_seed_translations.sql`
   - `migrations/004_rls_policies.sql`
3. **Exposed Schemas**: Studio → Project Settings → API → „Exposed schemas" → `apl2` ergänzen.
   (Migration 005 erübrigt sich bei Cloud — das macht Studio direkt.)
4. **Edge Function deployen** via Supabase-CLI:
   ```bash
   npm install -g supabase
   supabase login
   supabase link --project-ref <dein-projekt-ref>
   cp -r supabase/functions/submit-antrag .supabase/functions/  # je nach CLI-Version
   supabase functions deploy submit-antrag --no-verify-jwt
   ```
5. **CORS-Origins** im Studio (Edge Functions → submit-antrag → Settings):
   - `https://swrobuts.github.io`
   - `http://localhost:5173`
   - `http://localhost:4173`
6. **URL + Anon-Key** unter Settings → API ablesen.
7. **`.env.local`** in `ue1/webformular/`:
   ```
   VITE_SUPABASE_URL=https://<projekt-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<ablesen>
   ```
8. **Dev starten**: `cd ue1/webformular && npm install && npm run dev`

## Schema-Übersicht

- `apl2.antraege` — Hauptantrag (UUID-PK, Antragsnummer per Trigger generiert)
- `apl2.anlagen` — Belege (1:n zu antraege, CASCADE bei delete)
- `apl2.form_translations` — Übersetzungen DE/IT/TR/ES (Source of Truth für Labels)
- Storage-Bucket `antragsbelege` — privat, 10 MB Limit, PDF/JPEG/PNG erlaubt

## RLS-Kurzüberblick

- `anon`: SELECT auf `form_translations` (für künftiges Live-Reload), sonst NICHTS
- `service_role`: alles (Edge Function nutzt service_role intern via Kong)
- `authenticated`: kommt in UE2 (Sachbearbeiter-Auth mit Magic-Link)

## Bekannte Limitationen (Lehr-Demo)

- IP-Erfassung in der Function nutzt `x-real-ip` / `x-forwarded-for`. In der aktuellen Self-Host-
  Topologie zeigt die DB die Kong-Container-IP (nicht echte Bürger-IP). In Produktion: Traefik
  mit `X-Forwarded-For`-Forwarding konfigurieren ODER Edge Function vorlagern.
- Translations werden zur Build-Zeit gebundled, nicht zur Laufzeit aus DB geladen. DB-Tabelle ist
  Source of Truth für Migration; bei Änderungen muss der `translations.ts`-Bundle neu generiert
  werden (siehe `migrations/_generate_003.mjs`).
- Cross-Field-Validation (z.B. „Miete > 0 → Mietvertrag erforderlich") ist NUR client-seitig
  implementiert. Server-side (Edge Function) wiederholt das nicht. In Produktion: in die Edge
  Function spiegeln.
