#!/usr/bin/env python3
"""Inject an enriched list into the explorer template -> standalone HTML.

Usage:
  python build_explorer.py <enriched.json> <out.html> [template.html]

enriched.json: array of objects with at least
  name, org, title, linkedin_url
and optionally
  connectionOf (list of names), military (str|null),
  militaryKnown (bool), history (list)
Defaults are filled for missing optional fields.
"""
import json, sys, os

DEF = {"connectionOf": [], "military": None, "militaryKnown": False, "history": []}

def main():
    enriched, out = sys.argv[1], sys.argv[2]
    tpl = sys.argv[3] if len(sys.argv) > 3 else os.path.join(
        os.path.dirname(__file__), "..", "assets", "explorer_template.html")
    data = json.load(open(enriched))
    for p in data:
        for k, v in DEF.items():
            p.setdefault(k, v)
    html = open(tpl).read()
    assert "/*__DATA__*/" in html, "template missing /*__DATA__*/ placeholder"
    html = html.replace("/*__DATA__*/", json.dumps(data, ensure_ascii=False), 1)
    open(out, "w").write(html)
    print(f"wrote {out} ({len(data)} people, {len(html)} bytes)")

if __name__ == "__main__":
    main()
