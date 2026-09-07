#!/bin/sh
set -eu
repo=${POCITO_REPO_DIR:-/workspace/repo}
[ -e "$repo/.git" ] || { echo "Bind-mount a Git checkout at $repo" >&2; exit 1; }
cd "$repo"
exec "$@"
