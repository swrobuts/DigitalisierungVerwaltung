# Supabase-Stack VPS-Hardening

Setup-Skripte für stabile Supabase-Performance auf der Self-hosted-VPS
(`bot.butscher.cloud`). Adressiert den am 2026-05-30 beobachteten
Performance-Kollaps (Cockpit lädt nicht / Magic-Link kaputt / Inbox-
Latenz), dessen Root-Cause Pool-Exhaustion war — nicht der Schema-Cache.

## Was die Skripte tun

| Skript | Zweck | Wiederholt sicher? |
|---|---|---|
| `01-supabase-pool-tuning.sh` | PostgREST + GoTrue Pool-Größen + Acquisition-Timeouts großzügig dimensionieren, statement_timeout DB-weit auf 5min | ✅ idempotent (sed-based upsert auf .env) |
| `02-watchdog-install.sh` | systemd-Timer, der alle 5min die kritischen Health-Endpoints prüft und bei 2 consecutive failures den betroffenen Container restartet, mit Alert-Datei pro Tag | ✅ idempotent |
| `03-postgres-maintenance.sh` | systemd-Timer (Sonntags 03:00 UTC) — ANALYZE über alle Schemata, VACUUM auf pg_catalog, NOTIFY pgrst | ✅ idempotent |

## Installation auf der VPS

```bash
# Skripte holen (Repo ist schon auf der VPS):
cd /opt/pruefung/repo && git pull
cd scripts/vps-hardening

# In dieser Reihenfolge ausführen:
sudo ./01-supabase-pool-tuning.sh
sudo ./02-watchdog-install.sh
sudo ./03-postgres-maintenance.sh
```

Nach Abschluss ist das System gehärtet — keine weiteren manuellen
Eingriffe nötig.

## Was beobachten

```bash
# Watchdog-Status
systemctl status supabase-watchdog.timer
tail -f /var/log/supabase-watchdog.log

# Alerts der letzten Tage
ls /var/log/supabase-watchdog-alerts/

# Wartungs-Status
systemctl list-timers supabase-maintenance.timer
tail -f /var/log/supabase-maintenance.log
```

## Rollback

Pool-Tuning rückgängig machen:
```bash
cp /root/supabase/docker/.env.bak-<TIMESTAMP> /root/supabase/docker/.env
cd /root/supabase/docker && docker compose up -d rest auth
```

Watchdog deaktivieren:
```bash
systemctl disable --now supabase-watchdog.timer
rm /etc/systemd/system/supabase-watchdog.{service,timer}
rm /usr/local/bin/supabase-watchdog.sh
```

Wartung deaktivieren:
```bash
systemctl disable --now supabase-maintenance.timer
rm /etc/systemd/system/supabase-maintenance.{service,timer}
rm /usr/local/bin/supabase-weekly-maintenance.sh
```
