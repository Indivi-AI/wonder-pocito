# full-compilation.md — log of every FULL wasm compilation of the cols_cache single-static engine

A "full compilation" = a from-scratch `emcmake cmake` + `emmake make duckdb_wasm` of the whole
DuckDB v1.5.4 tree (DUCKDB_LOCATION) + parquet + our cols_cache extension, under emscripten. These
are expensive (~full tree recompile) and each entry below records: what I compiled, why I *believed*
it was the last one, and why that belief was wrong (what I had missed the time before).

---

## Diff of the current recipe vs the canonical stock `coi` recipe

Canonical source: `~/projects/duckdb-wasm/scripts/wasm_build_lib.sh` (MODE=relperf, FEATURES=coi).

That script expands, for coi, to these cmake args:

```
-DCMAKE_BUILD_TYPE=Release                                  # from MODE=relperf
-DWITH_WASM_EXCEPTIONS=1 -DWITH_WASM_THREADS=1
-DWITH_WASM_SIMD=1 -DWITH_WASM_BULK_MEMORY=1
-DDUCKDB_CUSTOM_PLATFORM=wasm_threads -DDUCKDB_EXPLICIT_PLATFORM=wasm_threads
-DWASM_LINK_FLAGS_EXT="-pthread -sSHARED_MEMORY=1"          # LINK_FLAGS for coi
-DDUCKDB_LOCATION=${DUCKDB_LOCATION}
-DDUCKDB_EXTENSION_CONFIGS=extension_config_wasm.cmake
-DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache
-DDUCKDB_WASM_VERSION=${DUCKDB_WASM_VERSION_NAME}
-S lib -B build/relperf/coi
```

Our `static-wasm-build.sh` passes:

```
-DCMAKE_BUILD_TYPE=Release
-DWITH_WASM_EXCEPTIONS=1 -DWITH_WASM_THREADS=1
-DWITH_WASM_SIMD=1 -DWITH_WASM_BULK_MEMORY=1
-DDUCKDB_CUSTOM_PLATFORM=wasm_threads -DDUCKDB_EXPLICIT_PLATFORM=wasm_threads
-DWASM_LINK_FLAGS_EXT="-pthread -sSHARED_MEMORY=1"
-DDUCKDB_LOCATION="$DUCKDB"
-DDUCKDB_EXTENSION_CONFIGS="$WASM/extension_config_wasm.cmake"
-DCMAKE_C_COMPILER_LAUNCHER= -DCMAKE_CXX_COMPILER_LAUNCHER=   # ccache OFF
-S lib -B build/relperf/coi
```

**Every coi-relevant flag is identical.** The only differences are harness-level and do NOT change the
compiled artifact's threading/SIMD/exception ABI:

| Diff | Canonical | Ours | Affects the .wasm? |
|---|---|---|---|
| ccache | `ccache` on | launchers emptied (off) | No — build speed only |
| `DUCKDB_WASM_VERSION` | set to a name | omitted → `unknown` | No — version string only |
| Pre-cmake tree edits | none | we inject cols_cache lib + wire webdb.cc + neutralize httpfs | Yes, but this is our IP; orthogonal to the coi recipe |
| emsdk | whatever is active | pinned `3.1.57` | Toolchain, not a cmake flag (see below) |

Conclusion: the current build is the canonical coi recipe, verbatim, plus our cols_cache wiring.

---

## Compilation attempts

### Attempt #1 — single-thread `eh` build (relperf/eh)
- **What:** exceptions-only, `-sUSE_PTHREADS=0 -DDUCKDB_NO_THREADS=1`, platform `wasm_eh`.
- **Why I thought it was the last:** Stages 1–5 all passed (parse → browser fs → page fault → js
  populate+notify → GCS stream). The scan worked end to end; I assumed "done".
- **Why that was wrong:** a single-thread wasm can never run row groups in parallel. The C++ table
  function is already parallel (`MaxThreads()` = total_rgs, atomic row-group cursor), but with no
  pthread pool the engine collapses `MaxThreads` to 1. To actually scan multiple row groups
  concurrently the wasm itself must be a pthread build. So `eh` was necessary but not sufficient.
- **Lesson:** "the scan works" ≠ "the scan is parallel". Define the *runtime property* you're proving
  (threads>1 actually claimed row groups) up front, not just green output.

### Attempt #2 — first `coi` edit (INCOMPLETE recipe)
- **What:** flipped the build to threads by adding only `-DWITH_WASM_THREADS=1` and letting CMake
  derive the rest.
- **Why I thought it was the last:** I reasoned CMake's `WITH_WASM_THREADS` branch would pull in the
  whole threaded config automatically.
- **Why that was wrong:** the stock coi recipe is a *set* — it also needs `-DWITH_WASM_SIMD=1`,
  `-DWITH_WASM_BULK_MEMORY=1`, an explicit `-DDUCKDB_EXPLICIT_PLATFORM=wasm_threads`, and critically
  the link flags `-pthread -sSHARED_MEMORY=1` (shared wasm memory → SharedArrayBuffer). Omitting any
  yields a mismatched/broken artifact. I killed it and rewrote the script to mirror
  `wasm_build_lib.sh` coi verbatim.
- **Lesson:** a build "mode" is an atomic *set* of flags, not one switch. Copy the canonical recipe
  verbatim from source; never let CMake "derive the rest" and assume it matches.

### Attempt #3 — full coi recipe under emsdk 3.1.71
- **What:** the complete canonical coi flag set, but with the emsdk that happened to be active (3.1.71).
- **Why I thought it was the last:** the recipe was now byte-for-byte the stock coi recipe, verified
  against 3 in-repo sources (`wasm_build_lib.sh`, the Makefile, CMakeLists.txt) and an external
  DuckDB-WASM source.
- **Why that was wrong:** toolchain mismatch. Under `-msimd128`, emsdk 3.1.71's `em_asm.h` +
  Arrow/xxhash (`extern "C" { #include <emscripten.h> }`) fails: *"EM_ASM/EM_JS templates must have
  C++ linkage"*. This is an emscripten-version issue, not our code. WebSearch confirmed DuckDB-WASM's
  coi builds pin **emsdk 3.1.57**. Fixed by installing + activating 3.1.57 and pinning it in the
  build script.
- **Lesson:** the toolchain version is part of the recipe. A correct flag set on the wrong emsdk is
  still the wrong build; pin the exact emsdk the upstream project pins.

### Attempt #4 — coi under 3.1.57, but on a dirty tree
- **What:** correct recipe + correct emsdk, but the duckdb-wasm working tree still carried patches
  from the killed builds #2/#3.
- **Why I thought it was the last:** recipe correct, emsdk correct — should link cleanly.
- **Why that was wrong:** the httpfs-neutralize patch was **not idempotent**. Its guard checked for
  the permanent anchor `struct PreloadedHttpfsInit`, so every prior (killed) run re-inserted
  `bool preloaded_httpfs = false;`. Four insertions → `redefinition of 'preloaded_httpfs'`. Fixed by
  (a) `git checkout -- lib/src/webdb.cc lib/CMakeLists.txt` to restore pristine, and (b) changing the
  guard to test for the inserted line itself (`if 'bool preloaded_httpfs = false;' not in s`).
- **Lesson:** any patch applied to a shared tree across retries must be idempotent, and its guard must
  check for *what it inserts*, never for a pre-existing anchor. Start each real build from a pristine
  (`git checkout`) tree.

### Attempt #5 — coi under 3.1.57 on pristine tree (STOPPED by user)
- **What:** the full canonical coi recipe, emsdk 3.1.57, pristine tree, idempotent patches (each
  patch printed exactly once). Reached ~32% (duckdb core + parquet extension), **0 errors**.
- **Why I thought it was the last:** every previously-hit blocker was resolved — recipe verified
  against canonical + external sources, correct emsdk, clean tree, idempotent patching.
- **Status:** RESUMED and **linked at 100%, 0 errors**. Produced a 26MB `duckdb_wasm.wasm`, copied to
  `static-wasm/duckdb-dist/duckdb-eh.wasm`. Verified threaded: the wasm imports a **SHARED** memory
  (`a.a` flags=3, bit 0x02 set) — a genuine pthread coi build (single-thread `eh` would be flags=1).
  Still to prove at runtime: boot with SharedArrayBuffer (COOP/COEP) and drive a multi-row-group scan
  with threads>1.

### Attempt #6 — proxy cols_cache callbacks to the main runtime thread (SOURCE READY, NOT BUILT)
- **Why Attempt #5 is insufficient:** its COI flags and shared-memory artifact are valid, but
  `colsCacheExtensionWasm.cpp` used direct `EM_JS` callbacks. A DuckDB pthread therefore executed
  `Module.haveRange` in its own JS worker, whose worker-local `Module` has no cache hooks. Runtime
  evidence: Stages 1–2 passed, then Stage 3 failed inside generated `have_range` with
  `TypeError: Module.haveRange is not a function`.
- **Why this source change is grounded:** `POC-thread.cpp` already proved the required boundary:
  pthread callbacks that touch the module worker use synchronous `MAIN_THREAD_EM_ASM`. The POC
  handoff explicitly records that direct `EM_JS` sees the wrong `Module`. Emscripten 3.1.57 provides
  `MAIN_THREAD_EM_ASM`, `_INT`, and `_DOUBLE`, covering all four cols_cache callback signatures.
- **What changed:** `have_range`, `fault_range`, `read_range`, and `tail_size` now synchronously
  proxy to the module worker. `read_range` receives a pointer into shared WASM memory, so the module
  worker can copy OPFS bytes into the requesting pthread's buffer without another data channel.
  The JS stage worker also closes every OPFS access handle before returning its result.
- **Why this should fix the observed failure:** cache hooks and OPFS handles remain owned by the
  module worker, while DuckDB pthreads share only WASM memory and synchronously request cache work.
  This is the same ownership and dispatch model that passed the threaded POC.
- **What remains unproven:** the rebuilt artifact must pass a cold-cache Stage 3 and a multi-row-group
  Stage 5 that demonstrates more than one DuckDB worker claimed work. Until both pass, Attempt #6 is
  a justified correction, not a verified final build.
- **Build status:** launched with the Attempt #5 recipe and reached dependency compilation, then the
  background process ended without a compiler error or final artifact. The old local WASM remains.

---

## Standing lesson (host builds)
Each time I called it "the last compilation" I was reasoning from *one* correct dimension while a
second dimension was still wrong: (1) recipe complete but single-thread, (2) threads on but recipe
partial, (3) recipe complete but emsdk wrong, (4) recipe+emsdk right but tree dirty. "Last" is only
earned when recipe **and** toolchain **and** tree **and** runtime verification all hold at once.

---


## Standing lesson (extension builds)
The host is an immovable constant; the extension must conform to it on **every** boundary at once —
i64 legalization AND asyncify AND symbol imports. Each "last" call (E1 i64-native, E2 flag-removed,
E3 asyncify) fixed one boundary while another stayed wrong. The reliable oracle was never theory or
the POC — it was diffing our `.wasm` against a **known-good official v1.5.4 extension the host already
loads** (parquet, httpfs).
