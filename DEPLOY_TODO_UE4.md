# Deploy UE4 — `agent.butscher.cloud`

## Voraussetzungen

- DNS-A-Record für `agent.butscher.cloud` → IP des Traefik-VPS
- VPS hat `root_default`-Docker-Netzwerk + Traefik mit `mytlschallenge`-Resolver
- Backend-Container `pruefung-api` muss `ANTHROPIC_API_KEY` und
  `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` in der Env haben (für den
  neuen `/api/agent/chat`-Endpoint und das `submit_antrag`-Tool).

## Schritt 1 — Backend neu bauen

Der Endpoint `/api/agent/chat` ist neu. Backend-Container muss rebuildet
werden.

```bash
ssh vps
cd /opt/pruefung/repo            # oder wo das Repo auf dem VPS liegt
git pull origin main

cd pruefung/docker
docker compose build
docker compose up -d
docker compose logs -f pruefung-api | head -50
# Health-Check:
curl -fsS https://pruefung.butscher.cloud/api/health
```

Optional Smoke-Test des neuen Endpoints (mock-mäßig — ohne ANTHROPIC_API_KEY
wird er 500en, das ist OK als Existenz-Beweis):

```bash
curl -i -X POST https://pruefung.butscher.cloud/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"smoke","user_message":"hi","history":[],"current_draft":{}}'
# Erwartet: 200 mit assistant_message, ODER 500 mit Agent-Fehler:
# beides beweist, dass der Endpoint registriert ist.
```

## Schritt 2 — Frontend bauen + deployen

```bash
ssh vps
cd /opt/pruefung/repo

# Variante A: lokaler Docker-Build auf dem VPS
cd ue4/agent-portal/docker
cp .env.example .env
# .env editieren falls nötig (VITE_API_BASE)
docker compose build
docker compose up -d
docker compose logs -f ue4-agent-portal

# Variante B: lokal bauen, Image pushen (wenn Registry vorhanden)
# (nicht standardmäßig in diesem Repo verkabelt)
```

## Schritt 3 — Smoke-Test im Browser

1. https://agent.butscher.cloud öffnen
2. Empty-State-Begrüßung sollte erscheinen
3. „Wir wollen einen Besuchsdienst für Senior:innen aufbauen." schreiben
4. Sidebar sollte FB II anzeigen
5. Weiterführen: Einrichtungsname → E-Mail → IBAN → …
6. Bei „bitte einreichen" sollte eine Antragsnummer kommen (AHP-2026-II-XXXXXX)
7. In der Supabase-DB nachsehen, ob die Zeile in `apl.antraege` angekommen
   ist:
   ```sql
   select id, antragsnummer, foerderbereich, einrichtung, email, status
   from apl.antraege
   order by created_at desc
   limit 5;
   ```

## Bekannte Limitierungen (MVP für die VL)

- **Persistenz nur in `apl.antraege`**: FB-spezifische Detail-Tabellen
  (`fb_i_projekt`, `fb_ii_ehrenamt`, `fb_iii_variante`, …) werden NICHT
  vom Agent gefüllt — die Sachbearbeitung muss die Detail-Felder manuell
  übernehmen oder das später in UE5 ausbauen. Die fb-spezifischen Felder
  liegen aber im Tool-Trace der Konversation und können dort
  nachgelesen werden.
- **Keine Anlagen-Upload**: PDF-Anhänge (z.B. Helferliste) werden vom
  Agent nicht verarbeitet — Bürger müssen die wie bei UE1 separat
  hochladen oder per Mail nachreichen. (TODO UE5.)
- **Keine Auth**: jede:r kann anonym Anträge einreichen. Für Live-Betrieb
  müsste Magic-Link-Login analog UE3 vor das Chat-UI geschaltet werden.

## Rollback

```bash
# Backend zurück auf vorherigen Tag
cd /opt/pruefung/repo
git checkout <previous-sha>
cd pruefung/docker
docker compose up -d --build

# Frontend einfach abreißen
docker compose down --remove-orphans
```

## CORS

`agent.butscher.cloud` ist bereits in der `allow_origins`-Liste in
`pruefung/src/pruefung/main.py` eingetragen — kein separater Schritt nötig.
