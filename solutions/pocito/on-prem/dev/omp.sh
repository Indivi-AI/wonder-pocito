#!/bin/sh
exec node "${POCITO_REPO_DIR:-/workspace/repo}/solutions/pocito/on-prem/dev/omp.mjs" "$@"
