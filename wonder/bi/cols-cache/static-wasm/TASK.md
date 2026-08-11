# static-wasm — staged bring-up of the wasm cols_cache page-fault

Goal: run the native `cols_cache` design in one statically linked DuckDB WASM engine, with
an OPFS range cache and a page-fault boundary that is safe for real multithreaded scans.

## The native protocol we imitate (source of truth)
Requests C++→JS (one JSON obj per line):
- `{"id":N,"cmd":"tail","wUrl":W,"dir":D}`
- `{"id":N,"cmd":"fetch","wUrl":W,"dir":D,"need":[{"file":"<off>-<len>","offset":O,"length":L}]}`

Acks JS→C++:
- `{"id":N,"ok":true,"size":S}`                      (tail)
- `{"id":N,"ok":true,"wrote":[{"file":"<off>-<len>","bytes":B}]}`   (fetch)
- `{"id":N,"ok":false,"error":E}`

`file` = `"<offset>-<length>"` is both the cache key and the VFS Read key.

## Current boundary
- Synchronous WASM hooks: `tailSize`, `haveRange`, `faultRange`, and `readRange`.
- OPFS stores one file per object: Parquet bytes followed by a persisted 64 KiB page bitmap.
- Object handles are opened asynchronously before the query; page faults and byte copies are
  synchronous inside DuckDB's worker.
- Stage 5 must make these hooks safe when calls originate from DuckDB pthread workers.

## Stages (do one after the other, each a runnable html)
1. **WASM SQL execution** — boot the static engine and verify `select 42`; no filesystem.
2. **OPFS without a page fault** — prefill a local Parquet object, query it, and prove zero faults.
3. **WASM-generated page fault** — start with missing data pages, read a real column, and prove
   WASM calls JS to fetch the required ranges.
4. **Populate, notify, persist, and stream** — notify as each range reaches OPFS, prove a fresh
   worker reuses it with zero faults, then repeat through a resolved `room://` GCS URL.
5. **Multithreaded WASM** — run a multi-row-group scan on the COI pthread build and prove more than
   one DuckDB worker claims row groups while page faults cross safely to the module worker.
6. **Cold taxi** — scan the real 45MB taxi Parquet from an empty OPFS cache and populate only the ranges required
   by the numeric aggregation.
7. **Hot taxi performance** — use a fresh DuckDB worker, prove its warm-up reuses those ranges with zero faults,
   then time seven scans and require zero page faults on every measured run.

## Status
- [x] Stage 1
- [x] Stage 2
- [x] Stage 3
- [x] Stage 4
- [x] Stage 5 (GCS stream) / [ ] Stage 5 (multithreaded COI)
- [x] Stage 6
- [x] Stage 7
