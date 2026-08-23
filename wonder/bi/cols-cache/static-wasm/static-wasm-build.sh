#!/usr/bin/env bash
# static-wasm-build.sh — build ONE duckdb-eh.wasm with cols_cache statically linked in (no dlopen, no
# side-module, no INSTALL/LOAD). Our IP (colsCacheExtensionWasm.cpp + colsCacheCore.h + colsCacheLog.h)
# lives in Genie and is COPIED into the duckdb-wasm engine builder as a scratch extension, wired into
# duckdb_web exactly like the built-in parquet extension (LoadStaticExtension at DB open). Artifacts
# (duckdb-eh.wasm + duckdb-eh.js) are copied back to static-wasm/duckdb-dist/. Reuses our local v1.5.4 duckdb
# tree as DUCKDB_LOCATION so engine + extension share one ABI. Build under emsdk 3.1.71.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENIE_SRC="$HERE"                                            # our IP: colsCacheExtensionWasm.cpp + ../colsCache*.h
WASM="${DUCKDB_WASM_ROOT:-$HOME/projects/duckdb-wasm}"       # the engine-wasm builder (duckdb/duckdb-wasm HEAD)
DUCKDB="${DUCKDB_LOCATION:-$HOME/projects/duck-read-cache-fs/duckdb}"   # v1.5.4 tree (matches vendored engine ABI)
LIB="$WASM/lib"
MODE="${1:-coi}"
JOBS="${BUILD_JOBS:-6}"
DIST="$HERE/duckdb-dist"
[[ "$MODE" == st ]] && DIST="$DIST/st"
( cd "$HOME/emsdk" && ./emsdk activate 3.1.57 ) >/dev/null 2>&1   # coi/pthread build requires emsdk 3.1.57 (3.1.71 breaks on Arrow+SIMD em_asm.h)
source "$HOME/emsdk/emsdk_env.sh" >/dev/null 2>&1

echo "== copy our IP into the builder as a scratch extension =="
CC="$LIB/cols_cache"; mkdir -p "$CC"
cp "$GENIE_SRC/colsCacheExtensionWasm.cpp" "$HERE/../colsCacheCore.h" "$HERE/../colsCacheLog.h" "$CC/"
cp "$GENIE_SRC/duckdb-overrides/parquet_reader.cpp" "$DUCKDB/extension/parquet/parquet_reader.cpp"

echo "== declare the static-load entry (defined in colsCacheExtensionWasm.cpp, its own TU) =="
# The ColsCacheExtension + duckdb_web_cols_cache_init live in colsCacheExtensionWasm.cpp (same TU as
# LoadInternal → inlined, no cross-TU symbol). Here we only publish the C entry's declaration for webdb.cc.
cat > "$LIB/include/duckdb/web/extensions/cols_cache_extension.h" <<'EOF'
#ifndef INCLUDE_DUCKDB_WEB_EXTENSIONS_COLS_CACHE_EXTENSION_H_
#define INCLUDE_DUCKDB_WEB_EXTENSIONS_COLS_CACHE_EXTENSION_H_
#include "duckdb/main/database.hpp"
extern "C" void duckdb_web_cols_cache_init(duckdb::DuckDB* db);
#endif
EOF

echo "== wire cols_cache into lib/CMakeLists.txt (idempotent) =="
python3 - "$LIB/CMakeLists.txt" <<'PY'
import sys
f=sys.argv[1]; s=open(f).read()
if 'duckdb_web_cols_cache' not in s:
  # new lib next to duckdb_web_parquet, compiled from our copied sources + wrapper
  add=('''  add_library(
    duckdb_web_cols_cache
    ${CMAKE_SOURCE_DIR}/cols_cache/colsCacheExtensionWasm.cpp)
  target_include_directories(duckdb_web_cols_cache PRIVATE ${CMAKE_SOURCE_DIR}/cols_cache
    ${DUCKDB_SOURCE_DIR}/extension/parquet/include ${DUCKDB_SOURCE_DIR}/third_party/parquet
    ${DUCKDB_SOURCE_DIR}/third_party/thrift ${DUCKDB_SOURCE_DIR}/third_party/fastpforlib)
  target_link_libraries(duckdb_web_cols_cache duckdb duckdb_parquet)
''')
  s=s.replace('''  add_library(
    duckdb_web_json
    ${CMAKE_SOURCE_DIR}/src/extensions/json_extension.cc)
''', '''  add_library(
    duckdb_web_json
    ${CMAKE_SOURCE_DIR}/src/extensions/json_extension.cc)

'''+add)
  s=s.replace('target_link_libraries(duckdb_web duckdb duckdb_web_parquet ${DUCKDB_WEB_JSON} arrow rapidjson ${THREAD_LIBS})',
              'target_link_libraries(duckdb_web duckdb duckdb_web_parquet duckdb_web_cols_cache ${DUCKDB_WEB_JSON} arrow rapidjson ${THREAD_LIBS})')
  open(f,'w').write(s); print('CMakeLists wired')
else: print('CMakeLists already wired')
PY

echo "== call our init at DB open in webdb.cc (idempotent) =="
python3 - "$LIB/src/webdb.cc" <<'PY'
import sys
f=sys.argv[1]; s=open(f).read()
if 'cols_cache_extension.h' not in s:
  s=s.replace('#include "duckdb/web/extensions/parquet_extension.h"',
              '#include "duckdb/web/extensions/parquet_extension.h"\n#include "duckdb/web/extensions/cols_cache_extension.h"')
  s=s.replace('        duckdb_web_parquet_init(db.get());',
              '        duckdb_web_parquet_init(db.get());\n        duckdb_web_cols_cache_init(db.get());')
  open(f,'w').write(s); print('webdb.cc wired')
else: print('webdb.cc already wired')
PY

echo "== neutralize httpfs (no networking; our DUCKDB_LOCATION lacks the wasm httpfs patch) =="
python3 - "$LIB/src/webdb.cc" <<'PY'
import sys
f=sys.argv[1]; s=open(f).read()
if 'bool preloaded_httpfs = false;' not in s:
  s=s.replace('struct PreloadedHttpfsInit {\n    PreloadedHttpfsInit() { preloaded_httpfs = true; }',
              'bool preloaded_httpfs = false;\nstruct PreloadedHttpfsInit {\n    PreloadedHttpfsInit() { preloaded_httpfs = true; }')
  s=s.replace('''        auto& config = duckdb::DBConfig::GetConfig(*db->instance);
        if (!config.http_util || config.http_util->GetName() != string("WasmHTTPUtils")) {
            config.http_util = make_shared_ptr<HTTPWasmUtil>();
        }''',
              '''        auto& config = duckdb::DBConfig::GetConfig(*db->instance);
        config.SetHTTPUtil(make_shared_ptr<HTTPWasmUtil>());''')
  open(f,'w').write(s); print('webdb.cc httpfs neutralized')
else: print('webdb.cc httpfs already neutralized')
PY

echo "== build $MODE DuckDB WASM =="
mkdir -p "$WASM/.ccache/extension"; touch "$WASM/.ccache/extension/json"
# coi = cross-origin-isolated pthread build: exceptions + threads(pool 4) + simd + bulk_memory, platform wasm_threads,
# link -pthread -sSHARED_MEMORY=1 (shared wasm memory → SharedArrayBuffer). Missing any of these yields a broken/mismatched
# artifact, so mirror the canonical recipe verbatim rather than letting CMake derive a partial config.
BUILD="$WASM/build/relperf/$MODE"; [[ "${CLEAN_BUILD:-}" ]] && rm -rf "$BUILD"; mkdir -p "$BUILD"
STAMP="$BUILD/third_party/duckdb/src/duckdb_ep-stamp/duckdb_ep-build"
[[ "$GENIE_SRC/duckdb-overrides/parquet_reader.cpp" -nt "$STAMP" ]] && rm -f "$STAMP"
if [[ "$MODE" == st ]]; then
  FEATURES=(-DWITH_WASM_EXCEPTIONS=1 -DWITH_WASM_THREADS=0 -DWITH_WASM_SIMD=1 -DWITH_WASM_BULK_MEMORY=1
    -DDUCKDB_CUSTOM_PLATFORM=wasm_eh -DDUCKDB_EXPLICIT_PLATFORM=wasm_eh)
  LINK=()
else
  FEATURES=(-DWITH_WASM_EXCEPTIONS=1 -DWITH_WASM_THREADS=1 -DWITH_WASM_SIMD=1 -DWITH_WASM_BULK_MEMORY=1
    -DDUCKDB_CUSTOM_PLATFORM=wasm_threads -DDUCKDB_EXPLICIT_PLATFORM=wasm_threads)
  LINK=(-DWASM_LINK_FLAGS_EXT="-pthread -sSHARED_MEMORY=1")
fi
( cd "$WASM" && emcmake cmake -S lib -B "$BUILD" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_C_COMPILER_LAUNCHER= -DCMAKE_CXX_COMPILER_LAUNCHER= \
    -DDUCKDB_LOCATION="$DUCKDB" \
    "${FEATURES[@]}" "${LINK[@]}" \
    -DDUCKDB_EXTENSION_CONFIGS="$WASM/extension_config_wasm.cmake" )
( cd "$WASM" && emmake make -C "$BUILD" -j"$JOBS" duckdb_wasm )

echo "== copy artifacts back to static-wasm/duckdb-dist =="
mkdir -p "$DIST"
cp "$BUILD/duckdb_wasm.wasm" "$DIST/duckdb-eh.wasm"
cp "$BUILD/duckdb_wasm.js"   "$DIST/duckdb-eh.js"
[[ "$MODE" == st ]] || cp "$BUILD/duckdb_wasm.worker.js" "$DIST/duckdb_wasm.worker.js"
printf '\nexport default DuckDB;\n' >> "$DIST/duckdb-eh.js"   # ESM default so the worker can: import createModule from './duckdb-eh.js'
echo "built single wasm: $DIST/duckdb-eh.wasm"
