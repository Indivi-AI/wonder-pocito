#!/bin/sh
dir="${POCITO_REPO_DIR:-/workspace/repo}/solutions/pocito/on-prem/dev"
[ -f "$dir/omp.mjs" ] && [ -f "$dir/omp-minimax.mjs" ] || dir=/opt/pocito/omp
exec node "$dir/omp.mjs" "$@"
