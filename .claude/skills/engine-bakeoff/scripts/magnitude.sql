-- Second step after coldiff: for every column that showed a mismatch, is it 1-ULP float noise or a real bug?
-- Substitute __A__/__B__/__KEYS__/__COL__. Verdict: max_rel ~1e-16 and differ_6dp = 0 => float noise, accept.
-- Anything larger, or any mismatch in an integer/COUNT(DISTINCT)/boolean column, is a genuine defect.
SELECT
  max(abs(x."__COL__" - y."__COL__"))                                  AS max_abs,
  max(abs(x."__COL__" - y."__COL__") / nullif(abs(x."__COL__"), 0))    AS max_rel,
  sum(CASE WHEN round(x."__COL__", 6) IS DISTINCT FROM round(y."__COL__", 6) THEN 1 ELSE 0 END) AS differ_6dp,
  count(*)                                                             AS n
FROM read_parquet('__A__') x JOIN read_parquet('__B__') y USING (__KEYS__);
