#!/usr/bin/env python3
"""Quality checks for an Apollo list. Matching is name-based (CRM cards and
HeyReach networks lack usable LinkedIn URLs), normalized for case/accents.

Subcommands (master.json = array with at least {name, org, title}):

  crm      master.json crm_list_file.json
           -> people already in the CRM (exact + loose name match, with owner)

  dedup    master.json
           -> repeated people and same-(first,last,org) collisions

  linkedin master.json network.json [network2.json ...]  --who LABEL
           -> master people who are 1st-degree connections in the network file(s).
              network files = saved get_my_network_for_sender pages (any shape
              with firstName/lastName). Repeat per sender with a different --who.

  military match_file_or_glob [...]
           -> scans bulk_match employment_history for 8200/IDF service.
"""
import json, sys, glob, os, re, unicodedata
from collections import Counter

def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return [w for w in re.sub(r"[^a-z ]", " ", s.lower()).split() if len(w) > 1]

def load_any(path):
    t = open(path).read()
    i = min(x for x in (t.find("{"), t.find("[")) if x >= 0)
    return json.loads(t[i:])

def as_list(d, *keys):
    if isinstance(d, list): return d
    for k in keys:
        if isinstance(d, dict) and isinstance(d.get(k), list): return d[k]
    return d.get("items", []) if isinstance(d, dict) else []

def crm(master, crm_file):
    crm = as_list(load_any(crm_file), "contacts", "cards")
    idx = [(c.get("name"), c.get("company"), c.get("owner"), set(norm(c.get("name")))) for c in crm]
    exact, loose = [], []
    for p in master:
        pt = set(norm(p["name"]));
        if len(pt) < 1: continue
        first = norm(p["name"])[0]; last = set(norm(p["name"])[1:])
        for cn, cc, co, ct in idx:
            if not ct: continue
            if pt == ct: exact.append((p["name"], p["org"], cn, cc, co)); break
            if first in ct and (last & ct): loose.append((p["name"], p["org"], cn, cc, co)); break
    print(f"CRM exact matches: {len(exact)}")
    for m in exact: print("  EXACT", m)
    print(f"CRM loose matches (first+last shared): {len(loose)}")
    for m in loose: print("  LOOSE", m)

def dedup(master):
    names = Counter(tuple(norm(p["name"])) for p in master)
    keys = Counter((tuple(norm(p["name"])), (p.get("org") or "").lower()) for p in master)
    dupn = {k: v for k, v in names.items() if v > 1}
    dupk = {k: v for k, v in keys.items() if v > 1}
    print(f"total={len(master)} distinct_names={len(names)}")
    print("repeated names:", dupn or "none")
    print("same (name,org) collisions (Apollo would merge):", dupk or "none")

def linkedin(master, net_files, who):
    conns = set()
    for f in net_files:
        txt = open(f).read()
        try:                                   # JSON network page(s)
            for it in as_list(load_any(f), "items"):
                nm = ((it.get("firstName") or "") + " " + (it.get("lastName") or "")).strip()
                if nm: conns.add(tuple(norm(nm)))
        except Exception:                      # fallback: plain "First || Last" / "First Last" lines
            for ln in txt.splitlines():
                nm = ln.replace("||", " ").strip()
                if nm: conns.add(tuple(norm(nm)))
    print(f"{who}: {len(conns)} connection names loaded from {len(net_files)} file(s)")
    for p in master:
        pt = tuple(norm(p["name"]));
        if not pt: continue
        if pt in conns: print(f"  HIGH  {p['name']} ({p['org']}, {p.get('title','')}) — {who}")
        else:
            first = pt[0]; last = set(pt[1:])
            for c in conns:
                if first in c and (last & set(c)): print(f"  POSSIBLE {p['name']} ({p['org']}) ~ {' '.join(c)} — {who}"); break

INTEL = re.compile(r"8200|unit ?8200|intelligence corps|military intelligence|מודיעין|9900", re.I)
ELITE = re.compile(r"mamram|ממר|talpiot|תלפיות|lotem|cyber education", re.I)
IDF   = re.compile(r"\bidf\b|israel(i)? defense|ministry of defense|elbit|elta|צה", re.I)

def military(match_files):
    paths = []
    for p in match_files:
        paths += sorted(glob.glob(p), key=os.path.getmtime) if any(c in p for c in "*?[") else [p]
    seen = 0
    for f in paths:
        t = open(f).read(); d = json.loads(t[t.find("{"):])
        for m in d.get("matches", []):
            seen += 1
            orgs = [e.get("organization_name") or "" for e in (m.get("employment_history") or [])]
            blob = (m.get("headline") or "") + " " + " ".join(orgs)
            cat = ("8200 / Military Intelligence" if INTEL.search(blob)
                   else "Elite tech unit (Mamram/Lotem/Talpiot)" if ELITE.search(blob)
                   else "IDF / Defense" if IDF.search(blob) else None)
            if cat: print(f"  {cat:42} | {m.get('name')} ({m.get('title')}) :: {[o for o in orgs if o]}")
    print(f"scanned {seen} enriched people (only those with employment_history)")

def main():
    cmd = sys.argv[1]
    if cmd == "military": return military(sys.argv[2:])
    master = as_list(load_any(sys.argv[2]), "enriched_done", "people")
    if cmd == "crm": crm(master, sys.argv[3])
    elif cmd == "dedup": dedup(master)
    elif cmd == "linkedin":
        who = sys.argv[sys.argv.index("--who")+1] if "--who" in sys.argv else "user"
        files = [a for a in sys.argv[3:] if a not in ("--who", who)]
        linkedin(master, files, who)
    else: print("unknown command", cmd)

if __name__ == "__main__":
    main()
