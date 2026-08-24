#!/usr/bin/env bash
# Mirror this wonder checkout into a wonder-pocito checkout: everything EXCEPT non-pocito solutions.
# idf was renamed to pocito in wonder, so no path translation is needed. Nothing is committed here;
# inspect `git status` in the target, then commit/push there.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="$(cd "${1:-$SRC/../wonder-pocito}" && pwd)"
[[ -d "$DST/.git" ]] || { echo "not a git checkout: $DST" >&2; exit 1; }
DROP='^solutions/(comax|finance)/'
JUNK='(^|/)(node_modules|__pycache__|\.venv|files)/|(^|/)\.env(\.(dev|prod|onprem|site))?$|(^|/)\.DS_Store$'

cd "$SRC"; wanted="$(git ls-files | grep -vE "$DROP" | grep -vE "$JUNK")"
# remove tracked files in DST that wonder no longer has (so deletions propagate), skipping DST-local junk
cd "$DST"
comm -23 <(git ls-files | grep -vE "$DROP" | sort) <(echo "$wanted" | sort) | while read -r f; do git rm -qf --ignore-unmatch -- "$f" >/dev/null; done
git rm -rqf --ignore-unmatch -- solutions/comax solutions/finance >/dev/null 2>&1 || true
cd "$SRC"; while read -r f; do mkdir -p "$DST/$(dirname "$f")"; cp -p "$f" "$DST/$f"; done <<< "$wanted"
echo "synced $SRC -> $DST (pocito-only, $(echo "$wanted" | wc -l | tr -d ' ') files)"
