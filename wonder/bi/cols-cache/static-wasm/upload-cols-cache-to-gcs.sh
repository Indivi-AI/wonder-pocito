#!/usr/bin/env bash
# After publishing, update the client's colsCacheVersion before committing; uploading does not move the client pointer.
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: COLS_CACHE_RELEASE=cc1 $0"
  exit 0
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="${HERE}/duckdb-dist/st"
BUCKET="gs://wonder-code-packages/lib/cols-cache"
DUCKDB_VERSION="1.5.4"
COLS_CACHE_RELEASE="${COLS_CACHE_RELEASE:-cc1}"
CLIENT="${HERE}/duckdb-wasm.js"
CC_WORKER="${HERE}/cc-worker.js"
RANGE_WORKER="${HERE}/range-worker.js"
E2E_WORKER="${HERE}/e2e-worker.js"
ARROW="${HERE}/duckdb-dist/arrow.bundle.mjs"
JS="${DIST}/duckdb-eh.js"; WASM="${DIST}/duckdb-eh.wasm"
FILES=("${CLIENT}" "${CC_WORKER}" "${RANGE_WORKER}" "${E2E_WORKER}" "${ARROW}" "${JS}" "${WASM}")

for file in "${FILES[@]}"; do [[ -f "${file}" ]] || { echo "Missing runtime file: ${file}" >&2; exit 1; }; done
HASH="$(for file in "${FILES[@]}"; do sha256sum "${file}" | cut -d' ' -f1; done | sha256sum | cut -c1-8)"
VERSION="${DUCKDB_VERSION}-${COLS_CACHE_RELEASE}-${HASH}"
CACHE="public,max-age=31536000,immutable"
STAGE="$(mktemp -d)"; trap 'rm -rf "${STAGE}"' EXIT

cp "${CLIENT}" "${STAGE}/duckdb-wasm-${VERSION}.js"
cp "${CC_WORKER}" "${STAGE}/cc-worker-${VERSION}.js"
cp "${RANGE_WORKER}" "${STAGE}/range-worker-${VERSION}.js"
cp "${E2E_WORKER}" "${STAGE}/e2e-worker-${VERSION}.js"
cp "${ARROW}" "${STAGE}/arrow-${VERSION}.mjs"
cp "${JS}" "${STAGE}/duckdb-eh-${VERSION}.js"
cp "${WASM}" "${STAGE}/duckdb-eh-${VERSION}.wasm"

sed -i "s#./duckdb-dist/arrow.bundle.mjs#./arrow-${VERSION}.mjs#; s#./cc-worker.js#./cc-worker-${VERSION}.js#" "${STAGE}/duckdb-wasm-${VERSION}.js"
sed -i "/cols-cache-version.js/d; s#const { default: createModule } = await import(colsCacheRuntime.js)#import createModule from './duckdb-eh-${VERSION}.js'#;
  s#const runtimeUrls = { 'duckdb_wasm.wasm': colsCacheRuntime.wasm }#const runtimeUrls = { 'duckdb_wasm.wasm': new URL('./duckdb-eh-${VERSION}.wasm', import.meta.url).href }#;
  s#./duckdb-dist/arrow.bundle.mjs#./arrow-${VERSION}.mjs#" "${STAGE}/cc-worker-${VERSION}.js"
sed -i "/cols-cache-version.js/d; s#const { default: createModule } = await import(colsCacheRuntime.js)#import createModule from './duckdb-eh-${VERSION}.js'#;
  s#const runtimeUrls = { 'duckdb_wasm.wasm': colsCacheRuntime.wasm }#const runtimeUrls = { 'duckdb_wasm.wasm': new URL('./duckdb-eh-${VERSION}.wasm', import.meta.url).href }#" "${STAGE}/e2e-worker-${VERSION}.js"

if grep -E "duckdb-dist|cols-cache-version|['\"]\./(cc-worker|range-worker|e2e-worker)\.js" "${STAGE}/duckdb-wasm-${VERSION}.js" \
  "${STAGE}/cc-worker-${VERSION}.js" "${STAGE}/e2e-worker-${VERSION}.js"; then
  echo "Unversioned runtime reference remains" >&2; exit 1
fi

for file in "${STAGE}"/*; do
  case "${file}" in *.wasm) type=application/wasm;; *.mjs|*.js) type=text/javascript;; esac
  gcloud storage cp "${file}" "${BUCKET}/$(basename "${file}")" --content-type="${type}" --cache-control="${CACHE}"
done

echo "colsCacheVersion=${VERSION}"
for file in "${STAGE}"/*; do echo "https://storage.googleapis.com/wonder-code-packages/lib/cols-cache/$(basename "${file}")"; done
echo "REMINDER: update the client colsCacheVersion to ${VERSION}"
