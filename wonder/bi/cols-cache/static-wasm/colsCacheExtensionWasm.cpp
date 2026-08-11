// colsCacheExtensionWasm.cpp — the browser (wasm_eh) twin of colsCacheExtension.cpp.
// Same range-cache VFS + per-row-group parallel parquet scan + logging/stats (shared in
// colsCacheLog.h + colsCacheCore.h, from the parent dir via -I); the ONLY change is the fetch
// mechanism: the native NodeBridge (fork Node → GCS Range-GET → local file) is replaced by a fully
// synchronous page-fault trio — `fault_range` (sync Range-GET → OPFS write) + `read_range`/`have_range`
// — run on DuckDB's Web Worker where sync XHR + FileSystemSyncAccessHandle are legal, so no Asyncify is
// needed. parquet is statically linked into this side module (like the native build); duckdb core
// resolves from the host duckdb.wasm.
//
//   SELECT * FROM cols_cache('room://testPublicRoom/taxi.parquet');

#include "colsCacheLog.h"
#include <emscripten.h>

namespace duckdb {

// ── the page-fault bridge: JS owns the OPFS cache + the fetch, all synchronous. ──
// The extension runs on DuckDB's Web Worker, where sync XHR + FileSystemSyncAccessHandle are legal,
// so no Asyncify is needed. present? — is this range already in OPFS. fault — sync fetch(Range)+OPFS
// write. read — sync-copy the cached range into wasm memory `buf`. tail — suffix GET → object size.
static int have_range(const char *url, double off, double len) {
	return MAIN_THREAD_EM_ASM_INT({ return Module.haveRange(UTF8ToString($0), $1, $2) ? 1 : 0; }, url, off, len);
}
static void fault_range(const char *url, double off, double len) {
	MAIN_THREAD_EM_ASM({ Module.faultRange(UTF8ToString($0), $1, $2); }, url, off, len);
}
static void read_range(const char *url, double off, double len, void *buf) {
	MAIN_THREAD_EM_ASM({ Module.readRange(UTF8ToString($0), $1, $2, $3); }, url, off, len, buf);
}
static double tail_size(const char *url) {
	return MAIN_THREAD_EM_ASM_DOUBLE({ return Module.tailSize(UTF8ToString($0)); }, url);
}

// ── one open remote object: its wUrl and total size (faulted once via tail_size). ──
struct RangeImage {
	string wurl;
	idx_t size = 0;

	static unique_ptr<RangeImage> Load(const string &wurl) {
		auto img = make_uniq<RangeImage>();
		img->wurl = wurl;
		img->size = (idx_t)tail_size(wurl.c_str());   // suffix GET → size; JS caches the tail slice in OPFS (double→idx_t: sizes < 2^53)
		CppLog(R"("t":"file.size","file":")" + JStr(wurl) + R"(","size":)" + std::to_string(img->size));
		return img;
	}

	static void Prefetch(const string &wurl, const vector<pair<idx_t, idx_t>> &ranges, const string &cols) {
		std::ostringstream packed;
		for (idx_t i = 0; i < ranges.size(); i++) packed << (i ? "," : "") << ranges[i].first << ":" << ranges[i].second;
		MAIN_THREAD_EM_ASM({ Module.prefetchRanges(UTF8ToString($0), UTF8ToString($1), UTF8ToString($2)); },
			wurl.c_str(), packed.str().c_str(), cols.c_str());
	}

	// serve [location,len): OPFS hit → sync read; miss → sync page-fault (fetch→OPFS) then read.
	void Read(void *buffer, idx_t location, idx_t len) {
		auto t0 = NowMs();
		bool hit = have_range(wurl.c_str(), (double)location, (double)len);
		if (!hit) fault_range(wurl.c_str(), (double)location, (double)len);
		read_range(wurl.c_str(), (double)location, (double)len, buffer);
		ScanStats::Get().Tally(wurl, hit, len, (NowMs() - t0) * 1000);
	}
};

} // namespace duckdb

#include "colsCacheCore.h"
#include "duckdb/main/extension.hpp"

// static-link entry (parquet's twin): same TU as the static LoadInternal, so no cross-TU symbol.
// duckdb_web_cols_cache_init(db) is called from webdb.cc at DB open, mirroring duckdb_web_parquet_init.
namespace duckdb {
struct ColsCacheExtension : public Extension {
	void Load(ExtensionLoader &loader) override { LoadInternal(loader); }
	std::string Name() override { return "cols_cache"; }
	std::string Version() const override { return "v0.0.1"; }
};
}
extern "C" void duckdb_web_cols_cache_init(duckdb::DuckDB *db) { db->LoadStaticExtension<duckdb::ColsCacheExtension>(); }
