#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
env_file="${1:-$([[ -f .env ]] && echo .env || echo .env.site)}"
[[ -f "$env_file" ]] || { echo "Missing $env_file; copy .env.example to .env and fill it" >&2; exit 1; }
[[ "$(uname -s)/$(uname -m)" =~ ^Linux/(x86_64|amd64)$ ]] || { echo 'This kit requires AMD64 Linux' >&2; exit 1; }
command -v docker >/dev/null && docker compose version >/dev/null || { echo 'Docker Engine with Compose v2 is required' >&2; exit 1; }

set -a; source "$env_file"; source manifest.env; set +a
required=(IMAGE_TAG SITE_HOST MINIO_ENDPOINT S3_ACCESS_KEY S3_SECRET_KEY LLM_MODEL LLM_LITE_IMAGE PGVECTOR_IMAGE)
for key in "${required[@]}"; do [[ -n "${!key:-}" ]] || { echo "Missing $key in $env_file" >&2; exit 1; }; done
config="${LLM_LITE_CONFIG:-./llm-lite-config.yaml}"
[[ -s "$config" ]] || { echo "Missing $config; copy llm-lite-config.example.yaml and fill it" >&2; exit 1; }

images=(wonder-server-base:latest marketplace-server-base:latest "wonder-server:$IMAGE_TAG" \
  "marketplace-server:$IMAGE_TAG" "$LLM_LITE_IMAGE" "$PGVECTOR_IMAGE")
if ! printf '%s\n' "${images[@]}" | xargs -n1 docker image inspect >/dev/null 2>&1; then
  command -v sha256sum >/dev/null && command -v gzip >/dev/null || { echo 'sha256sum and gzip are required' >&2; exit 1; }
  sha256sum -c SHA256SUMS
  gzip -dc images.tar.gz | docker load
fi
printf '%s\n' "${images[@]}" | xargs -n1 docker image inspect >/dev/null

compose=(docker compose --env-file "$env_file" -f docker-compose.yml)
"${compose[@]}" config >/dev/null
"${compose[@]}" up -d --pull never --remove-orphans
"${compose[@]}" ps
scheme="${SITE_SCHEME:-http}"
printf '\nWonder: %s://%s:%s\nMarketplace: %s://%s:%s/docs\nAgentOS: %s://%s:%s/docs\n' \
  "$scheme" "$SITE_HOST" "${WONDER_PUBLISHED_PORT:-58045}" "$scheme" "$SITE_HOST" "${MARKETPLACE_PUBLISHED_PORT:-58046}" \
  "$scheme" "$SITE_HOST" "${AGNO_PUBLISHED_PORT:-58049}"
echo "Full smoke test: SITE_ENV_FILE=$env_file ./sim-check.sh"
