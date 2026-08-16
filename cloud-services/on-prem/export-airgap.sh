#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
REV="$(git -C "$ROOT" rev-parse --short=12 HEAD)"
BRANCH="$(git -C "$ROOT" symbolic-ref --short HEAD)"
OUT="${1:-$(dirname "$ROOT")/wonder-airgap-$REV}"
ENGINE="${CONTAINER_ENGINE:-docker}"
PLATFORM="${PLATFORM:-linux/amd64}"
BASE_IMAGE="wonder-airgap-base:$REV"
SOURCE_IMAGE="wonder-airgap:$REV"
[[ "$OUT" = /* ]] || OUT="$PWD/$OUT"
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || { echo 'Commit or remove all working-tree changes first' >&2; exit 1; }
[[ ! -e "$OUT" ]] || { echo "Output already exists: $OUT" >&2; exit 1; }
for tool in git "$ENGINE" gzip tar; do command -v "$tool" >/dev/null || { echo "Missing command: $tool" >&2; exit 1; }; done

TMP="$(mktemp -d)"
CID=''
cleanup() { [[ -z "$CID" ]] || "$ENGINE" rm -f "$CID" >/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT
mkdir -p "$OUT"
git -C "$ROOT" bundle create "$OUT/wonder.bundle" HEAD "$BRANCH"
"$ENGINE" build --platform "$PLATFORM" -t "$BASE_IMAGE" -f "$ROOT/cloud-services/wonder-base.docker" "$ROOT"
"$ENGINE" build --platform "$PLATFORM" --build-arg "BASE_IMAGE=$BASE_IMAGE" --build-arg BUILD_TARGET=runtime \
  -t "$SOURCE_IMAGE" -f "$ROOT/cloud-services/wonder.docker" "$ROOT"
"$ENGINE" save "$SOURCE_IMAGE" | gzip -9 > "$OUT/wonder-image.tar.gz"
CID="$("$ENGINE" create --platform "$PLATFORM" "$BASE_IMAGE")"
"$ENGINE" cp "$CID:/usr/src/app/node_modules" "$TMP/node_modules"
tar -C "$TMP" -czf "$OUT/node_modules.tar.gz" node_modules
"$ENGINE" rm "$CID" >/dev/null
CID=''
cp "$ROOT/cloud-services/on-prem/install-airgap.sh" "$ROOT/cloud-services/on-prem/run-mcp.sh" "$OUT"
printf 'WONDER_COMMIT=%q\nWONDER_SOURCE_IMAGE=%q\nWONDER_PLATFORM=%q\n' "$REV" "$SOURCE_IMAGE" "$PLATFORM" > "$OUT/manifest.env"
FILES=(wonder.bundle wonder-image.tar.gz node_modules.tar.gz install-airgap.sh run-mcp.sh manifest.env)
if command -v sha256sum >/dev/null; then (cd "$OUT" && sha256sum "${FILES[@]}" > SHA256SUMS)
else (cd "$OUT" && shasum -a 256 "${FILES[@]}" > SHA256SUMS); fi
echo "Air-gap kit: $OUT"
