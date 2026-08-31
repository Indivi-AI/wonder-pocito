#!/usr/bin/env python3
"""Split a JSON array into fixed-size chunks for Apollo batch calls.

Usage:
  python chunk.py <input.json> <size> [--ids] [--out-prefix PREFIX]

  <input.json>  array of objects (people) or strings (ids)
  <size>        items per chunk (10 for bulk_match, ~50 for bulk_create)
  --ids         emit just the person ids as [{"id": ...}] (for bulk_match)
  --out-prefix  also write each chunk to PREFIX_<n>.json

Prints each chunk as a single JSON line (paste straight into the tool call).
"""
import json, sys, math

def main():
    a = sys.argv[1:]
    inp, size = a[0], int(a[1])
    ids = "--ids" in a
    prefix = a[a.index("--out-prefix")+1] if "--out-prefix" in a else None
    data = json.load(open(inp))
    chunks = [data[i:i+size] for i in range(0, len(data), size)]
    print(f"{len(data)} items -> {len(chunks)} chunks of <= {size}", file=sys.stderr)
    for i, c in enumerate(chunks, 1):
        if ids:
            c = [{"id": (x["id"] if isinstance(x, dict) else x)} for x in c]
        line = json.dumps(c, ensure_ascii=False)
        print(f"BATCH {i}: {line}")
        if prefix:
            json.dump(c, open(f"{prefix}_{i}.json", "w"), ensure_ascii=False)

if __name__ == "__main__":
    main()
