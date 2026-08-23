#!/usr/bin/env bash
# we use ~/projects/duck-read-cache-fs to build
# build.sh — compile the cols_cache C++ loadable extension directly
# against the already-built vendored duckdb v1.5.4: hidden visibility, static-link
# parquet + duckdb + dummy loader (resolves RTTI/typeinfo), gc unused sections,
# then append the DuckDB metadata footer. Override the duckdb tree with DUCKDB_ROOT.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="${TMPDIR:-/tmp}/cols-cache-build"; mkdir -p "$TMP"  # intermediate .o/.so land here, not in tracked source dir
ROOT="${DUCKDB_ROOT:-$HOME/projects/duck-read-cache-fs}"  # engine tree from provision.sh (override with DUCKDB_ROOT)
DUCKDB="$ROOT/duckdb"
BUILD="$ROOT/build/release"
CI="$ROOT/extension-ci-tools/scripts"
NAME=cols_cache                                # extension identity (SQL fn, .duckdb_extension, entry macro)
SRC=colsCacheExtension                         # C++ source file stem (camelCase, decoupled from NAME)
EV=v0.0.1                                       # extension version
DV=v1.5.4                                       # duckdb engine version (must match host)

INCLUDES=(
  -I"$DUCKDB/src/include"
  -I"$DUCKDB/extension"
  -I"$DUCKDB/extension/parquet/include"
  -I"$DUCKDB/third_party/parquet"
  -I"$DUCKDB/third_party/thrift"
  -I"$DUCKDB/third_party/lz4"
  -I"$DUCKDB/third_party/snappy"
  -I"$DUCKDB/third_party/brotli/include"
  -I"$DUCKDB/third_party/fastpforlib"
  -I"$DUCKDB/third_party/fmt/include"
  -I"$DUCKDB/third_party/fsst"
  -I"$DUCKDB/third_party/re2"
  -I"$DUCKDB/third_party/miniz"
  -I"$DUCKDB/third_party/utf8proc/include"
  -I"$DUCKDB/third_party/concurrentqueue"
  -I"$DUCKDB/third_party/fast_float"
  -I"$DUCKDB/third_party/mbedtls/include"
  -I"$BUILD/codegen/include"
)
DEFINES=(
  -DDUCKDB_BUILD_LIBRARY
  -DDUCKDB_BUILD_LOADABLE_EXTENSION
  -DDUCKDB_EXTENSION_PARQUET_LINKED=1
  -DDUCKDB_MAJOR_VERSION=1 -DDUCKDB_MINOR_VERSION=5 -DDUCKDB_PATCH_VERSION=4
)
# statically linked into the .so so RTTI/typeinfo (e.g. SimpleNamedParameterFunction) resolves
LIBS=(
  "$BUILD/extension/parquet/libparquet_extension.a"
  "$BUILD/src/libduckdb_static.a"
  "$BUILD/extension/libdummy_static_extension_loader.a"
)

EXT="$HERE/${NAME}.duckdb_extension"
if [ "$EXT" -nt "$HERE/${SRC}.cpp" ] && [ "$EXT" -nt "$HERE/colsCacheCore.h" ] && [ "$EXT" -nt "$HERE/colsCacheLog.h" ] &&
   [ "$EXT" -nt "$HERE/picojson.h" ]; then
  echo "up-to-date: $EXT (source unchanged; skipping compile)"; exit 0
fi

echo "== compile object =="
set -x
/usr/bin/c++ -std=c++11 -fPIC -fvisibility=hidden -O3 -DNDEBUG "${DEFINES[@]}" "${INCLUDES[@]}" \
  -c "$HERE/${SRC}.cpp" -o "$TMP/${NAME}.o"
set +x

echo "== link loadable =="
set -x
/usr/bin/c++ -fPIC -O3 -DNDEBUG -shared -Wl,-soname,${NAME}.duckdb_extension \
  -o "$TMP/${NAME}.so" "$TMP/${NAME}.o" \
  "${LIBS[@]}" -Wl,--gc-sections -Wl,--exclude-libs,ALL -ldl
set +x

echo "== append duckdb metadata footer =="
python3 "$CI/append_extension_metadata.py" \
  -l "$TMP/${NAME}.so" -n "$NAME" -ev "$EV" -dv "$DV" \
  --abi-type CPP -p linux_amd64 \
  -o "$HERE/${NAME}.duckdb_extension"

echo "built: $HERE/${NAME}.duckdb_extension"
echo "duckdb: $BUILD/duckdb"
