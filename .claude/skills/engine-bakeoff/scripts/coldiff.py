#!/usr/bin/env python3
"""Generate a column-by-column diff query for two result sets.

Never compare analytical outputs with bare EXCEPT: it is positional and it treats a 1-ULP float
difference as a mismatch. This joins on the key columns and counts mismatches per column, so you
can see WHICH columns differ and judge each by its type.

  ./coldiff.py --a a.parquet --b b.parquet --keys Dt,Brand --cols ActivesCount,BetAmount | duckdb
"""
import argparse
a = argparse.ArgumentParser()
a.add_argument('--a', required=True); a.add_argument('--b', required=True)
a.add_argument('--keys', required=True, help='comma-separated join key columns')
a.add_argument('--cols', required=True, help='comma-separated value columns to compare')
a.add_argument('--reader', default='read_parquet')
n = a.parse_args()
keys = [k.strip() for k in n.keys.split(',')]
cols = [c.strip() for c in n.cols.split(',')]
sel = ",\n  ".join('sum(CASE WHEN x."%s" IS DISTINCT FROM y."%s" THEN 1 ELSE 0 END) AS "%s"' % (c, c, c) for c in cols)
print(f"""SELECT count(*) AS joined,
  {sel}
FROM {n.reader}('{n.a}') x
JOIN {n.reader}('{n.b}') y USING ({', '.join(keys)});""")
