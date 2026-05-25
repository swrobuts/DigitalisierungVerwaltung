#!/usr/bin/env bash
# demo-reset.sh — vor/nach Vorlesung VL-Demo-State zurücksetzen.
#
# Was bleibt:
#   - apl.antraege mit `einrichtung LIKE 'DEMO-%'` (die 6 Seed-Anträge)
#   - alle FB-Detail-Tabellen für diese DEMO-Anträge
#   - apl.ahp_norm_statements (kuratierte Norm-Statements)
#   - apl.allow_email (Sachbearbeiter-Allowlist)
#
# Was wird gelöscht:
#   - Während VL eingereichte neue Anträge (NICHT die DEMO-*)
#   - apl.bescheide (alle)
#   - apl.manuelle_pruefung (alle)
#   - apl.antrag_einreichung (UE0-Tracking, alle)
#   - apl.antrag_history (alle)
#   - Storage-Bucket `antragseingang-pdf` (alle Files)
#   - Storage-Bucket `bescheide` (alle Files)
#   - Storage-Bucket `antragsbelege` (NUR Files zu nicht-DEMO-Anträgen)
#
# Voraussetzung: ssh-Zugriff auf vps (alias muss in ~/.ssh/config stehen).

set -euo pipefail

CONFIRM=${1:-}
if [ "$CONFIRM" != "--yes" ]; then
  echo "demo-reset.sh — DESTRUKTIV. Setzt VL-Demo-State zurück."
  echo ""
  echo "Was passiert:"
  echo "  - alle nicht-DEMO-Anträge löschen"
  echo "  - alle Bescheide löschen"
  echo "  - alle Einreichungs-Tracking-Datensätze löschen"
  echo "  - Storage-Buckets bereinigen"
  echo ""
  echo "DEMO-Anträge bleiben erhalten (einrichtung LIKE 'DEMO-%')."
  echo ""
  echo "Zum Bestätigen: bash scripts/demo-reset.sh --yes"
  exit 1
fi

echo "→ DB-Reset via psql auf VPS"
ssh vps "docker exec -i supabase-db psql -U postgres -d postgres" <<'SQL'
begin;

-- nicht-DEMO-Anträge löschen (CASCADE räumt FB-Details, Anlagen, History)
delete from apl.antraege
 where einrichtung not like 'DEMO-%';

-- Alle Bescheide löschen (auch zu DEMO-Anträgen — VL fängt frisch an)
truncate apl.bescheide cascade;

-- Manuelle Prüfvermerke löschen
truncate apl.manuelle_pruefung cascade;

-- UE0-Einreichungs-Tracking komplett löschen
truncate apl.antrag_einreichung cascade;

-- Workflow-History für DEMO-Anträge zurücksetzen (Status bleibt auf submitted_at)
delete from apl.antrag_history;

-- Status der DEMO-Anträge auf 'eingegangen' resetten (außer FAKE-Demos die Status haben sollen)
-- (Migration 067 setzt einige absichtlich auf in_pruefung / rueckfrage — die behalten wir)

commit;

select 'DEMO-Anträge nach Reset:' as info;
select foerderbereich, status, count(*)
  from apl.antraege
 where einrichtung like 'DEMO-%'
 group by 1, 2
 order by 1, 2;
SQL

echo ""
echo "→ Storage-Buckets bereinigen"
ssh vps "docker exec -i supabase-db psql -U postgres -d postgres -c \"
delete from storage.objects where bucket_id = 'antragseingang-pdf';
delete from storage.objects where bucket_id = 'bescheide';
-- antragsbelege: nur die zu nicht-existenten Anträgen löschen
delete from storage.objects o
 where o.bucket_id = 'antragsbelege'
   and not exists (
     select 1 from apl.anlagen a where a.storage_path = o.name
   );
\""

echo ""
echo "✅ Demo-Reset abgeschlossen. State ist VL-bereit."
echo ""
echo "Nächster Schritt: pre-flight-checklist.md durchgehen."
