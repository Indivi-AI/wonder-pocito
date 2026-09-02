#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../../.." && pwd)
images="$root/solutions/pocito/on-prem/images"
stage=$(mktemp -d "$images/.export.XXXXXX")
bundle_next="$root/wonder-pocito.bundle.next"
trap '[ ! -f "$bundle_next" ] || unlink "$bundle_next"; find "$stage" -type f -delete 2>/dev/null; rmdir "$stage" 2>/dev/null || :' EXIT HUP INT TERM
cd "$root"
branch=$(git symbolic-ref --quiet --short HEAD)
git bundle create "$bundle_next" HEAD "refs/heads/$branch"
mv "$bundle_next" wonder-pocito.bundle
docker build --platform linux/amd64 --build-arg POCITO_BUNDLE_BRANCH="$branch" --target pocito-dev \
  -f solutions/pocito/on-prem/on-premp-dev.dockerfile -t pocito-dev:linux-amd64 .
docker build --platform linux/amd64 --build-arg POCITO_BUNDLE_BRANCH="$branch" --target pocito-dev-sudo \
  -f solutions/pocito/on-prem/on-premp-dev.dockerfile -t pocito-dev:sudo-linux-amd64 .
prefix=pocito-dev-linux-amd64.tar.gz.part-
docker save pocito-dev:linux-amd64 pocito-dev:sudo-linux-amd64 | gzip -1 | split -b 190m -a 3 - "$stage/$prefix"
cat "$stage/$prefix"* | gzip -t
for part in "$stage/$prefix"*; do [ "$(wc -c < "$part")" -lt 200000000 ]; done
(cd "$stage" && { command -v sha256sum >/dev/null && sha256sum "$prefix"* || shasum -a 256 "$prefix"*; } > SHA256SUMS)
find "$images" -maxdepth 1 -name "$prefix*" -delete
mv "$stage/$prefix"* "$images/"
mv "$stage/SHA256SUMS" "$images/"
echo "Created $(find "$images" -maxdepth 1 -name "$prefix*" | wc -l | tr -d ' ') verified parts in $images"
