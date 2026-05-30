#!/usr/bin/env bash
# Watchdog-Cronjob für die Supabase-Stack-Apps.
#
# Was passiert:
#   - alle 5min ein Healthcheck gegen die kritischen Endpoints
#   - Bei 2 Failures hintereinander (Brücke gegen Flakeyness): den
#     betroffenen Container automatisch restarten
#   - Logs in /var/log/supabase-watchdog.log mit logrotate
#   - Bei Restart wird einmalig eine Notification-Datei geschrieben
#     (/var/log/supabase-watchdog-alerts/), damit du beim nächsten
#     SSH-Login sofort siehst, dass was war
#
# Installiert sich selbst als systemd-Timer (sauberer als crontab).
# Idempotent — kann mehrfach laufen.

set -euo pipefail

WATCHDOG_BIN=/usr/local/bin/supabase-watchdog.sh
SYSTEMD_DIR=/etc/systemd/system
LOG_DIR=/var/log
ALERT_DIR=/var/log/supabase-watchdog-alerts

mkdir -p "$ALERT_DIR"

echo "▶ Schreibe Watchdog-Skript nach $WATCHDOG_BIN"
cat > "$WATCHDOG_BIN" <<'WATCHDOG'
#!/usr/bin/env bash
# Supabase Watchdog — prüft kritische Endpoints und restartet bei
# anhaltenden Failures. Zustand in /tmp/supabase-watchdog-state/
# (jede Endpoint-Sonde hat ihren eigenen Failure-Counter).

set -u
LOG=/var/log/supabase-watchdog.log
STATE_DIR=/tmp/supabase-watchdog-state
ALERT_DIR=/var/log/supabase-watchdog-alerts
mkdir -p "$STATE_DIR" "$ALERT_DIR"

ANON_KEY=$(grep '^ANON_KEY=' /root/supabase/docker/.env 2>/dev/null | cut -d= -f2 || echo "")

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

# probe NAME URL CONTAINER [extra-curl-arg...]
# Bei 2 Failures in Folge: Container restarten + Alert schreiben.
probe() {
  local name=$1 url=$2 container=$3 ; shift 3
  local state_file="$STATE_DIR/$name"
  local fails=$(cat "$state_file" 2>/dev/null || echo 0)

  local http
  http=$(curl -s -o /dev/null -m 8 -w "%{http_code}" "$@" "$url" || echo "000")

  # 200, 401, 404 sind „API antwortet" — alles ist OK für reine
  # Health-Sondierung. 5xx, 000 (Timeout) sind Failures.
  if [[ "$http" =~ ^(2|4)[0-9][0-9]$ ]]; then
    if [[ "$fails" -gt 0 ]]; then
      log "OK $name HTTP=$http (war $fails× failed, jetzt wieder gesund)"
    fi
    echo 0 > "$state_file"
    return 0
  fi

  fails=$((fails + 1))
  echo "$fails" > "$state_file"
  log "FAIL $name HTTP=$http fail-count=$fails"

  if [[ "$fails" -ge 2 ]]; then
    log "RESTART $container (nach $fails consecutive failures)"
    docker restart "$container" >> "$LOG" 2>&1 || true
    echo 0 > "$state_file"
    # Alert-Datei für nächsten SSH-Login
    echo "$(date) — $container automatisch restartet (Probe $name HTTP=$http)" \
      >> "$ALERT_DIR/$(date +%Y-%m-%d).log"
  fi
}

# Probe-Liste — Reihenfolge wichtig (DB vor Apps)
probe pg "http://localhost:5432" supabase-db -X HEAD  # nur connect-test
# Kong ist API-Gateway zwischen Traefik und allen Backends. Wenn Kong
# intern auf Port 8000 nicht antwortet (Lektion 2026-05-30: liefert
# 500/404 obwohl Container "healthy"), restartet der Watchdog ihn.
# Test via Container-Exec, weil Kong nicht direkt erreichbar von außen.
probe_kong() {
  local state_file="$STATE_DIR/kong"
  local fails=$(cat "$state_file" 2>/dev/null || echo 0)
  if docker exec supabase-kong wget -q --spider -T 5 http://localhost:8000/auth/v1/health 2>/dev/null; then
    [[ "$fails" -gt 0 ]] && log "OK kong (war $fails× failed)"
    echo 0 > "$state_file"
    return 0
  fi
  # Kong-Health-Endpoint existiert nicht — wir nehmen Settings (HTTP 200/401 sind beide OK)
  local http=$(docker exec supabase-kong wget -qO- -T 5 -S http://localhost:8000/auth/v1/settings 2>&1 | grep -oE 'HTTP/[0-9.]+ [0-9]+' | head -1 | awk '{print $2}')
  if [[ "$http" =~ ^(2|4)[0-9][0-9]$ ]]; then
    [[ "$fails" -gt 0 ]] && log "OK kong HTTP=$http (war $fails× failed)"
    echo 0 > "$state_file"
    return 0
  fi
  fails=$((fails + 1))
  echo "$fails" > "$state_file"
  log "FAIL kong HTTP=${http:-no-response} fail-count=$fails"
  if [[ "$fails" -ge 2 ]]; then
    log "RESTART supabase-kong (nach $fails consecutive failures)"
    docker restart supabase-kong >> "$LOG" 2>&1 || true
    echo 0 > "$state_file"
    echo "$(date) — supabase-kong automatisch restartet (Kong-intern unerreichbar)" \
      >> "$ALERT_DIR/$(date +%Y-%m-%d).log"
  fi
}
probe_kong
probe auth https://supabase.butscher.cloud/auth/v1/settings supabase-auth \
  -H "apikey: $ANON_KEY"
probe rest "https://supabase.butscher.cloud/rest/v1/" supabase-rest \
  -H "apikey: $ANON_KEY"
WATCHDOG
chmod +x "$WATCHDOG_BIN"

echo "▶ systemd-Service + Timer"
cat > "$SYSTEMD_DIR/supabase-watchdog.service" <<EOF
[Unit]
Description=Supabase health watchdog
After=docker.service

[Service]
Type=oneshot
ExecStart=$WATCHDOG_BIN
EOF

cat > "$SYSTEMD_DIR/supabase-watchdog.timer" <<EOF
[Unit]
Description=Run supabase-watchdog every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Unit=supabase-watchdog.service

[Install]
WantedBy=timers.target
EOF

echo "▶ logrotate-Konfig"
cat > /etc/logrotate.d/supabase-watchdog <<EOF
/var/log/supabase-watchdog.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    create 0640 root root
}
EOF

echo "▶ Timer aktivieren"
systemctl daemon-reload
systemctl enable --now supabase-watchdog.timer

echo
echo "▶ Erster manueller Lauf"
$WATCHDOG_BIN
tail -5 /var/log/supabase-watchdog.log

echo
echo "✅ Watchdog installiert."
echo "   Status:  systemctl status supabase-watchdog.timer"
echo "   Logs:    tail -f /var/log/supabase-watchdog.log"
echo "   Alerts:  ls /var/log/supabase-watchdog-alerts/"
