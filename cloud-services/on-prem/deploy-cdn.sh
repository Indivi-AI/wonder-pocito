#!/usr/bin/env bash
set -euo pipefail

: "${MINIO_ENDPOINT:?Set MINIO_ENDPOINT}"
BUCKET_URL="${MINIO_ENDPOINT%/}/wonder-code-packages"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

upload_file() {
  local file="$1" key="$2" type=application/octet-stream
  case "$file" in *.js|*.mjs) type=text/javascript;; *.css) type=text/css;; *.json) type=application/json;;
    *.svg) type=image/svg+xml;; *.png) type=image/png;; *.jpg|*.jpeg) type=image/jpeg;; *.wasm) type=application/wasm;; esac
  curl -fsS -X PUT -H "Content-Type: $type" --upload-file "$file" "$BUCKET_URL/$key"
}
upload_dir() {
  local dir="$1" prefix="$2" file
  while IFS= read -r -d '' file; do upload_file "$file" "$prefix/${file#"$dir"/}"; done < <(find "$dir" -type f -print0)
}
upload_dir "$ROOT/jb6/react/lib" cdn
upload_dir "$ROOT/wonder/images" cdn/images
