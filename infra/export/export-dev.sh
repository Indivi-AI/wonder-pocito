#!/bin/bash
# Export the air-gapped development kit into infra/export/images: the Git bundle of the current branch (--code), the dev image parts (--images) or both.
set -euo pipefail
mode=${1:---all}
case "$mode" in --all|--code|--images) ;; *) echo "Usage: $0 [--all|--code|--images]" >&2; exit 1 ;; esac
[ "$#" -le 1 ] || { echo "Expected one export mode" >&2; exit 1; }
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
images="$root/infra/export/images"
mkdir -p "$images"
stage=$(mktemp -d "$images/.export.XXXXXX")
trap 'rm -rf "$stage"' EXIT
checksum() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
cd "$root"
sed -n '/^## Air-gapped development container/,$p' README.md | sed '1s/^## /# /' > "$stage/README.md"
if [ "$mode" != --images ]; then
  branch=$(git symbolic-ref --quiet --short HEAD)
  git bundle create "$stage/wonder-pocito.bundle" HEAD "refs/heads/$branch"
  git bundle verify "$stage/wonder-pocito.bundle"
  (cd "$stage" && checksum wonder-pocito.bundle > SHA256SUMS.code)
fi
if [ "$mode" != --code ]; then
  docker build --platform linux/amd64 --target pocito-dev-sudo -f infra/dev/container/dev.Dockerfile -t pocito-dev:latest .
  docker run --rm --platform linux/amd64 --mount "type=bind,src=$root,dst=/workspace/repo,readonly" pocito-dev:latest \
    node --test e2e-tests/dev/ssh.test.mjs
  prefix=pocito-dev-linux-amd64.tar.gz.part-
  docker save pocito-dev:latest | gzip -1 | split -b 190m -a 3 - "$stage/$prefix"
  cat "$stage/$prefix"* | gzip -t
  for part in "$stage/$prefix"*; do [ "$(wc -c < "$part")" -lt 200000000 ]; done
  (cd "$stage" && checksum "$prefix"* > SHA256SUMS)
  find "$images" -maxdepth 1 -name "$prefix*" -delete
fi
mv "$stage/"* "$images/"
echo "Exported $mode to $images; follow README.md for setup and updates."
