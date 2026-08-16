#!/usr/bin/env bash
set -euo pipefail

ALIAS="${MINIO_ALIAS:-wonder}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/wonder/bi/cols-cache/static-wasm"
VERSION="$(sed -n "s/export const colsCacheVersion = '\([^']*\)'.*/\1/p" "$ROOT/wonder/bi/cols-cache/cols-cache-version.js")"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mc mirror --overwrite "$ROOT/jb6/react/lib" "$ALIAS/wonder-code-packages/cdn"
mc mirror --overwrite "$ROOT/wonder/images" "$ALIAS/wonder-code-packages/cdn/images"
cp "$SRC/duckdb-wasm.js" "$STAGE/duckdb-wasm-$VERSION.js"
cp "$SRC/cc-worker.js" "$STAGE/cc-worker-$VERSION.js"
cp "$SRC/range-worker.js" "$STAGE/range-worker-$VERSION.js"
cp "$SRC/e2e-worker.js" "$STAGE/e2e-worker-$VERSION.js"
cp "$SRC/duckdb-dist/arrow.bundle.mjs" "$STAGE/arrow-$VERSION.mjs"
cp "$SRC/duckdb-dist/st/duckdb-eh.js" "$STAGE/duckdb-eh-$VERSION.js"
cp "$SRC/duckdb-dist/st/duckdb-eh.wasm" "$STAGE/duckdb-eh-$VERSION.wasm"
sed -i.bak "s#./duckdb-dist/arrow.bundle.mjs#./arrow-$VERSION.mjs#; s#./cc-worker.js#./cc-worker-$VERSION.js#" "$STAGE/duckdb-wasm-$VERSION.js"
for worker in cc-worker e2e-worker; do
  sed -i.bak "/cols-cache-version.js/d; s#const { default: createModule } = await import(colsCacheRuntime.js)#import createModule from './duckdb-eh-$VERSION.js'#;
    s#const runtimeUrls = { 'duckdb_wasm.wasm': colsCacheRuntime.wasm }#const runtimeUrls = { 'duckdb_wasm.wasm': new URL('./duckdb-eh-$VERSION.wasm', import.meta.url).href }#;
    s#./duckdb-dist/arrow.bundle.mjs#./arrow-$VERSION.mjs#" "$STAGE/$worker-$VERSION.js"
done
rm "$STAGE"/*.bak
mc mirror --overwrite "$STAGE" "$ALIAS/wonder-code-packages/lib/cols-cache"
