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
mc mb --ignore-existing --with-lock "$ALIAS/logs-bucket-me-west1"
for bucket in "${BUCKETS[@]}"; do [[ "$bucket" == logs-bucket-me-west1 ]] || mc mb --ignore-existing "$ALIAS/$bucket"; done
mc version enable "$ALIAS/logs-bucket-me-west1"
mc retention set --default compliance 100y "$ALIAS/logs-bucket-me-west1"
policy() { printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},"Action":%s,"Resource":["arn:aws:s3:::%s/*"]}]}' \
  "$2" "$1" > "$POLICY"; mc anonymous set-json "$POLICY" "$ALIAS/$1"; }
policy indiviai-wonder '["s3:GetObject","s3:PutObject"]'
policy wonder-code-packages '["s3:GetObject"]'
policy logs-bucket-me-west1 '["s3:PutObject"]'
mc anonymous set private "$ALIAS/indiviai-wonder-protected"
MINIO_ALIAS="$ALIAS" bash "$(dirname "$0")/deploy-cdn.sh"
