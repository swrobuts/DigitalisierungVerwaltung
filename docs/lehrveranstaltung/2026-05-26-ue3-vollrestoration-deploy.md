# UE3-Vollrestoration — Deploy-Anleitung

> Stand: 2026-05-26 nach Abschluss von Etappen B-G der UE3-Vollrestoration.
> Repo: branch `main`, letzter Commit: `c1289fdc3fd070b2d6cfe316727deb2739ba51b7`.

## 1. DB-Migrationen auf VPS anwenden

Auf deinem Mac:

```bash
cd "/Users/robert/Library/CloudStorage/OneDrive-Persönlich/Vorlesungen/Übergreifend/Fallstudien/DigitalisierungVerwaltung"
git pull origin main
rsync -avz supabase/migrations/070_*.sql supabase/migrations/071_*.sql supabase/migrations/072_*.sql \
  root@bot.butscher.cloud:/opt/pruefung/repo/supabase/migrations/
```

Auf der VPS via SSH:

```bash
ssh root@bot.butscher.cloud

# 1. Backup machen (defensiv)
docker exec supabase-db pg_dump -U postgres -d postgres -n apl > /root/backup_apl_$(date +%Y%m%d_%H%M%S).sql

# 2. Migrationen einspielen (in Reihenfolge)
docker exec -i supabase-db psql -U postgres -d postgres < /opt/pruefung/repo/supabase/migrations/070_apl_pruefprotokoll_pruefungen_doctree_restore.sql
docker exec -i supabase-db psql -U postgres -d postgres < /opt/pruefung/repo/supabase/migrations/071_apl_fb_iv_formloser_antrag.sql
docker exec -i supabase-db psql -U postgres -d postgres < /opt/pruefung/repo/supabase/migrations/072_apl_ahp_norm_statements_fb1_fb2_fb4.sql

# 3. PostgREST cache reload
docker exec supabase-db psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"

# 4. Verifikation
docker exec supabase-db psql -U postgres -d postgres -c "
select count(*) as n_pruefprotokoll from apl.pruefprotokoll;
select count(*) as n_pruefungen from apl.pruefungen;
select count(*) as n_doctree from apl.ahp_doctree;
select count(*) as n_norm_statements_per_fb, foerderbereich from apl.ahp_norm_statements group by foerderbereich order by foerderbereich nulls first;
"
```

Erwartet:
- pruefprotokoll: 0 (leer, aber Tabelle existiert)
- pruefungen: 0
- doctree: 0 (neu — kann später durch Doctree-Build gefüllt werden)
- norm-Statements pro FB: ~24 Total (10 programm-übergreifend, 6 FB I, 4 FB II, ~7 FB III aus 063, 4 FB IV)

## 2. UE3 + UE2 Container rebuild

UE3 hat 12 neue Components, UE1 + UE2 + pruefung-service haben kleine Anpassungen. Empfohlen: `docker compose build --no-cache` für UE2 + UE3 (frontend) und pruefung-service (backend).

```bash
# Auf Mac — Source-Code zur VPS rsynchen
cd "/Users/robert/Library/CloudStorage/OneDrive-Persönlich/Vorlesungen/Übergreifend/Fallstudien/DigitalisierungVerwaltung"
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='dist' --exclude='.turbo' --exclude='.vite' \
  pnpm-workspace.yaml package.json pnpm-lock.yaml \
  packages ue1 ue2 ue3 ue4 pruefung \
  root@bot.butscher.cloud:/opt/pruefung/repo/
```

Auf VPS:

```bash
ANON=$(grep '^ANON_KEY=' /root/supabase/docker/.env | cut -d= -f2)

# UE3 rebuild + restart
cd /opt/pruefung/repo/ue3/sachbearbeitung-ki/docker
printf "VITE_SUPABASE_URL=https://supabase.butscher.cloud\nVITE_SUPABASE_ANON_KEY=%s\n" "$ANON" > .env
nohup bash -c 'docker compose build --no-cache amt-ki-frontend && docker rm -f amt-ki-frontend && docker compose up -d amt-ki-frontend' > /tmp/ue3-build.log 2>&1 &
echo "UE3-Build PID: $!"

# UE2 rebuild + restart (parallel)
cd /opt/pruefung/repo/ue2/sachbearbeiter/docker
printf "VITE_SUPABASE_URL=https://supabase.butscher.cloud\nVITE_SUPABASE_ANON_KEY=%s\n" "$ANON" > .env
nohup bash -c 'docker compose build --no-cache amt-frontend && docker rm -f amt-frontend && docker compose up -d amt-frontend' > /tmp/ue2-build.log 2>&1 &
echo "UE2-Build PID: $!"

# pruefung-service rebuild (FB-IV-Validator + Agent-Tools angepasst)
cd /opt/pruefung
docker compose build --no-cache pruefung-service && docker compose up -d --force-recreate pruefung-service

# UE1 falls FB-IV-Upload deployment relevant (FB-IV-Bürger-Flow)
cd /opt/pruefung/repo/ue1/webformular/docker
nohup bash -c 'docker compose build --no-cache ue1-webformular && docker rm -f ue1-webformular && docker compose up -d ue1-webformular' > /tmp/ue1-build.log 2>&1 &
```

Warten bis fertig:
```bash
while ps -p <PID> > /dev/null 2>&1; do sleep 30; done; tail -5 /tmp/ue3-build.log
```

Plus Fast-Deploy-Volumes neu mit aktuellem dist befüllen (siehe scripts/setup-fast-deploy.sh — schon einmalig gemacht).

## 3. Smoketest

```bash
curl -sI https://ki.butscher.cloud/ | head -3
curl -sI https://sachbearbeiter.butscher.cloud/ | head -3
curl -sI https://antrag.butscher.cloud/ | head -3
curl -sI https://pruefung.butscher.cloud/api/health | head -3
```

Alle: HTTP/2 200 erwartet.

Anschließend manuell im Browser:
1. Login auf `https://ki.butscher.cloud/`
2. Antrag öffnen (z.B. FB-III-C-Demo)
3. Verifizieren: Stepper oben + AntragMetricsBar Hero + PruefungsCard rechts + BescheideListe + ZweitpruefungsCard + VorjahresVergleich + ExterneValidierungCard sichtbar
4. „Konformität per KI prüfen" klicken → Empfehlung erscheint nach ~10-30s mit Befunden + Doctree-Version-Stempel
5. „Bescheid erzeugen (bewilligt)" → PDF/DOCX-Download verfügbar in BescheideListe

## 4. Konzerne / offene Punkte

- **FB-IV-Storage-Edge-Function**: Beim FB-IV-Antrag landet das PDF im FormData unter `fb_iv_dokument`, aber die Edge-Function `submit-antrag` weiß davon noch nicht. Workaround: aktuell wird das PDF in `apl.anlagen` mit anlagentyp='sonstige' gespeichert (Standard-Mehrfach-Upload-Pfad). Saubere Lösung später: Edge-Function um Sonder-Behandlung `fb_iv_dokument` → `apl.fb_iv_freitext.dokument_path` ergänzen.
- **Doctree-Build**: `apl.ahp_doctree` ist nach Migration 070 leer. Backend `check_rag()` fängt das ab (siehe `if tree.get("children")` in main.py). Bei Bedarf später bauen mit `python -m pruefung.scripts.build_doctree --pdf materialien/wuerzburg-2026/ahp-foerderrichtlinie-2025-03-27.pdf --version v2026-05-26`.
- **Voyage-Embeddings**: nicht aktualisiert. Beeinflusst nur die Doctree-Navigation für AHP-Wortlaut-Popover.
- **ZweitpruefungsCard `useBekannteBearbeiter`-Hook**: nicht restauriert (lebt im git-history mit den anderen Hooks). Inline-Fallback ohne Vorschläge funktioniert.
