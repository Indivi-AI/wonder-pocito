#!/usr/bin/env bash
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "${1:-$SRC/../wonder-pocito}" && pwd)"
[[ -d "$REPO/.git" ]] || { echo "not a git checkout: $REPO" >&2; exit 1; }
JUNK='(^|/)(node_modules|__pycache__|\.venv)/|^files$|(^|/)\.env(\.(dev|prod|onprem|site))?$|(^|/)\.DS_Store$'
wanted="$(git -C "$SRC" ls-files | grep -vE "$JUNK" | awk '$0 != "LICENSE" && !/^indiviai\// && (!/^solutions\// || /^solutions\/pocito\//)')"
git -C "$REPO" fetch origin wonder
TMP="$(mktemp -d)"
trap 'git -C "$REPO" worktree remove --force "$TMP" >/dev/null 2>&1 || rm -rf "$TMP"' EXIT
git -C "$REPO" worktree add -q --detach "$TMP" origin/wonder
comm -23 <(git -C "$TMP" ls-files | grep -vE '^(LICENSE|files)$' | sort) <(printf '%s\n' "$wanted") |
  while IFS= read -r f; do git -C "$TMP" rm -qf --ignore-unmatch -- "$f"; done
while IFS= read -r f; do
  [[ -f "$SRC/$f" ]] || continue
  mkdir -p "$TMP/$(dirname "$f")"
  cp -p "$SRC/$f" "$TMP/$f"
done <<< "$wanted"
git -C "$TMP" add -A
bad="$(git -C "$TMP" ls-files | awk '/^indiviai\// || (/^solutions\// && !/^solutions\/pocito\//)')"
[[ -z "$bad" ]] || { echo "refusing to push excluded paths: $bad" >&2; exit 1; }
git -C "$TMP" diff --cached --quiet && { echo "wonder-pocito/wonder is up to date"; exit; }
git -C "$TMP" commit -qm "Sync Wonder infrastructure"
git -C "$TMP" push origin HEAD:wonder
