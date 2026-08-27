#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
env_file="${1:-$([[ -f .env ]] && echo .env || echo .env.site)}"
[[ -f "$env_file" ]] || { echo "Missing $env_file; copy .env.example to .env and fill it" >&2; exit 1; }
[[ "$(uname -s)/$(uname -m)" =~ ^Linux/(x86_64|amd64)$ ]] || { echo 'This kit requires AMD64 Linux (Windows: WSL2 Ubuntu, or docker-up.ps1 on an aio kit)' >&2; exit 1; }
command -v docker >/dev/null && docker compose version >/dev/null || { echo 'Docker Engine with Compose v2 is required' >&2; exit 1; }

sed -i '/^# auto-ports by docker-up.sh/,$d' "$env_file"   # drop last run's auto-picked ports - every run re-probes reality
set -a; source "$env_file"; source manifest.env; set +a
required=(IMAGE_TAG SITE_HOST S3_ACCESS_KEY S3_SECRET_KEY LLM_MODEL)
[[ -n "${KIT_IMAGES:-}" ]] || required+=(LLM_LITE_IMAGE PGVECTOR_IMAGE)   # kits before KIT_IMAGES name their images via these two
for key in "${required[@]}"; do [[ -n "${!key:-}" ]] || { echo "Missing $key in $env_file" >&2; exit 1; }; done
config="${LLM_LITE_CONFIG:-./llm-lite-config.yaml}"
[[ -s "$config" ]] || { echo "Missing $config; copy llm-lite-config.example.yaml and fill it" >&2; exit 1; }

if ! grep -qE '^[A-Z_]*_PUBLISHED_PORT=' "$env_file"; then   # no human-set ports: shift the 58045-58051 block +100 while any is taken
  containers="$(docker ps --format '{{.Label "com.docker.compose.project"}}|{{.Ports}}' 2>/dev/null || true)"
  ours="$(grep '^wonder-onprem|' <<< "$containers" | grep -oE ':[0-9]{4,5}->' | tr -cd '0-9\n' | sort -u || true)"
  taken="$(comm -23 <({ ss -tln 2>/dev/null; grep -v '^wonder-onprem|' <<< "$containers"; } \
    | grep -oE '[:.][0-9]{4,5}([^0-9]|$)' | tr -cd '0-9\n' | sort -u || true) <(printf '%s\n' "$ours"))"
  # union of real listeners (ss) AND docker-published ports (invisible to ss when userland-proxy=false); our own stack excluded
  offset=0
  while grep -qxFf <(seq $((58045+offset)) $((58051+offset))) <<< "$taken"; do
    offset=$((offset+100)); (( offset <= 5000 )) || { echo 'No free port block found in 58045..63051' >&2; exit 1; }
  done
  if (( offset > 0 )); then
    echo "# auto-ports by docker-up.sh - delete this block to re-probe; set your own ports ABOVE it to pin them" >> "$env_file"
    for entry in WONDER:58045 MARKETPLACE:58046 LLM_LITE:58047 MINIO:58048 AGNO:58049 PGVECTOR:58050 FLAPI:58051; do
      echo "${entry%:*}_PUBLISHED_PORT=$(( ${entry#*:} + offset ))" >> "$env_file"; done
    set -a; source "$env_file"; set +a
    echo "Default ports taken - shifted the whole block +$offset (wonder now :$((58045+offset))); recorded in $env_file"
  fi
fi

images=(${KIT_IMAGES:-wonder-server-base:latest marketplace-server-base:latest "wonder-server:$IMAGE_TAG" \
  "marketplace-server:$IMAGE_TAG" "$LLM_LITE_IMAGE" "$PGVECTOR_IMAGE"})
if ! printf '%s\n' "${images[@]}" | xargs -n1 docker image inspect >/dev/null 2>&1; then
  command -v sha256sum >/dev/null && command -v gzip >/dev/null || { echo 'sha256sum and gzip are required' >&2; exit 1; }
  grep -v '  docker-up.sh$' SHA256SUMS | sha256sum -c --ignore-missing -   # verify what's present; absent optional
  for archive in images.tar.gz *.image.tar.gz; do   # files (bundle/patch) are fine - missing IMAGES fail below by name
    if [[ -f "$archive" ]]; then gzip -dc "$archive" | docker load; fi
  done
fi
printf '%s\n' "${images[@]}" | xargs -n1 docker image inspect >/dev/null

if [[ -f wonder.bundle && ! -d wonder-source/.git ]]; then   # live-repo applet serving needs the source as a real git clone
  command -v git >/dev/null || { echo 'git is required to clone wonder.bundle (live-repo serving)' >&2; exit 1; }
  git clone wonder.bundle wonder-source
  if [[ -s source.patch ]]; then git -C wonder-source apply --whitespace=nowarn ../source.patch; fi
fi

compose=(docker compose --env-file "$env_file" -f "${KIT_COMPOSE:-docker-compose.yml}")
if [[ "${KIT_COMPOSE:-docker-compose.yml}" == docker-compose.yml && -f compose.liverepo.yml && -d wonder-source/.git ]]; then
  compose+=(-f compose.liverepo.yml); fi
[[ -n "${MINIO_ENDPOINT:-}" ]] || compose+=(--profile local-minio)   # no external MinIO configured: run the kit's own stand-in
"${compose[@]}" config >/dev/null
"${compose[@]}" up -d --pull never --remove-orphans
"${compose[@]}" ps
scheme="${SITE_SCHEME:-http}"
printf '\nWonder: %s://%s:%s\nMarketplace: %s://%s:%s/docs\nAgentOS: %s://%s:%s/docs\n' \
  "$scheme" "$SITE_HOST" "${WONDER_PUBLISHED_PORT:-58045}" "$scheme" "$SITE_HOST" "${MARKETPLACE_PUBLISHED_PORT:-58046}" \
  "$scheme" "$SITE_HOST" "${AGNO_PUBLISHED_PORT:-58049}"
echo "Full smoke test: SITE_ENV_FILE=$env_file ./sim-check.sh"
