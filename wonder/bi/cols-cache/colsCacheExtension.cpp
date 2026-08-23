// colsCacheExtension.cpp — native (linux) cols_cache: a range-cache VFS that reads a remote parquet
// object lazily, one byte-range at a time, filling a local cache dir on demand via a Node child
// (Node→GCS Range requests). The VFS + parallel parquet scan + logging/stats are shared in
// colsCacheLog.h + colsCacheCore.h; this file holds only the native fetch backend (NodeBridge) and
// the RangeImage that drives it.
//
//   SELECT * FROM cols_cache('room://testPublicRoom/taxi.parquet');
//
// Read(location,len): key="<location>-<len>"; hit -> read cache/<hash>/key; miss -> Node Range-GETs
// from GCS, writes cache/<hash>/key, acks -> read it. The bridge matches DuckDB's synchronous blocking
// Read to Node's async streaming acks: a shared Node child + one stdout-reader thread + an id->promise table.

#include "colsCacheLog.h"
#include "duckdb/common/local_file_system.hpp"
#define PICOJSON_USE_INT64
#include "picojson.h"
#include <future>
#include <thread>
#include <fstream>
#include <unistd.h>
#include <sys/wait.h>
#include <dlfcn.h>

namespace duckdb {

// HOST_DIR (where colsCacheService.js lives) and CACHE_ROOT are env-overridable so the same binary runs in the container.
static string EnvOr(const char *name, const char *fallback) { auto v = getenv(name); return v && *v ? string(v) : string(fallback); }
// fallback = this .so's own directory (colsCacheService.js ships beside it in both dev and container), so no env is needed.
static string SelfDir() { Dl_info info; if (dladdr((void *)&EnvOr, &info) && info.dli_fname) { string p = info.dli_fname; auto s = p.find_last_of('/'); if (s != string::npos) return p.substr(0, s); } return "."; }
static const string HOST_DIR = EnvOr("COLS_CACHE_HOST_DIR", SelfDir().c_str());
static const string CACHE_ROOT = EnvOr("COLS_CACHE_ROOT", "/tmp/cols_cache");

// ── the async<->sync bridge: one Node child, one stdout-reader thread, an id->promise table.
//    Each request is one range -> one ack line -> one promise; the caller blocks on the future
//    until the reader thread parses that line. ──
class NodeBridge {
public:
	static NodeBridge &Get() {
		static NodeBridge inst;
		return inst;
	}

	// suffix Range-GET of the file tail into dir (footer slice), returning total object size (from Content-Range).
	idx_t Tail(const string &wurl, const string &dir) {
		auto ack = Request([&](std::ostream &o) { o << R"(,"cmd":"tail","wUrl":")" << wurl << R"(","dir":")" << dir << "\"}"; });
		return NumericCast<idx_t>(ack.at("size").get<int64_t>());
	}

	// fetch one range into dir/file; blocks until Node acks it written.
	void Fetch(const string &wurl, const string &dir, const string &file, idx_t offset, idx_t length) {
		if (WaitFor(dir + "/" + file) && LocalFileSystem::CreateLocal()->FileExists(dir + "/" + file)) return;
		Request([&](std::ostream &o) {
			o << R"(,"cmd":"fetch","wUrl":")" << wurl << R"(","dir":")" << dir << R"(","need":[{"file":")" << file
			  << R"(","offset":)" << offset << R"(,"length":)" << length << "}]}";
		});
	}

	void Prefetch(const string &wurl, const string &dir, const vector<pair<idx_t, idx_t>> &ranges, const string &cols) {
		vector<pair<string, std::shared_ptr<std::promise<void>>>> missing;
		auto local = LocalFileSystem::CreateLocal();
		{
			lock_guard<mutex> g(lock);
			for (auto &r : ranges) {
				auto file = std::to_string(r.first) + "-" + std::to_string(r.second), key = dir + "/" + file;
				if (local->FileExists(key) || fetching.count(key)) continue;
				auto p = std::make_shared<std::promise<void>>();
				fetching[key] = p->get_future().share();
				missing.emplace_back(file, p);
			}
			CppLog(R"("t":"prefetch.plan","packed":")" + JStr(cols) + R"(","planned":)" + std::to_string(ranges.size()) +
			       R"(,"cached":)" + std::to_string(ranges.size() - missing.size()) + R"(,"missing":)" + std::to_string(missing.size()));
			if (missing.empty()) return;
			auto id = next_id.fetch_add(1);
			batches[id] = {dir, missing};
			std::ostringstream o;
			o << R"({"id":)" << id << R"(,"cmd":"fetch","wUrl":")" << wurl << R"(","dir":")" << dir
			  << R"(","preFetchCols":")" << cols << R"(","need":[)";
			for (idx_t i = 0; i < missing.size(); i++) {
				auto r = rangesFor(missing[i].first, ranges);
				o << (i ? "," : "") << R"({"file":")" << missing[i].first << R"(","offset":)" << r.first
				  << R"(,"length":)" << r.second << "}";
			}
			o << "]}\n";
			Write(o.str());
		}
	}

private:
	NodeBridge() {
		Spawn();
		reader = std::thread([this] { ReadLoop(); });
		reader.detach();
	}

	void Spawn() {
		int in_pipe[2], out_pipe[2];
		if (pipe(in_pipe) || pipe(out_pipe)) {
			throw IOException("cols_cache: pipe failed");
		}
		auto pid = fork();
		if (pid == 0) {
			dup2(in_pipe[0], 0);
			dup2(out_pipe[1], 1);
			close(in_pipe[1]);
			close(out_pipe[0]);
			if (chdir(HOST_DIR.c_str()) != 0) {
				_exit(126);
			}
			execlp("node", "node", "--import", "./nodejs-importmap.js", "colsCacheService.js", ActiveLoggers().c_str(), (char *)nullptr);   // pass the ctx logger list as colsCacheService's argv[2]
			_exit(127);
		}
		close(in_pipe[0]);
		close(out_pipe[1]);
		to_node = in_pipe[1];
		from_node = out_pipe[0];
	}

	// send {"id":N,<body>}\n, then block until the reader thread hands back the parsed ack object for this id.
	template <class Body>
	picojson::object Request(Body body) {
		auto id = next_id.fetch_add(1);
		std::promise<picojson::object> prom;
		auto fut = prom.get_future();
		{
			lock_guard<mutex> g(lock);
			pending.emplace(id, std::move(prom));
		}
		std::ostringstream o;
		o << "{\"id\":" << id;
		body(o);
		o << "\n";
		auto s = o.str();
		Write(s);
		auto ack = fut.get();
		if (!ack.at("ok").get<bool>()) {
			throw IOException("cols_cache: node error: " + ack.at("error").to_str());
		}
		return ack;
	}

	// parse one ack line and fulfill its promise by "id".
	void Handle(const string &line) {
		picojson::value v;
		if (!picojson::parse(v, line).empty() || !v.is<picojson::object>()) {
			return;
		}
		auto &obj = v.get<picojson::object>();
		auto id = NumericCast<idx_t>(obj.at("id").get<int64_t>());
		lock_guard<mutex> g(lock);
		auto bit = batches.find(id);
		if (bit != batches.end()) {
			if (obj.count("wrote")) for (auto &w : obj.at("wrote").get<picojson::array>()) {
				auto file = w.get<picojson::object>().at("file").get<string>(), key = bit->second.dir + "/" + file;
				for (auto &p : bit->second.files) if (p.first == file) p.second->set_value();
				fetching.erase(key);
			}
			if (obj.count("done") || !obj.at("ok").get<bool>()) {
				for (auto &p : bit->second.files) {
					auto key = bit->second.dir + "/" + p.first;
					if (fetching.erase(key)) p.second->set_value();
				}
				batches.erase(bit);
			}
			return;
		}
		auto it = pending.find(id);
		if (it == pending.end()) {
			return;
		}
		it->second.set_value(obj);
		pending.erase(it);
	}

	bool WaitFor(const string &key) {
		std::shared_future<void> f;
		{ lock_guard<mutex> g(lock); auto it = fetching.find(key); if (it == fetching.end()) return false; f = it->second; }
		f.wait();
		return true;
	}

	void Write(const string &s) {
		lock_guard<mutex> g(write_lock);
		auto rc = write(to_node, s.data(), s.size());
		(void)rc;
	}

	static pair<idx_t, idx_t> rangesFor(const string &file, const vector<pair<idx_t, idx_t>> &ranges) {
		for (auto &r : ranges) if (file == std::to_string(r.first) + "-" + std::to_string(r.second)) return r;
		return {0, 0};
	}

	void ReadLoop() {
		string acc;
		char b[4096];
		while (true) {
			auto n = read(from_node, b, sizeof b);
			if (n <= 0) {
				return;
			}
			acc.append(b, NumericCast<size_t>(n));
			for (size_t nl; (nl = acc.find('\n')) != string::npos;) {
				Handle(acc.substr(0, nl));
				acc.erase(0, nl + 1);
			}
		}
	}

	std::atomic<idx_t> next_id {1};
	int to_node = -1, from_node = -1;
	std::thread reader;
	mutex lock, write_lock;
	unordered_map<idx_t, std::promise<picojson::object>> pending;
	struct Batch { string dir; vector<pair<string, std::shared_ptr<std::promise<void>>>> files; };
	unordered_map<idx_t, Batch> batches;
	unordered_map<string, std::shared_future<void>> fetching;
};

// stable short hash of the wUrl -> cache subdir name.
static string HashDir(const string &wurl) {
	std::hash<string> h;
	return CACHE_ROOT + "/" + std::to_string(h(wurl));
}

// ── one open remote object: its wUrl, cache dir, and total size (fetched once). ──
struct RangeImage {
	string wurl, dir;
	idx_t size = 0;

	static unique_ptr<RangeImage> Load(const string &wurl) {
		auto img = make_uniq<RangeImage>();
		img->wurl = wurl;
		img->dir = HashDir(wurl);
		auto local = LocalFileSystem::CreateLocal();
		bool dirExisted = local->DirectoryExists(img->dir);
		local->CreateDirectory(CACHE_ROOT);
		local->CreateDirectory(img->dir);
		CppLog(R"("t":"cache.root","cacheRoot":")" + CACHE_ROOT + R"(","dir":")" + img->dir + R"(","dirExisted":)" + (dirExisted ? "true" : "false"));
		// Parquet is read tail-first (footer at EOF), so size is discovered by a suffix Range-GET: Node fetches the last
		// TAIL_BYTES, GCS returns the total in Content-Range, and that tail slice is cached like any <off>-<len> data slice
		// so the reader's own footer read hits it. We persist that size in <dir>/.size so a later process (each query is a
		// fresh process) reads it and skips even the tail GET — warm cache ⇒ zero GCS. One request cold, none warm, no HEAD.
		auto sizePath = img->dir + "/.size";
		std::ifstream sf(sizePath);
		if (sf >> img->size && img->size > 0) {
		} else {
			img->size = NodeBridge::Get().Tail(wurl, img->dir);
			std::ofstream(sizePath) << img->size;
		}
		CppLog(R"("t":"file.size","file":")" + JStr(wurl) + R"(","size":)" + std::to_string(img->size));
		return img;
	}

	static void Prefetch(const string &wurl, const vector<pair<idx_t, idx_t>> &ranges, const string &cols) {
		NodeBridge::Get().Prefetch(wurl, HashDir(wurl), ranges, cols);
	}

	// serve [location,len): read the cache file <location>-<len>, fetching on miss. every read is a hit (served straight
	// from local disk by THIS C++ VFS, no Node round-trip) or a miss (Node Range-GETs from GCS). we don't log per read -
	// that floods the wire; we TALLY into ScanStats and the scan's last drainer flushes one scan.summary at the end.
	void Read(void *buffer, idx_t location, idx_t len) {
		auto key = std::to_string(location) + "-" + std::to_string(len);
		auto path = dir + "/" + key;
		auto local = LocalFileSystem::CreateLocal();
		auto t0 = NowMs();
		bool hit = local->FileExists(path);
		if (!hit) {
			NodeBridge::Get().Fetch(wurl, dir, key, location, len);
		}
		std::ifstream f(path, std::ios::binary);
		f.read(reinterpret_cast<char *>(buffer), NumericCast<std::streamsize>(len));
		ScanStats::Get().Tally(wurl, hit, len, (NowMs() - t0) * 1000);
	}
};

} // namespace duckdb

#include "colsCacheCore.h"

extern "C" {
DUCKDB_CPP_EXTENSION_ENTRY(cols_cache, loader) {
	duckdb::LoadInternal(loader);
}
}
