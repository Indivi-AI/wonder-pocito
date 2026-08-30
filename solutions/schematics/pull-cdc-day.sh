#!/usr/bin/env bash
# Read-only mirror of one CDC day plus the lag window that carries its late payout UPDATEs.
#   ./pull-cdc-day.sh 2026-05-15 [lagDays] [table]
set -euo pipefail
DAY="${1:?usage: pull-cdc-day.sh YYYY-MM-DD [lagDays] [table]}"
LAG="${2:-2}"; TABLE="${3:-links_tracking_clicks}"; ROOT="${BRONZE_ROOT:-/tmp/schm-cdc}"
for i in $(seq 0 "$LAG"); do
  D=$(date -j -v+"${i}"d -f %Y-%m-%d "$DAY" +%Y/%m/%d 2>/dev/null || date -d "$DAY + $i day" +%Y/%m/%d)
  mkdir -p "$ROOT/$TABLE/$D"
  gcloud storage cp -r "gs://schematics-gcs-dump/schemathics_crm_leadcenter_$TABLE/$D/*" "$ROOT/$TABLE/$D/"
done
find "$ROOT/$TABLE" -name '*.avro' | wc -l
