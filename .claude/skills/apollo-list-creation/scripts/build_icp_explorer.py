#!/usr/bin/env python3
"""Render an ICP-fit-ranked leads explorer -> standalone HTML.

Usage:
  python build_icp_explorer.py <scored.json> <out.html> [--icp "<one-line ICP>"] [--icp-file PATH] [--template PATH]

scored.json: array of objects with at least
  name, company, position, url, fit ("strong"|"medium"|"weak")
and optionally  reason, sizeGuess.

The view ranks strong -> medium -> weak, colour-codes fit, shows the reason,
filters by tier (weak hidden by default), and searches name/company/title.
The ICP line is shown under the title for reference (pass it so the reader
knows what the scoring means).
"""
import json, sys, os

def arg(flag, default=None):
    return sys.argv[sys.argv.index(flag)+1] if flag in sys.argv else default

def main():
    scored, out = sys.argv[1], sys.argv[2]
    tpl = arg("--template") or os.path.join(os.path.dirname(__file__), "..", "assets", "icp_explorer_template.html")
    icp = arg("--icp")
    if not icp and arg("--icp-file"):
        icp = open(arg("--icp-file")).read().strip()
    icp = icp or "ICP fit scoring."
    data = json.load(open(scored))
    html = open(tpl).read()
    assert "/*__DATA__*/" in html and "/*__ICP__*/" in html, "template missing placeholders"
    html = html.replace("/*__DATA__*/", json.dumps(data, ensure_ascii=False), 1)
    html = html.replace("/*__ICP__*/", json.dumps(icp, ensure_ascii=False), 1)
    open(out, "w").write(html)
    from collections import Counter
    c = Counter(r.get("fit") for r in data)
    print(f"wrote {out} ({len(data)} leads: {c.get('strong',0)} strong, {c.get('medium',0)} medium, {c.get('weak',0)} weak)")

if __name__ == "__main__":
    main()
