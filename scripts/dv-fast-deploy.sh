#!/usr/bin/env bash
#
# Fast-Deploy für DV-Frontends: lokal bauen + rsync zur VPS → <60 Sek live.
#
# Voraussetzungen (einmalig auf VPS, siehe scripts/setup-fast-deploy.sh):
#   - /opt/dv-dist/{ue2,ue3} existiert
#   - docker-compose.override.yml im jeweiligen UE-Verzeichnis aktiv
#   - amt-frontend / amt-ki-frontend Container nutzen Volume-Mount
#
# Nutzung:
#   ./scripts/dv-fast-deploy.sh ue2     # → sachbearbeiter.butscher.cloud
#   ./scripts/dv-fast-deploy.sh ue3     # → ki.butscher.cloud
#   ./scripts/dv-fast-deploy.sh both    # beide nacheinander
#
# Was passiert:
#   1. pnpm build im jeweiligen UE-Verzeichnis (~30 Sek)
#   2. rsync dist/ → root@bot.butscher.cloud:/opt/dv-dist/<ue>/ (~5 Sek)
#   3. KEIN Container-Restart nötig — nginx liest die neuen Files sofort

set -euo pipefail

VPS_USER="root"
VPS_HOST="bot.butscher.cloud"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

deploy_ue() {
  local UE=$1
  local DIR
  local SUBDIR
  case "$UE" in
    ue2) DIR="ue2/sachbearbeiter"; SUBDIR="ue2" ;;
    ue3) DIR="ue3/sachbearbeitung-ki"; SUBDIR="ue3" ;;
    *) echo "Unbekanntes UE: $UE (erlaubt: ue2 | ue3)"; exit 1 ;;
  esac

  cd "$REPO_ROOT/$DIR"

  # Vite inlined ENV-Vars zur Build-Zeit. Wenn .env fehlt oder ANON_KEY
  # leer ist, baut Vite klaglos — und die App crasht im Browser mit
  # "VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY müssen in .env stehen".
  # Drum hier hart prüfen, BEVOR wir bauen + nach VPS pushen.
  if [[ ! -f .env ]]; then
    echo "✖ .env fehlt in $DIR — kopiere .env.example und trage den ANON_KEY ein:" >&2
    echo "    cp $DIR/.env.example $DIR/.env" >&2
    echo "    ANON_KEY auf VPS: grep '^ANON_KEY=' /root/supabase/docker/.env" >&2
    exit 1
  fi
  if ! grep -q '^VITE_SUPABASE_ANON_KEY=eyJ' .env; then
    echo "✖ VITE_SUPABASE_ANON_KEY in $DIR/.env fehlt oder ist kein JWT (eyJ…)" >&2
    echo "  Lies den Wert: ssh $VPS_USER@$VPS_HOST 'grep ^ANON_KEY= /root/supabase/docker/.env'" >&2
    exit 1
  fi

  echo "▶ Building $UE …"
  pnpm build

  echo "▶ Syncing $UE → $VPS_HOST:/opt/dv-dist/$SUBDIR/ …"
  rsync -avz --delete dist/ "$VPS_USER@$VPS_HOST:/opt/dv-dist/$SUBDIR/"

  echo "✅ $UE live in <30 Sek."
}

case "${1:-}" in
  ue2|ue3) deploy_ue "$1" ;;
  both)    deploy_ue ue2; deploy_ue ue3 ;;
  ""|-h|--help)
    sed -n '2,/^set -euo/p' "$0" | sed 's/^# \?//'
    exit 0
    ;;
  *) echo "Unbekanntes Argument: $1"; exit 1 ;;
esac
