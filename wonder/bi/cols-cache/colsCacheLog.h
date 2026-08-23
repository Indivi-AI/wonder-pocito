// colsCacheLog.h — shared logging + per-query byte-traffic stats for both cols_cache extensions.
// Included FIRST by each platform .cpp (before its RangeImage), since RangeImage::Load emits CppLog
// and RangeImage::Read tallies ScanStats. ActiveLoggers gates every emit to the ctx's requested logger list.
#pragma once
#include "duckdb.hpp"
#include <atomic>
#include <chrono>
#include <sstream>
#include <thread>

namespace duckdb {

static constexpr const char *SP_PREFIX = "colscache://";
// the ctx's active-logger list for this query. one process serves one query, so this process-global IS per-query.
static string &ActiveLoggers() { static string s; return s; }
static string &PreFetchCols() { static string s; return s; }

// emit one JSONL log envelope to stderr; the host router surfaces it. src:"cpp" marks this extension's origin.
static void CppLog(const string &fields, const char *logger = "colsCacheLogger") {
	if (ActiveLoggers().find(logger) == string::npos) return;
	std::ostringstream out;
	out << R"({"kind":"log","logger":")" << logger << R"(","channel":"info","event":{"src":"cpp","thread":")"
	    << std::this_thread::get_id() << R"(",)" << fields << "}}\n";
	static mutex lock; lock_guard<mutex> guard(lock); std::cerr << out.str();
}
// insideDuckdbLogger: optimizer/executor decisions visible only from inside the scan node (pushdown, pruning, cardinality).
static void InLog(const string &fields) { CppLog(fields, "insideDuckdbLogger"); }
static string JStr(const string &s) { string o; for (char c : s) { if (c == '"' || c == '\\') o += '\\'; o += c; } return o; }
static double NowMs() { return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
static string BaseName(const string &wurl) { auto s = wurl.find_last_of('/'); return s == string::npos ? wurl : wurl.substr(s + 1); }

// ── per-query byte-traffic aggregator. One process serves one query, so a single process-global accumulator
//    IS per-query: Init resets it + emits scan.plan; RangeImage::Read tallies each hit/miss; the scan's last
//    drainer flushes scan.summary + per-file rollups. hit/miss Ms = local-serve vs blocked-on-fetch wall time. ──
struct PerFile { idx_t hits = 0, misses = 0, hitBytes = 0, missBytes = 0; uint64_t us = 0; };
struct ScanStats {
	std::atomic<idx_t> hits {0}, misses {0}, hitBytes {0}, missBytes {0};
	std::atomic<uint64_t> hitUs {0}, missUs {0};
	std::atomic<double> firstReadMs {0};
	std::mutex flushLock, fileLock;
	unordered_map<string, PerFile> byFile;
	bool flushed = true;
	static ScanStats &Get() { static ScanStats s; return s; }
	void Reset() { hits = misses = hitBytes = missBytes = 0; hitUs = missUs = 0; firstReadMs = 0; flushed = false; lock_guard<mutex> g(fileLock); byFile.clear(); }
	void Tally(const string &wurl, bool hit, idx_t bytes, double us) {
		double zero = 0; firstReadMs.compare_exchange_strong(zero, NowMs());
		if (hit) { hits++; hitBytes += bytes; hitUs += (uint64_t)us; }
		else     { misses++; missBytes += bytes; missUs += (uint64_t)us; }
		lock_guard<mutex> g(fileLock); auto &f = byFile[BaseName(wurl)];
		if (hit) { f.hits++; f.hitBytes += bytes; } else { f.misses++; f.missBytes += bytes; }
		f.us += (uint64_t)us;
	}
	void Flush() {   // called by every drainer; the mutex+flushed flag make it fire exactly once per query
		lock_guard<mutex> g(flushLock);
		if (flushed) return;
		flushed = true;
		std::ostringstream o;
		o << R"("t":"scan.summary","hits":)" << hits.load() << R"(,"misses":)" << misses.load()
		  << R"(,"hitBytes":)" << hitBytes.load() << R"(,"missBytes":)" << missBytes.load()
		  << R"(,"hitMs":)" << hitUs.load() / 1000 << R"(,"missMs":)" << missUs.load() / 1000
		  << R"(,"streamMs":)" << (idx_t)(firstReadMs.load() ? NowMs() - firstReadMs.load() : 0);
		CppLog(o.str());
		lock_guard<mutex> gf(fileLock);
		for (auto &kv : byFile) {   // one scan.file per parquet object: bytes + ms attributed to that file
			auto &f = kv.second;
			std::ostringstream fo;
			fo << R"("t":"scan.file","file":")" << kv.first << R"(","hits":)" << f.hits << R"(,"misses":)" << f.misses
			   << R"(,"hitBytes":)" << f.hitBytes << R"(,"missBytes":)" << f.missBytes << R"(,"ms":)" << f.us / 1000;
			CppLog(fo.str());
		}
	}
};

} // namespace duckdb
