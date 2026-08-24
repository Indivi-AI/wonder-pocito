#!/usr/bin/env bash
# Mirror this wonder checkout into a wonder-pocito checkout: everything EXCEPT non-pocito solutions.
# idf was renamed to pocito in wonder, so no path translation is needed. Nothing is committed here;
# inspect `git status` in the target, then commit/push there.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="$(cd "${1:-$SRC/../wonder-pocito}" && pwd)"
[[ -d "$DST/.git" ]] || { echo "not a git checkout: $DST" >&2; exit 1; }
JUNK='(^|/)(node_modules|__pycache__|\.venv)/|^files$|(^|/)\.env(\.(dev|prod|onprem|site))?$|(^|/)\.DS_Store$'

cd "$SRC"; wanted="$(git ls-files | grep -vE "$JUNK" | awk '!/^solutions\// || /^solutions\/pocito\//')"   # pocito is the ONLY solution that syncs
# make DST match wanted exactly: delete every tracked DST file not in wanted (strips ALL non-pocito solutions),
# keeping only the `files` submodule ref. Then copy wanted over. Deletions and renames propagate.
cd "$DST"
comm -23 <(git ls-files | grep -vE '^files$' | sort) <(echo "$wanted" | sort) | while read -r f; do git rm -qf --ignore-unmatch -- "$f" >/dev/null; done
git clean -qfd -- solutions   # untracked residue under solutions/ would ride into the next `git add -A` commit
while read -r f; do [ -f "$SRC/$f" ] || continue; [ "$SRC/$f" -ef "$DST/$f" ] && continue; mkdir -p "$DST/$(dirname "$f")"; cp -p "$SRC/$f" "$DST/$f"; done <<< "$wanted"
echo "synced $SRC -> $DST (pocito-only, $(echo "$wanted" | wc -l | tr -d ' ') files)"
