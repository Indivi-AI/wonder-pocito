#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
set -a; source .env.site; set +a
export SITE_ENV_FILE=/dev/null
export WONDER_URL=http://wonder.localhost:18080
export MARKETPLACE_URL=http://marketplace.localhost:18080
export AGNO_URL=http://agno.localhost:18080
export MINIO_ENDPOINT=http://localhost:30900
./sim-check.sh
