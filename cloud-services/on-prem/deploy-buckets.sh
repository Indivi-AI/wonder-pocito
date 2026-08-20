#!/usr/bin/env bash
set -euo pipefail

: "${MINIO_ENDPOINT:?Set MINIO_ENDPOINT}"
: "${MINIO_ACCESS_KEY:?Set MINIO_ACCESS_KEY}"
: "${MINIO_SECRET_KEY:?Set MINIO_SECRET_KEY}"
ALIAS="${MINIO_ALIAS:-wonder}"
MC_CONFIG_DIR="$(mktemp -d)"
trap 'rm -rf "$MC_CONFIG_DIR"' EXIT
export MC_CONFIG_DIR
POLICY="$MC_CONFIG_DIR/policy.json"

mc alias set "$ALIAS" "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
BUCKETS=(indiviai-wonder indiviai-wonder-protected wonder-code-packages logs-bucket-me-west1)
for bucket in "${BUCKETS[@]}"; do
  mc mb --ignore-existing "$ALIAS/$bucket"
  printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:*"]' \
    ',"Resource":["arn:aws:s3:::%s","arn:aws:s3:::%s/*"]}]}' "$bucket" "$bucket" > "$POLICY"
  mc anonymous set-json "$POLICY" "$ALIAS/$bucket"
done
bash "$(dirname "$0")/deploy-cdn.sh"
