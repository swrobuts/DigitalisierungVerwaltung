#!/usr/bin/env bash
# Wöchentliche Postgres-Wartung: VACUUM ANALYZE über alle Schemata
# + pg_catalog-Cleanup. Verhindert Schema-Cache-Slowdown durch
# stale statistics und Catalog-Bloat.
#
# Läuft als systemd-Timer (Sonntag 03:00 Uhr UTC). Idempotent.

set -euo pipefail

WART_BIN=/usr/local/bin/supabase-weekly-maintenance.sh
SYSTEMD_DIR=/etc/systemd/system

echo "▶ Schreibe Wartungs-Skript"
cat > "$WART_BIN" <<'WART'
#!/usr/bin/env bash
# Wöchentliche Postgres-Wartung
set -u
LOG=/var/log/supabase-maintenance.log
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

log "===== Start Wartung ====="

# 1. Statistik-Update über alle App-Schemata
SCHEMAS="public storage graphql_public apl cityBikesRental WorldHappiness Rainforest"
for s in $SCHEMAS; do
  log "ANALYZE schema $s"
  docker exec supabase-db psql -U postgres -c "
    DO \$\$
    DECLARE r record;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = '$s' LOOP
        EXECUTE format('ANALYZE %I.%I', '$s', r.tablename);
      END LOOP;
    END\$\$;
  " >> "$LOG" 2>&1 || log "WARN: schema $s nicht vorhanden oder Fehler"
done

# 2. pg_catalog-Bloat reduzieren (autovacuum greift hier nicht aggressiv genug)
log "VACUUM pg_catalog"
docker exec supabase-db psql -U postgres -c "VACUUM (ANALYZE, VERBOSE) pg_catalog.pg_class;" >> "$LOG" 2>&1 || true
docker exec supabase-db psql -U postgres -c "VACUUM (ANALYZE, VERBOSE) pg_catalog.pg_attribute;" >> "$LOG" 2>&1 || true
docker exec supabase-db psql -U postgres -c "VACUUM (ANALYZE, VERBOSE) pg_catalog.pg_proc;" >> "$LOG" 2>&1 || true

# 3. Schema-Cache-Hint an PostgREST (frische Statistik nutzen)
docker exec supabase-db psql -U postgres -c "NOTIFY pgrst, 'reload schema';" >> "$LOG" 2>&1 || true

# 4. Connection-Pool-Status loggen (für Trending)
log "Connection-Status:"
docker exec supabase-db psql -U postgres -c "
SELECT usename, application_name, state, COUNT(*)
FROM pg_stat_activity
WHERE usename IS NOT NULL
GROUP BY usename, application_name, state
ORDER BY COUNT(*) DESC;
" >> "$LOG" 2>&1

log "===== Ende Wartung ====="
WART
chmod +x "$WART_BIN"

echo "▶ systemd-Service + Timer"
cat > "$SYSTEMD_DIR/supabase-maintenance.service" <<EOF
[Unit]
Description=Weekly Postgres maintenance for Supabase
After=docker.service

[Service]
Type=oneshot
ExecStart=$WART_BIN
EOF

cat > "$SYSTEMD_DIR/supabase-maintenance.timer" <<EOF
[Unit]
Description=Run supabase-weekly-maintenance every Sunday 03:00 UTC

[Timer]
OnCalendar=Sun 03:00
Persistent=true
Unit=supabase-maintenance.service

[Install]
WantedBy=timers.target
EOF

cat > /etc/logrotate.d/supabase-maintenance <<EOF
/var/log/supabase-maintenance.log {
    monthly
    rotate 6
    compress
    missingok
    notifempty
    create 0640 root root
}
EOF

systemctl daemon-reload
systemctl enable --now supabase-maintenance.timer

echo
echo "▶ Test-Lauf jetzt (zur Sicherheit, prüft ob Skript läuft)"
$WART_BIN
tail -10 /var/log/supabase-maintenance.log

echo
echo "✅ Wartung installiert."
echo "   Nächster Lauf: systemctl list-timers supabase-maintenance.timer"
echo "   Logs:          tail -f /var/log/supabase-maintenance.log"
