#!/usr/bin/env bash
#
# MASTER-SETUP — wendet alle Hardening-Maßnahmen idempotent an.
#
# Was passiert:
#   1. git pull (neueste Migrations + Skript-Stände holen)
#   2. Migration 081 auf Postgres anwenden (RLS-Policy)
#   3. Pool-Tuning (PostgREST + GoTrue + statement_timeout)
#   4. Watchdog-systemd-Timer installieren (5-min-Health-Checks +
#      Auto-Restart bei 2 consecutive failures)
#   5. Wartungs-systemd-Timer installieren (Sonntags 03:00 UTC
#      VACUUM ANALYZE über alle Schemata)
#   6. Komplett-Smoketest (Auth, REST, CORS, allow_email) — am Ende
#      siehst du in 5 Zeilen ob alles grün ist
#
# Aufruf auf der VPS (root):
#   sudo bash /opt/pruefung/repo/scripts/vps-hardening/00-apply-all.sh
#
# Idempotent — kann beliebig oft ausgeführt werden, schadet nicht.

set -euo pipefail
cd /opt/pruefung/repo

HARDDIR=/opt/pruefung/repo/scripts/vps-hardening

echo "▶▶▶ 1) Repo aktualisieren"
git pull --quiet
echo "  HEAD: $(git rev-parse --short HEAD) — $(git log -1 --format=%s | cut -c1-80)"

echo
echo "▶▶▶ 2) Migration 081 anwenden (allow_email-RLS-Policy)"
docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/081_allow_email_policy_simplify.sql
echo "  Policy aktiv:"
docker exec supabase-db psql -U postgres -tc \
  "SELECT polname FROM pg_policy WHERE polrelid='apl.allow_email'::regclass;" \
  | sed 's/^/    /'

echo
echo "▶▶▶ 3) Pool-Tuning (PostgREST + GoTrue + statement_timeout)"
bash "$HARDDIR/01-supabase-pool-tuning.sh"

echo
echo "▶▶▶ 4) Watchdog installieren (5-min-Health-Checks)"
bash "$HARDDIR/02-watchdog-install.sh"

echo
echo "▶▶▶ 5) Wartungs-Cronjob installieren (Sonntags-VACUUM)"
bash "$HARDDIR/03-postgres-maintenance.sh"

echo
echo "▶▶▶ 6) End-to-End-Smoketest"
ANON=$(grep '^ANON_KEY=' /root/supabase/docker/.env | cut -d= -f2)
echo "  --- Backend-Health ---"
for endpoint in \
  "https://supabase.butscher.cloud/auth/v1/settings|auth-settings" \
  "https://supabase.butscher.cloud/rest/v1/|rest-root" \
  "https://supabase.butscher.cloud/rest/v1/allow_email?select=*&limit=1|allow_email anon"; do
  url="${endpoint%|*}"
  label="${endpoint##*|}"
  printf "    %-22s " "$label"
  curl -s -m 8 -o /dev/null -w "HTTP %{http_code} · %{time_total}s\n" "$url" \
    -H "apikey: $ANON" -H "Accept-Profile: apl"
done

echo "  --- CORS für beide Frontends ---"
for origin in "ki.butscher.cloud" "sachbearbeiter.butscher.cloud"; do
  printf "    OPTIONS %-35s " "$origin auth-otp"
  curl -s -m 8 -o /dev/null -w "HTTP %{http_code} · CORS: %header{access-control-allow-origin}\n" \
    -X OPTIONS https://supabase.butscher.cloud/auth/v1/otp \
    -H "Origin: https://$origin" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: apikey,content-type"
done

echo "  --- Frontends erreichbar ---"
for url in \
  "https://ki.butscher.cloud/login" \
  "https://sachbearbeiter.butscher.cloud/login" \
  "https://antrag.butscher.cloud/" \
  "https://upload.butscher.cloud/" \
  "https://agent.butscher.cloud/"; do
  label=$(echo "$url" | sed 's|https://||; s|/.*||')
  printf "    %-30s " "$label"
  curl -s -m 8 -o /dev/null -w "HTTP %{http_code} · %{time_total}s\n" "$url"
done

echo "  --- Systemd-Timer aktiv ---"
systemctl list-timers supabase-watchdog.timer supabase-maintenance.timer --no-pager \
  | head -3 | tail -2 | sed 's/^/    /'

echo
echo "✅✅✅ FERTIG"
echo
echo "Erwartet:"
echo "  - auth/rest/allow_email alle HTTP 200/401 in < 1s"
echo "  - CORS-Header für beide Origins = *"
echo "  - Alle Frontends HTTP 200"
echo "  - 2 systemd-Timer aktiv"
echo
echo "Watchdog läuft alle 5 min:  tail -f /var/log/supabase-watchdog.log"
echo "Wartung läuft Sonntags 03:00 UTC."
