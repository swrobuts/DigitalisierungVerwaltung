#!/usr/bin/env bash
#
# Einmal-Setup auf der VPS: Volume-Mount-Verzeichnisse anlegen und
# initial mit dem aktuellen Container-Inhalt füllen, dann Container
# mit Override neu starten.
#
# Auf der VPS ausführen (root@bot.butscher.cloud):
#   bash setup-fast-deploy.sh
#
# Voraussetzung: docker-compose.override.yml liegen bereits in den
# UE-docker-Verzeichnissen (kommen vom git pull / rsync).

set -euo pipefail

REPO_ROOT="/opt/pruefung/repo"

echo "▶ Volume-Verzeichnisse anlegen …"
mkdir -p /opt/dv-dist/ue2 /opt/dv-dist/ue3
chmod 755 /opt/dv-dist /opt/dv-dist/ue2 /opt/dv-dist/ue3

echo "▶ Aktuellen dist-Inhalt aus laufenden Containern kopieren …"
docker cp amt-frontend:/usr/share/nginx/html/. /opt/dv-dist/ue2/ || \
  echo "  (amt-frontend Container fehlt — Volume bleibt leer, erster fast-deploy füllt es)"
docker cp amt-ki-frontend:/usr/share/nginx/html/. /opt/dv-dist/ue3/ || \
  echo "  (amt-ki-frontend Container fehlt — Volume bleibt leer, erster fast-deploy füllt es)"

echo "▶ Container mit Override neu starten …"
cd "$REPO_ROOT/ue2/sachbearbeiter/docker"
docker rm -f amt-frontend 2>/dev/null || true
docker compose up -d amt-frontend

cd "$REPO_ROOT/ue3/sachbearbeitung-ki/docker"
docker rm -f amt-ki-frontend 2>/dev/null || true
docker compose up -d amt-ki-frontend

echo
echo "✅ Setup fertig. Ab jetzt auf deinem Mac:"
echo "    ./scripts/dv-fast-deploy.sh ue3"
echo "    → Build + rsync, live in <60 Sek, kein docker rebuild."
