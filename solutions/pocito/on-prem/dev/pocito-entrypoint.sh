#!/bin/sh
set -eu
repo=${POCITO_REPO_DIR:-/workspace/repo}
if [ ! -d "$repo/.git" ]; then
  [ -z "$(find "$repo" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ] || { echo "$repo is not an empty Git workspace" >&2; exit 1; }
  git clone --branch "$POCITO_BUNDLE_BRANCH" /opt/pocito/wonder-pocito.bundle "$repo"
  git -C "$repo" remote rename origin image-bundle
fi
git -C "$repo" config core.autocrlf false
git -C "$repo" config core.filemode false
cd "$repo"
exec "$@"
