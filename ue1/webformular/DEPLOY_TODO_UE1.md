# UE1 Deploy-TODOs

## Edge Function `submit-antrag` v3 — manueller Deploy auf VPS

Die Function wurde im Repo neu geschrieben (Multi-FB, Schema `apl.*`).
Sie lebt unter `supabase/functions/submit-antrag/index.ts`.

**Deploy-Befehl (Pfad A — Roberts Self-Host):**

```bash
ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "mkdir -p /root/supabase/docker/volumes/functions/submit-antrag"

scp -i ~/.ssh/id_vps -P 22 \
  supabase/functions/submit-antrag/index.ts \
  supabase/functions/submit-antrag/deno.json \
  root@bot.butscher.cloud:/root/supabase/docker/volumes/functions/submit-antrag/

ssh -i ~/.ssh/id_vps -p 22 root@bot.butscher.cloud \
  "docker restart supabase-edge-functions"
```

## Frontend-Deploy

GH-Pages-Workflow ist pausiert (Phase 0.2). Bauen + committen reicht für
heute. Reaktivierung des Workflows passiert in Phase 8.

Lokaler Build-Output liegt unter `ue1/webformular/dist/`.

## ENV-Vars für Production-Build

```
VITE_SUPABASE_URL=https://verwaltung.butscher.cloud
VITE_SUPABASE_ANON_KEY=<aus /root/supabase/docker/.env auf VPS>
```

(Im GH-Pages-Workflow als Secrets setzen, sobald reaktiviert.)

## CORS

Wenn UE1 von einem anderen Origin als `https://swrobuts.github.io`
oder `http://localhost:5173/4173` getestet wird, in
`supabase/functions/submit-antrag/index.ts` das Array `ALLOWED_ORIGINS`
ergänzen und neu deployen.
