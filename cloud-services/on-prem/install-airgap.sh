#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/onprem-env.sh"

KIT="${1:?Usage: install-airgap.sh KIT_DIR [REPO_DIR]}"
DEST="${2:-${WONDER_ROOT:-$PWD/wonder}}"
ENGINE="${CONTAINER_ENGINE:-docker}"
: "${WONDER_IMAGE:?Set WONDER_IMAGE to the client registry tag}"
: "${MINIO_ENDPOINT:?Set MINIO_ENDPOINT to the Kubernetes-reachable endpoint}"
: "${MINIO_PUBLIC_ENDPOINT:?Set MINIO_PUBLIC_ENDPOINT to the browser-reachable endpoint}"
: "${MINIO_ACCESS_KEY:?Set MINIO_ACCESS_KEY}"
: "${MINIO_SECRET_KEY:?Set MINIO_SECRET_KEY}"
for tool in git "$ENGINE" kubectl mc tar; do command -v "$tool" >/dev/null || { echo "Missing command: $tool" >&2; exit 1; }; done
if command -v sha256sum >/dev/null; then (cd "$KIT" && sha256sum -c SHA256SUMS)
else (cd "$KIT" && shasum -a 256 -c SHA256SUMS); fi
source "$KIT/manifest.env"

if [[ -d "$DEST/.git" ]]; then
  [[ "$(git -C "$DEST" rev-parse --short=12 HEAD)" == "$WONDER_COMMIT" ]] || { echo "Wrong commit in $DEST" >&2; exit 1; }
else
  [[ ! -e "$DEST" ]] || { echo "Destination exists and is not a Git checkout: $DEST" >&2; exit 1; }
  git clone "$KIT/wonder.bundle" "$DEST"
fi
git -C "$DEST" config user.email onprem@airgap   # developerEntryPoint resolves .jb6/entry-points-{gitUser}.js from this
[[ ! -f "$ONPREM_ENV_FILE" ]] || cp "$ONPREM_ENV_FILE" "$DEST/cloud-services/on-prem/onprem.env"   # checkout scripts stay self-configured
tar -C "$DEST" -xzf "$KIT/node_modules.tar.gz"
"$ENGINE" load -i "$KIT/wonder-image.tar.gz"
"$ENGINE" tag "$WONDER_SOURCE_IMAGE" "$WONDER_IMAGE"
"$ENGINE" push "$WONDER_IMAGE"
MINIO_ENDPOINT="${MINIO_ADMIN_ENDPOINT:-$MINIO_ENDPOINT}" MINIO_ACCESS_KEY="${MINIO_ADMIN_ACCESS_KEY:-$MINIO_ACCESS_KEY}" \
  MINIO_SECRET_KEY="${MINIO_ADMIN_SECRET_KEY:-$MINIO_SECRET_KEY}" bash "$DEST/cloud-services/on-prem/deploy-buckets.sh"
bash "$DEST/cloud-services/on-prem/deploy-lambdas.sh"
echo "Installed $WONDER_COMMIT in $DEST; run $KIT/run-mcp.sh $DEST to start the publisher"
