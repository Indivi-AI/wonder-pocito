#!/bin/sh
dir="${POCITO_REPO_DIR:-/workspace/repo}/infra/dev/container"
[ -f "$dir/omp.mjs" ] && [ -f "$dir/omp-minimax.mjs" ] || dir=/opt/pocito/omp
exec node "$dir/omp.mjs" "$@"
