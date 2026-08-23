#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/onprem-env.sh"

ROOT="${1:-${WONDER_ROOT:-$PWD}}"
ENGINE="${CONTAINER_ENGINE:-docker}"
: "${WONDER_IMAGE:?Set WONDER_IMAGE to the client registry tag}"
: "${MINIO_ENDPOINT:?Set MINIO_ENDPOINT to the endpoint reachable from this machine}"
: "${MINIO_PUBLIC_ENDPOINT:?Set MINIO_PUBLIC_ENDPOINT to the browser-reachable endpoint}"
: "${WONDER_SERVICE_URL:?Set WONDER_SERVICE_URL to the public Wonder origin}"
export STORAGE_PROVIDER=minio WONDER_AUTH_MODE=none
export WONDER_STORAGE_URL="${WONDER_STORAGE_URL:-${MINIO_PUBLIC_ENDPOINT%/}}"
export WONDER_CDN_URL="${WONDER_CDN_URL:-${MINIO_PUBLIC_ENDPOINT%/}/wonder-code-packages/cdn}"
export MINIO_REGION="${MINIO_REGION:-us-east-1}" S3_STORAGE_CLASS="${S3_STORAGE_CLASS:-STANDARD_IA}"
export S3_USE_PATH_STYLE="${S3_USE_PATH_STYLE:-true}" PORT="${PORT:-3000}"
ENVS=(STORAGE_PROVIDER WONDER_AUTH_MODE MINIO_ENDPOINT MINIO_PUBLIC_ENDPOINT MINIO_REGION S3_STORAGE_CLASS S3_USE_PATH_STYLE
  WONDER_SERVICE_URL WONDER_STORAGE_URL WONDER_CDN_URL PORT)
exec "$ENGINE" run --rm --user "$(id -u):$(id -g)" -p "$PORT:$PORT" -v "$ROOT:/workspace" -w /workspace \
  "${ENVS[@]/#/--env=}" "$WONDER_IMAGE" npm run local
