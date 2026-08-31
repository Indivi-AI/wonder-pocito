#!/usr/bin/env python3
"""Parse Apollo `apollo_people_bulk_match` result files into a clean record set.

The MCP saves oversized responses to files; pass their paths (or a glob dir).
Extracts id, name, linkedin_url, title, org (+ employment_history for later
military scanning) and reports match/credit/missing totals.

Usage:
  python parse_matches.py <out.json> <file_or_glob> [<file_or_glob> ...]
"""
import json, sys, glob, os

def load(path):
    t = open(path).read()
    return json.loads(t[t.find("{"):])

def main():
    out = sys.argv[1]
    paths = []
    for p in sys.argv[2:]:
        paths += sorted(glob.glob(p), key=os.path.getmtime) if any(c in p for c in "*?[") else [p]
    recs, req, credits, missing = [], 0, 0, []
    for f in paths:
        d = load(f)
        req += d.get("total_requested_enrichments", 0)
        credits += d.get("credits_consumed", 0) or 0
        for m in d.get("matches", []):
            org = (m.get("organization") or {}).get("name") or m.get("organization_name")
            recs.append({
                "id": m["id"], "name": m.get("name"),
                "linkedin_url": m.get("linkedin_url"), "title": m.get("title"),
                "org": org,
                "history": [e.get("organization_name") for e in (m.get("employment_history") or []) if e.get("organization_name")],
                "headline": m.get("headline"),
            })
        for mr in d.get("missing_records", []) or []:
            missing.append(mr if isinstance(mr, str) else mr.get("id"))
    json.dump(recs, open(out, "w"), ensure_ascii=False, indent=1)
    nourl = [r["name"] for r in recs if not r["linkedin_url"]]
    print(f"files={len(paths)} requested={req} matched={len(recs)} "
          f"missing={len(missing)} credits={credits} no_linkedin={len(nourl)}")
    if nourl:    print("  no linkedin_url:", nourl)
    if missing:  print("  missing ids:", missing)

if __name__ == "__main__":
    main()
