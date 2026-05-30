#!/usr/bin/env bash
# Supabase Pool-Tuning für stabile Performance unter Multi-Schema-Last.
#
# Das Problem (beobachtet 2026-05-30): nach Tagen Uptime sammeln sich
# bei PostgREST und GoTrue hängende DB-Connections, der Pool füllt
# sich, Schema-Cache-Reloads laufen ins Acquisition-Timeout (Default
# 10s), Frontend bekommt PGRST002 / 504, User sehen „Cockpit lädt
# nicht / Magic-Link kaputt". Reboot hilft kurzfristig, aber das
# Problem kehrt zurück.
#
# Das Skript setzt die DB-Pool-Größen + Timeouts für beide Dienste
# großzügig und stellt sicher, dass selbst bei stoßweisem Cache-Reload
# parallel App-Queries bedient werden können. Idempotent — kann beliebig
# oft laufen.
#
# Voraussetzung: läuft als root auf der VPS, im Verzeichnis mit der
# /root/supabase/docker/.env-Datei.

set -euo pipefail

ENV_FILE=/root/supabase/docker/.env
COMPOSE_DIR=/root/supabase/docker

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✖ $ENV_FILE nicht gefunden — bist du auf der richtigen Maschine?" >&2
  exit 1
fi

echo "▶ Backup der aktuellen .env nach $ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"

# upsert_env KEY VALUE — setzt KEY=VALUE in der .env (ersetzt vorhandenen
# Eintrag oder hängt am Ende an).
upsert_env() {
  local key=$1 value=$2
  if grep -q "^${key}=" "$ENV_FILE"; then
    # macOS sed braucht -i '', GNU sed -i — VPS ist Ubuntu, GNU-sed.
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    echo "  ↻ ${key} aktualisiert"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
    echo "  + ${key} hinzugefügt"
  fi
}

echo
echo "▶ PostgREST Pool-Tuning (verhindert PGRST002 bei Cache-Reload)"
# 20 Connections im Pool — doppelt so viel wie Default 10. Schema-Cache-
# Reload und parallele App-Queries blockieren sich nicht mehr.
upsert_env PGRST_DB_POOL 20
# Acquisition-Timeout 60s statt Default 10s — App-Queries warten lieber
# kurz, statt mit PGRST002 abzubrechen.
upsert_env PGRST_DB_POOL_ACQUISITION_TIMEOUT 60
# Max-Rows als Safety-Net (Default unlimited — wir cap'en bei 10000,
# verhindert dass eine kaputte Query die DB plattmacht).
upsert_env PGRST_DB_MAX_ROWS 10000

echo
echo "▶ GoTrue Pool-Tuning (verhindert 504 beim Magic-Link)"
# GoTrue hat per Default unbegrenzte Pool-Size — schlecht, ein Leak
# trinkt alle DB-Connections. 25 ist großzügig + bounded.
upsert_env GOTRUE_DB_MAX_POOL_SIZE 25
upsert_env GOTRUE_DB_MAX_IDLE_TIME 300s
upsert_env GOTRUE_DB_HEALTH_CHECK_PERIOD 30s

echo
echo "▶ Statement-Timeout DB-weit auf 5min (für reserved roles)"
docker exec supabase-db psql -U postgres -c "ALTER DATABASE postgres SET statement_timeout = '5min';" >/dev/null
echo "  ↻ ALTER DATABASE postgres SET statement_timeout = '5min'"

# Authenticator-Rolle (PostgREST) — eigene Erhöhung, hat Vorrang.
docker exec supabase-db psql -U postgres -c "ALTER ROLE authenticator SET statement_timeout = '5min';" >/dev/null
echo "  ↻ ALTER ROLE authenticator SET statement_timeout = '5min'"

echo
echo "▶ Container neu starten, damit ENV-Änderungen greifen"
echo "  WICHTIG: --no-deps verwenden, sonst reißt das unhealthy supabase-analytics"
echo "  den halben Stack mit runter (Lektion vom 2026-05-30)."
cd "$COMPOSE_DIR"
docker compose up -d --no-deps rest auth

echo
echo "▶ Warte 10s, dann verify"
sleep 10
docker logs supabase-rest --tail 8 2>&1 | grep -E 'Schema cache|Connection Pool|Listening|Failed' || true
echo "---"
curl -s -m 5 -w "Auth-Health: HTTP %{http_code} · %{time_total}s\n" -o /dev/null \
  https://supabase.butscher.cloud/auth/v1/settings \
  -H "apikey: $(grep '^ANON_KEY=' "$ENV_FILE" | cut -d= -f2)"

echo
echo "✅ Pool-Tuning abgeschlossen. Backup: $ENV_FILE.bak-*"
