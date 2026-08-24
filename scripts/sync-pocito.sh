#!/usr/bin/env bash
# npm run pocito [path-to-wonder-pocito]: sync this wonder checkout into a wonder-pocito checkout.
# solutions/idf -> solutions/pocito, other solutions stripped, idf strings translated, deletions mirrored.
# Paths matching POCITO_OWNED keep the pocito version (intentional divergences) - review them after each sync.
# Nothing is committed: inspect `git status` in the target, then commit there.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="$(cd "${1:-$SRC/../wonder-pocito}" && pwd)"
[[ -d "$DST/.git" && -d "$DST/solutions/pocito" ]] || { echo "not a wonder-pocito checkout: $DST" >&2; exit 1; }

POCITO_OWNED='^(CLAUDE\.md|air-gapped-instructions\.md|task\.md|\.jb6/|cloud-services/express-server/(app\.js|lib/(room-lambda-and-applet|wfetch)\.js)|solutions/pocito/CLAUDE\.md|solutions/pocito/marketplace-server/(marketplace-server\.md|marketplace_server\.py|start-marketplace\.sh|\.gitignore)|solutions/pocito/wonder-platform/README\.md)'
SKIP='/(node_modules|__pycache__|\.venv|files)/|(^|/)(\.env(\.(dev|prod|onprem|site))?|\.DS_Store)$'

translate() { sed -e 's/solutions\/idf/solutions\/pocito/g' -e 's/@solution\/idf/@solution\/pocito/g' -e 's/entry-points-idf/entry-points-pocito/g'; }

cd "$SRC"
declare -A wanted
while read -r file; do
  out="${file/#solutions\/idf\//solutions/pocito/}"
  wanted[$out]=1
  echo "$out" | grep -Eq "$POCITO_OWNED" && continue
  mkdir -p "$DST/$(dirname "$out")"
  if grep -Iq . "$file" 2>/dev/null; then translate < "$file" > "$DST/$out"; else cp "$file" "$DST/$out"; fi
done < <(git ls-files jb6 wonder cloud-services scripts syncer tests solutions/idf \
  package.json package-lock.json nodejs-importmap.js nodejs-importmap-loader.js .gitignore LICENSE | grep -Ev "$SKIP")

cd "$DST"
while read -r file; do
  [[ -n "${wanted[$file]:-}" ]] && continue
  { echo "$file" | grep -Eq "$POCITO_OWNED"; } && continue
  { echo "$file" | grep -Eq "$SKIP"; } && continue
  case "$file" in jb6/*|wonder/*|cloud-services/*|scripts/*|syncer/*|tests/*|solutions/pocito/*) git rm -q "$file";; esac
done < <(git ls-files)
chmod +x cloud-services/on-prem/*.sh scripts/*.sh solutions/pocito/marketplace-server/*.sh syncer/*.sh 2>/dev/null || true
echo "synced $SRC -> $DST"
echo "pocito-owned, sync by hand when needed: CLAUDE.md, air-gapped-instructions.md, .jb6/,"
echo "  room-lambda-and-applet.js, marketplace_server.py, marketplace-server.md, wonder-platform/README.md"
