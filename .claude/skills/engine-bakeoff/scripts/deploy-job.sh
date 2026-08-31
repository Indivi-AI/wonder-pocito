#!/usr/bin/env bash
# One-off Cloud Run Job for a benchmark. Deliberately NOT gcloudCronEtl — that always upserts a
# Cloud Scheduler cron, which you do not want for a one-shot measurement.
set -euo pipefail
ID=${ID:-bakeoff}; REGION=${REGION:-me-west1}; PROJECT=${PROJECT:-indiviai}
BUCKET=${BUCKET:-logs-bucket-me-west1}; CPU=${CPU:-4}; MEM=${MEM:-8Gi}
TIMEOUT=${TIMEOUT:-600}; DUCKDB_VER=${DUCKDB_VER:-1.5.4}; B=/tmp/bakeoff-build
mkdir -p "$B"

# cloud-sdk base: run-etl.sh shells `gcloud`. node:22-slim has no gcloud -> exit 127.
cat > "$B/Dockerfile" <<DF
FROM gcr.io/google.com/cloudsdktool/cloud-sdk:slim
RUN apt-get update && apt-get install -y jq unzip curl ca-certificates \\
 && curl -fsSL https://github.com/duckdb/duckdb/releases/download/v${DUCKDB_VER}/duckdb_cli-linux-amd64.zip -o /tmp/d.zip \\
 && unzip -d /usr/local/bin /tmp/d.zip && rm /tmp/d.zip && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY run-etl.sh /usr/local/bin/run-etl.sh
RUN chmod +x /usr/local/bin/run-etl.sh
ENTRYPOINT ["/usr/local/bin/run-etl.sh"]
DF

# fetches script.sh from GCS and records door-to-door duration — the number that bills
cat > "$B/run-etl.sh" <<'RE'
#!/bin/bash
START_MS=$(date +%s%3N); BASE="gs://${ETL_BUCKET}/schm/etls/${ETL_ID}"
gcloud storage cp "$BASE/script.sh" /tmp/s.sh
ETL_OUTPUT="$BASE" bash /tmp/s.sh; EXIT=$?
END_MS=$(date +%s%3N)
printf '{"lastRun":%s,"lastDurationMs":%s,"exit":%s}' "$END_MS" "$((END_MS-START_MS))" "$EXIT" \
  | gcloud storage cp - "$BASE/state.json"
exit $EXIT
RE

gcloud builds submit "$B" --tag="${REGION}-docker.pkg.dev/${PROJECT}/etls/runner:duck${DUCKDB_VER//./}" --project="$PROJECT" --quiet
gcloud run jobs deploy "etl-${ID}" \
  --image="${REGION}-docker.pkg.dev/${PROJECT}/etls/runner:duck${DUCKDB_VER//./}" \
  --region="$REGION" --task-timeout=${TIMEOUT}s --memory="$MEM" --cpu="$CPU" --max-retries=0 \
  --set-env-vars="ETL_BUCKET=${BUCKET},ETL_ID=${ID}" --project="$PROJECT" --quiet

python3 - <<PY
c,m=${CPU},${MEM%Gi}
print(f"  cost ceiling at ${TIMEOUT}s: \$%.3f" % (${TIMEOUT}*(c*0.000018+m*0.000002)))
PY
echo "  run: gcloud run jobs execute etl-${ID} --region=${REGION} --async"
echo "  NOTE: /tmp is tmpfs — DuckDB spill counts against ${MEM}. Keep memory_limit well under it."
