#!/usr/bin/env bash
set -euo pipefail
SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
POCITO="$(cd "${1:-$SOURCE/../wonder-pocito}" && pwd)"
[[ -d "$POCITO/.git" ]] || { echo "not a git checkout: $POCITO" >&2; exit 1; }
JUNK='(^|/)(node_modules|__pycache__|\.venv)/|^files$|(^|/)\.env(\.(dev|prod|onprem|site))?$|(^|/)\.DS_Store$'
included="$(git -C "$SOURCE" ls-files | grep -vE "$JUNK" | awk '$0 != "LICENSE" && !/^indiviai(\/|$)/ && (!/^solutions(\/|$)/ || /^solutions\/pocito(\/|$)/)')"
git -C "$POCITO" fetch origin wonder
WORKTREE="$(mktemp -d)"
trap 'git -C "$POCITO" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || rm -rf "$WORKTREE"' EXIT
git -C "$POCITO" worktree add -q --detach "$WORKTREE" origin/wonder
comm -23 <(git -C "$WORKTREE" ls-files | grep -vE '^(LICENSE|files)$' | sort) <(printf '%s\n' "$included") |
  while IFS= read -r path; do git -C "$WORKTREE" rm -qf --ignore-unmatch -- "$path"; done
while IFS= read -r path; do
  [[ -f "$SOURCE/$path" ]] || continue
  mkdir -p "$WORKTREE/$(dirname "$path")"
  cp -p "$SOURCE/$path" "$WORKTREE/$path"
done <<< "$included"
git -C "$WORKTREE" add -A
excluded="$(git -C "$WORKTREE" ls-files | awk '/^indiviai(\/|$)/ || (/^solutions(\/|$)/ && !/^solutions\/pocito(\/|$)/)')"
[[ -z "$excluded" ]] || { echo "refusing to push excluded paths: $excluded" >&2; exit 1; }
git -C "$WORKTREE" diff --cached --quiet && { echo "wonder-pocito/wonder is up to date"; exit; }
git -C "$WORKTREE" commit -qm "Sync Wonder infrastructure"
git -C "$WORKTREE" push origin HEAD:wonder
