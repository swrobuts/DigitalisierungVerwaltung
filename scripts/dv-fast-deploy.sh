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

  echo "▶ Building $UE …"
  cd "$REPO_ROOT/$DIR"
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
