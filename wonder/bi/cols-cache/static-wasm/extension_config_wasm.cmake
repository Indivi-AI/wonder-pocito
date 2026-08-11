# minimal wasm extension config — parquet only, no OpenSSL/curl (unlike the repo's cache_httpfs default).
# purpose: get the wasm-compiled libparquet_extension.a to statically link into our cols_cache side module.
duckdb_extension_load(parquet)
