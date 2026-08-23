// colsCacheCore.h — shared core for both cols_cache extensions: the range-cache VFS, the per-row-group
// parallel parquet table-function driver, and the extension entry (LoadInternal).
// The ONLY platform-specific piece lives in the includer: a `RangeImage` with { idx_t size;
// void Read(void*,idx_t,idx_t); static unique_ptr<RangeImage> Load(const string&); }. Include this LAST,
// after colsCacheLog.h and the platform RangeImage. See colsCacheExtension.cpp / colsCacheExtensionWasm.cpp.
#pragma once
#include "duckdb/main/extension/extension_loader.hpp"
#include "duckdb/common/opener_file_system.hpp"
#include "parquet_reader.hpp"
#include "colsCacheLog.h"

namespace duckdb {

struct RangeFileHandle : public FileHandle {
	RangeFileHandle(FileSystem &fs, const string &path, RangeImage &image)
	    : FileHandle(fs, path, FileOpenFlags(FileFlags::FILE_FLAGS_READ)), image(image) {
	}
	void Close() override {
	}
	RangeImage &image;
	idx_t position = 0;
};

class RangeCacheFileSystem : public FileSystem {
public:
	string GetName() const override {
		return "cols_cache_filesystem";
	}
	bool CanHandleFile(const string &path) override {
		return StringUtil::StartsWith(path, SP_PREFIX);
	}
	unique_ptr<FileHandle> OpenFile(const string &path, FileOpenFlags, optional_ptr<FileOpener>) override {
		auto wurl = path.substr(strlen(SP_PREFIX));
		lock_guard<mutex> g(lock);
		auto &image = images[wurl];
		if (!image) {
			image = RangeImage::Load(wurl);
		}
		return make_uniq<RangeFileHandle>(*this, path, *image);
	}
	void Read(FileHandle &handle, void *buffer, int64_t nr_bytes, idx_t location) override {
		handle.Cast<RangeFileHandle>().image.Read(buffer, location, NumericCast<idx_t>(nr_bytes));
	}
	int64_t Read(FileHandle &handle, void *buffer, int64_t nr_bytes) override {
		auto &h = handle.Cast<RangeFileHandle>();
		auto n = MinValue<int64_t>(nr_bytes, NumericCast<int64_t>(h.image.size - h.position));
		Read(handle, buffer, n, h.position);
		h.position += NumericCast<idx_t>(n);
		return n;
	}
	int64_t GetFileSize(FileHandle &handle) override {
		return NumericCast<int64_t>(handle.Cast<RangeFileHandle>().image.size);
	}
	void Seek(FileHandle &handle, idx_t location) override {
		handle.Cast<RangeFileHandle>().position = location;
	}
	idx_t SeekPosition(FileHandle &handle) override {
		return handle.Cast<RangeFileHandle>().position;
	}
	bool CanSeek() override {
		return true;
	}
	// false -> engages the parquet reader's ReadAheadBuffer (coalesced, pruned ranges).
	bool OnDiskFile(FileHandle &) override {
		return false;
	}
	bool FileExists(const string &, optional_ptr<FileOpener>) override {
		return true;
	}
	timestamp_t GetLastModifiedTime(FileHandle &) override {
		return timestamp_t(0);
	}
	FileType GetFileType(FileHandle &) override {
		return FileType::FILE_TYPE_REGULAR;
	}

private:
	mutex lock;
	unordered_map<string, unique_ptr<RangeImage>> images;
};

// ── table function: per-row-group parallel driver over a LIST of wUrls. The parallel work unit is a global
//    (file,row_group) pair; one shared atomic cursor hands work out across every object's row groups. ──
struct SplitBind : public TableFunctionData {
	vector<shared_ptr<ParquetReader>> readers;
	vector<string> wurls;
	vector<idx_t> rg_base;
	idx_t total_rgs = 0;
};

static void LocateRg(const SplitBind &b, idx_t global_rg, idx_t &file_idx, idx_t &local_rg) {
	file_idx = 0;
	while (file_idx + 1 < b.rg_base.size() && global_rg >= b.rg_base[file_idx + 1]) {
		file_idx++;
	}
	local_rg = global_rg - b.rg_base[file_idx];
}

static vector<string> InputWUrls(const Value &v) {
	vector<string> urls;
	if (v.type().id() == LogicalTypeId::LIST) {
		for (auto &child : ListValue::GetChildren(v)) {
			urls.push_back(child.GetValue<string>());
		}
	} else {
		urls.push_back(v.GetValue<string>());
	}
	return urls;
}

struct MetadataBind : public TableFunctionData {
	vector<shared_ptr<ParquetReader>> readers;
	vector<string> wurls;
};

static unique_ptr<FunctionData> BindMetadata(ClientContext &context, TableFunctionBindInput &input,
		vector<LogicalType> &types, vector<string> &names) {
	auto bind = make_uniq<MetadataBind>();
	for (auto &wurl : InputWUrls(input.inputs[0])) {
		bind->readers.push_back(
			make_shared_ptr<ParquetReader>(context, OpenFileInfo(SP_PREFIX + wurl), ParquetOptions(context)));
		bind->wurls.push_back(wurl);
	}
	names = {"file_name", "key", "value"};
	types = {LogicalType::VARCHAR, LogicalType::BLOB, LogicalType::BLOB};
	return std::move(bind);
}

struct MetadataGlobal : public GlobalTableFunctionState {
	idx_t file = 0, entry = 0;
};

static unique_ptr<GlobalTableFunctionState> InitMetadata(ClientContext &, TableFunctionInitInput &) {
	return make_uniq<MetadataGlobal>();
}

static void ScanMetadata(ClientContext &, TableFunctionInput &input, DataChunk &output) {
	auto &bind = input.bind_data->Cast<MetadataBind>();
	auto &state = input.global_state->Cast<MetadataGlobal>();
	idx_t row = 0;
	while (row < STANDARD_VECTOR_SIZE && state.file < bind.readers.size()) {
		auto &entries = bind.readers[state.file]->GetFileMetadata()->key_value_metadata;
		if (state.entry == entries.size()) { state.file++; state.entry = 0; continue; }
		auto &entry = entries[state.entry++];
		output.SetValue(0, row, bind.wurls[state.file]);
		output.SetValue(1, row, Value::BLOB_RAW(entry.key));
		output.SetValue(2, row++, Value::BLOB_RAW(entry.value));
	}
	output.SetCardinality(row);
}

static unordered_map<idx_t, vector<idx_t>> ParsePreFetchCols(const string &packed) {
	unordered_map<idx_t, vector<idx_t>> out;
	auto num = [](const string &s, idx_t &n) {
		char *end;
		auto v = strtoull(s.c_str(), &end, 10);
		if (!*s.c_str() || *end) return false;
		n = NumericCast<idx_t>(v);
		return true;
	};
	for (auto &group : StringUtil::Split(packed, ";")) {
		auto parts = StringUtil::Split(group, ":");
		if (parts.size() != 2) continue;
		idx_t rg;
		if (!num(parts[0], rg)) continue;
		for (auto &col : StringUtil::Split(parts[1], ",")) {
			idx_t cid;
			if (num(col, cid)) out[rg].push_back(cid);
		}
	}
	return out;
}

static unique_ptr<FunctionData> Bind(ClientContext &context, TableFunctionBindInput &input,
                                     vector<LogicalType> &return_types, vector<string> &names) {
	auto bind = make_uniq<SplitBind>();
	for (auto &wurl : InputWUrls(input.inputs[0])) {
		auto reader = make_shared_ptr<ParquetReader>(context, OpenFileInfo(SP_PREFIX + wurl), ParquetOptions(context));
		bind->wurls.push_back(wurl);
		bind->rg_base.push_back(bind->total_rgs);
		bind->total_rgs += reader->NumRowGroups();
		bind->readers.push_back(std::move(reader));
	}
	for (auto &col : bind->readers[0]->root_schema->children) {
		names.emplace_back(col.name);
		return_types.emplace_back(col.type);
	}
	auto plan = ParsePreFetchCols(PreFetchCols());
	for (idx_t fi = 0; fi < bind->readers.size(); fi++) {
		vector<pair<idx_t, idx_t>> ranges;
		auto &groups = bind->readers[fi]->GetFileMetadata()->row_groups;
		for (auto &entry : plan) {
			if (entry.first >= groups.size()) continue;
			for (auto cid : entry.second) {
				if (cid >= groups[entry.first].columns.size()) continue;
				auto &m = groups[entry.first].columns[cid].meta_data;
				auto off = m.__isset.dictionary_page_offset && m.dictionary_page_offset > 0 ? m.dictionary_page_offset : m.data_page_offset;
				ranges.emplace_back(NumericCast<idx_t>(off), NumericCast<idx_t>(m.total_compressed_size));
			}
		}
		RangeImage::Prefetch(bind->wurls[fi], ranges, PreFetchCols());
	}
	return std::move(bind);
}

struct SplitGlobal : public GlobalTableFunctionState {
	std::atomic<idx_t> next_rg {0};
	idx_t max_threads = 1;
	std::mutex rgLock;
	unordered_map<idx_t, idx_t> rowsByGlobalRg;   // global_rg → rows that group emitted (per-rg cardinality after pushdown)
	vector<idx_t> projCols;                       // the column ids DuckDB pushed down — the only chunks colsCache byte-ranges
	idx_t MaxThreads() const override {
		return max_threads;
	}
};

static bool RgMayMatch(ClientContext &context, ParquetReader &reader, idx_t rg, TableFilterSet *filters,
                       const vector<column_t> &column_ids) {
	if (!filters) return true;
	auto &group = reader.GetFileMetadata()->row_groups[rg];
	for (auto &entry : filters->filters) {
		if (entry.first >= column_ids.size()) continue;
		auto cid = column_ids[entry.first];
		if (cid >= group.columns.size() || cid >= reader.root_schema->children.size()) continue;
		auto stats = reader.root_schema->children[cid].Stats(
		    *reader.GetFileMetadata(), ParquetOptions(context), rg, group.columns);
		if (stats && entry.second->CheckStatistics(*stats) == FilterPropagateResult::FILTER_ALWAYS_FALSE) return false;
	}
	return true;
}

static unique_ptr<GlobalTableFunctionState> Init(ClientContext &context, TableFunctionInitInput &input) {
	auto &bind = input.bind_data->Cast<SplitBind>();
	auto &names = bind.readers[0]->root_schema->children;   // projected names come from the shared schema (all files share it)
	for (auto &reader : bind.readers) {
		for (auto col_id : input.column_ids) {
			reader->column_ids.emplace_back(col_id);
			reader->column_indexes.emplace_back(col_id);
		}
		if (input.filters) reader->filters = input.filters->Copy();   // hand each reader the pushed-down predicates → it stats-prunes row groups
	}
	auto gstate = make_uniq<SplitGlobal>();
	gstate->max_threads = MaxValue<idx_t>(bind.total_rgs, 1);
	gstate->projCols = input.column_ids;
	for (idx_t fi = 0; fi < bind.readers.size(); fi++) {
		vector<pair<idx_t, idx_t>> ranges;
		auto &reader = *bind.readers[fi];
		auto &groups = reader.GetFileMetadata()->row_groups;
		for (idx_t rg = 0; rg < groups.size(); rg++) {
			if (!RgMayMatch(context, reader, rg, input.filters.get(), input.column_ids)) continue;
			for (auto cid : input.column_ids) {
				if (cid >= groups[rg].columns.size()) continue;
				auto &m = groups[rg].columns[cid].meta_data;
				auto off = m.__isset.dictionary_page_offset && m.dictionary_page_offset > 0
				         ? m.dictionary_page_offset : m.data_page_offset;
				ranges.emplace_back(NumericCast<idx_t>(off), NumericCast<idx_t>(m.total_compressed_size));
			}
		}
		RangeImage::Prefetch(bind.wurls[fi], ranges, "pushdown");
	}
	ScanStats::Get().Reset();   // one process = one query: arm the per-query byte-traffic aggregator
	std::ostringstream o;
	o << R"("t":"scan.plan","files":)" << bind.readers.size() << R"(,"rgs":)" << bind.total_rgs
	  << R"(,"threads":)" << gstate->max_threads;   // rgs==1 -> single-threaded whole-file scan
	CppLog(o.str());
	// projection: exactly the columns DuckDB pushed into the scan (post projection-pushdown), in scan order.
	std::ostringstream p; p << R"("t":"pushdown.projection","cols":[)";
	for (idx_t i = 0; i < input.column_ids.size(); i++) {
		auto cid = input.column_ids[i];
		p << (i ? "," : "") << '"' << JStr(cid < names.size() ? names[cid].name : "rowid") << '"';
	}
	p << "]"; InLog(p.str());
	// filters: the predicates DuckDB's optimizer pushed down, keyed by the column each constrains (empty ⇒ no pushdown).
	if (input.filters) for (auto &e : input.filters->filters) {
		auto cid = e.first < input.column_ids.size() ? input.column_ids[e.first] : e.first;
		auto col = cid < names.size() ? names[cid].name : ("col" + std::to_string(cid));
		InLog(R"("t":"pushdown.filter","col":")" + JStr(col) + R"(","pred":")" + JStr(e.second->ToString(col)) + "\"");
	}
	return std::move(gstate);
}

struct SplitLocal : public LocalTableFunctionState {
	ParquetReaderScanState scan;
	optional_ptr<ParquetReader> reader;
	bool active = false;
	idx_t curGlobalRg = 0;   // the global row group this local state is currently draining (for per-rg row attribution)
};

static unique_ptr<LocalTableFunctionState> LocalInit(ExecutionContext &, TableFunctionInitInput &,
                                                     GlobalTableFunctionState *) {
	return make_uniq<SplitLocal>();
}

static void EmitRanges(const SplitBind &b, const SplitGlobal &g, idx_t grg) {
	idx_t fi, lrg; LocateRg(b, grg, fi, lrg);
	auto &reader = *b.readers[fi];
	auto &cols = reader.GetFileMetadata()->row_groups[lrg].columns;
	auto &schema = reader.root_schema->children;
	std::ostringstream o; o << R"("t":"scan.ranges","file":")" << JStr(reader.GetFileName()) << R"(","rg":)" << lrg << R"(,"ranges":[)";
	bool first = true;
	for (auto cid : g.projCols) {
		if (cid >= cols.size() || cid >= schema.size()) continue;
		auto &m = cols[cid].meta_data;
		auto off = m.__isset.dictionary_page_offset && m.dictionary_page_offset > 0 ? m.dictionary_page_offset : m.data_page_offset;
		o << (first ? "" : ",") << R"({"col":")" << JStr(schema[cid].name) << R"(","off":)" << off
		  << R"(,"len":)" << m.total_compressed_size << "}"; first = false;
	}
	o << "]"; CppLog(o.str());
}

// once-per-query rollup of the inside-duckdb view: which row groups survived stats-pruning (emitted rows) and how many
// rows each produced. A group pruned by the pushed-down filters never appears in rowsByGlobalRg, so scanned<total ⇒ pruning.
static void FlushInside(SplitGlobal &g, const SplitBind &b) {
	lock_guard<mutex> gg(g.rgLock);
	if (g.rowsByGlobalRg.count(~idx_t(0))) return;   // sentinel key marks 'already flushed'
	std::ostringstream o;
	o << R"("t":"scan.rowGroups","total":)" << b.total_rgs << R"(,"scanned":)" << g.rowsByGlobalRg.size() << R"(,"rows":[)";
	bool first = true;
	for (auto &kv : g.rowsByGlobalRg) {
		idx_t fi, lrg; LocateRg(b, kv.first, fi, lrg);
		o << (first ? "" : ",") << R"({"file":")" << JStr(BaseName(b.readers[fi]->GetFileName())) << R"(","rg":)" << lrg
		  << R"(,"rows":)" << kv.second << "}"; first = false;
	}
	o << "]"; InLog(o.str());
	// scan size: the compressed bytes of exactly the pushed-down columns over the scanned row groups (footer
	// total_compressed_size per ColumnChunk) — what colsCache byte-ranges, keyed by column name. Pruned rgs excluded.
	auto &schema = b.readers[0]->root_schema->children;
	std::map<string, int64_t> bytesByCol;
	for (auto &kv : g.rowsByGlobalRg) {
		if (kv.first == ~idx_t(0)) continue;
		idx_t fi, lrg; LocateRg(b, kv.first, fi, lrg);
		auto &cols = b.readers[fi]->GetFileMetadata()->row_groups[lrg].columns;
		for (auto cid : g.projCols) {
			if (cid >= cols.size() || cid >= schema.size()) continue;
			bytesByCol[schema[cid].name] += cols[cid].meta_data.total_compressed_size;
		}
	}
	std::ostringstream c; c << R"("t":"scan.colBytes","cols":[)"; int64_t total = 0; first = true;
	for (auto &kv : bytesByCol) {
		c << (first ? "" : ",") << R"({"col":")" << JStr(kv.first) << R"(","bytes":)" << kv.second << "}";
		total += kv.second; first = false;
	}
	c << R"(],"totalBytes":)" << total; InLog(c.str());
	g.rowsByGlobalRg[~idx_t(0)] = 0;
}

static void Scan(ClientContext &context, TableFunctionInput &data, DataChunk &output) {
	auto &bind = data.bind_data->Cast<SplitBind>();
	auto &gstate = data.global_state->Cast<SplitGlobal>();
	auto &lstate = data.local_state->Cast<SplitLocal>();
	while (true) {
		if (!lstate.active) {
			auto global_rg = gstate.next_rg.fetch_add(1);
			if (global_rg >= bind.total_rgs) {
				ScanStats::Get().Flush();   // no more row groups → flush the one-per-query byte-traffic summary
				FlushInside(gstate, bind);   // and the inside-duckdb per-rg pruning/cardinality rollup
				return;
			}
			idx_t file_idx, local_rg;
			LocateRg(bind, global_rg, file_idx, local_rg);
			lstate.curGlobalRg = global_rg;
			lstate.reader = bind.readers[file_idx].get();
			lstate.reader->InitializeScan(context, lstate.scan, {local_rg});
			lstate.active = true;
		}
		auto scanned = lstate.scan.row_groups_scanned;
		lstate.reader->Scan(context, lstate.scan, output); // may return an empty prefetch pass
		if (lstate.scan.row_groups_scanned > scanned) EmitRanges(bind, gstate, lstate.curGlobalRg);
		if (output.size() > 0) {
			lock_guard<mutex> g(gstate.rgLock); gstate.rowsByGlobalRg[lstate.curGlobalRg] += output.size();   // per-rg cardinality after stats-pruning
			return;
		}
		if (lstate.scan.finished) {
			lstate.active = false; // row group drained -> claim next
		}
	}
}

static void LoadInternal(ExtensionLoader &loader) {
	auto &db = loader.GetDatabaseInstance();
	db.config.AddExtensionOption("cols_cache_loggers",   // ctx's active-logger list (duckdbRun SETs it): gates CppLog + becomes colsCacheService argv
		"active jb6 logger names for this query", LogicalType::VARCHAR, Value(""),
		[](ClientContext &, SetScope, Value &v) { ActiveLoggers() = v.IsNull() ? "" : v.ToString(); });
	db.config.AddExtensionOption("cols_cache_prefetch_cols", "row-group:column-index prefetch plan", LogicalType::VARCHAR, Value(""),
		[](ClientContext &, SetScope, Value &v) { PreFetchCols() = v.IsNull() ? "" : v.ToString(); });
	// RegisterSubSystem is virtual on FileSystem: OpenerFileSystem (native) forwards it to its inner VFS,
	// VirtualFileSystem (wasm webdb.cc) registers directly — so no cast/unwrap, works in both builds.
	db.GetFileSystem().RegisterSubSystem(make_uniq<RangeCacheFileSystem>());

	TableFunctionSet set("cols_cache");
	auto make = [](const LogicalType &arg) {
		TableFunction tf("cols_cache", {arg}, Scan, Bind, Init, LocalInit);
		tf.projection_pushdown = true;
		tf.filter_pushdown = true;   // so DuckDB hands us input.filters → reader prunes row groups by stats (row_groups_scanned)
		return tf;
	};
	set.AddFunction(make(LogicalType::VARCHAR));
	set.AddFunction(make(LogicalType::LIST(LogicalType::VARCHAR)));
	loader.RegisterFunction(set);
	TableFunctionSet metadata_set("cols_cache_kv_metadata");
	auto metadata = [](const LogicalType &arg) {
		return TableFunction("cols_cache_kv_metadata", {arg}, ScanMetadata, BindMetadata, InitMetadata);
	};
	metadata_set.AddFunction(metadata(LogicalType::VARCHAR));
	metadata_set.AddFunction(metadata(LogicalType::LIST(LogicalType::VARCHAR)));
	loader.RegisterFunction(metadata_set);
}

} // namespace duckdb
