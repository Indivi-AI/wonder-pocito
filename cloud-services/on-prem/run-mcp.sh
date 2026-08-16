#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-${WONDER_ROOT:-$PWD}}"
ENGINE="${CONTAINER_ENGINE:-docker}"
: "${WONDER_IMAGE:?Set WONDER_IMAGE to the client registry tag}"
: "${MINIO_ENDPOINT:?Set MINIO_ENDPOINT to the endpoint reachable from this machine}"
: "${MINIO_PUBLIC_ENDPOINT:?Set MINIO_PUBLIC_ENDPOINT to the browser-reachable endpoint}"
: "${MINIO_ACCESS_KEY:?Set MINIO_ACCESS_KEY}"
: "${MINIO_SECRET_KEY:?Set MINIO_SECRET_KEY}"
: "${WONDER_SERVICE_URL:?Set WONDER_SERVICE_URL to the public Wonder origin}"
export STORAGE_PROVIDER=minio WONDER_AUTH_MODE=none
export WONDER_STORAGE_URL="${WONDER_STORAGE_URL:-${MINIO_PUBLIC_ENDPOINT%/}}"
export WONDER_CDN_URL="${WONDER_CDN_URL:-${MINIO_PUBLIC_ENDPOINT%/}/wonder-code-packages/cdn}"
export MINIO_REGION="${MINIO_REGION:-us-east-1}" PORT="${PORT:-3000}"
ENVS=(STORAGE_PROVIDER WONDER_AUTH_MODE MINIO_ENDPOINT MINIO_PUBLIC_ENDPOINT MINIO_ACCESS_KEY MINIO_SECRET_KEY MINIO_REGION
  WONDER_SERVICE_URL WONDER_STORAGE_URL WONDER_CDN_URL PORT)
exec "$ENGINE" run --rm --user "$(id -u):$(id -g)" -p "$PORT:$PORT" -v "$ROOT:/workspace" -w /workspace \
  "${ENVS[@]/#/--env=}" "$WONDER_IMAGE" npm run local
