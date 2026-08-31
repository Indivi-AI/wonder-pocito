-- BigQuery bill autopsy — READ-ONLY, METADATA ONLY.
-- Reads INFORMATION_SCHEMA.JOBS (job history). It never touches your tables or your data.
-- Query text is hashed, never emitted: nothing identifiable leaves your project.
-- Cost to run: $0 — INFORMATION_SCHEMA is not billed.
-- Reports BOTH currencies (bytes scanned and slot-hours), so it is useful on on-demand or on slots.
--
-- 1. Change `region-us` below to your dataset region (region-eu, region-me-west1, ...).
-- 2. Optionally set billing_model / prices to your contract. 'auto' infers it from the data.
-- 3. Run in the BigQuery console, or:  bq query --use_legacy_sql=false < bq-bill-autopsy.sql

DECLARE days INT64 DEFAULT 30;
DECLARE billing_model STRING DEFAULT 'auto';      -- 'auto' | 'on-demand' | 'reservation'
DECLARE usd_per_tib FLOAT64 DEFAULT 6.25;         -- on-demand list price
DECLARE usd_per_slot_hour FLOAT64 DEFAULT 0.06;   -- Enterprise edition list; Standard ~0.04, Plus ~0.10

CREATE TEMP TABLE shapes AS
SELECT
  TO_HEX(MD5(REGEXP_REPLACE(REGEXP_REPLACE(LOWER(query), r"'[^']*'|\d+", '?'), r'\s+', ' '))) AS shape,
  IFNULL(total_bytes_processed, 0) AS bytes,     -- populated under BOTH models
  IFNULL(total_bytes_billed, 0)    AS billed,    -- 0 (or informational) under a reservation
  IFNULL(total_slot_ms, 0)         AS slot_ms,   -- the real currency under a reservation
  cache_hit, user_email
FROM `region-us`.INFORMATION_SCHEMA.JOBS_BY_PROJECT
WHERE job_type = 'QUERY' AND state = 'DONE' AND error_result IS NULL
  AND creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL days DAY);

-- infer the model from the data: on-demand jobs bill bytes, reservation jobs do not.
-- (reservation_id is unreliable — often NULL even on slots — so it is not used.)
IF billing_model = 'auto' THEN
  SET billing_model = IF((SELECT SUM(billed) FROM shapes) > 0, 'on-demand', 'reservation');
END IF;
SELECT billing_model AS detected_billing_model,
       (SELECT COUNTIF(billed > 0) FROM shapes) AS jobs_billing_bytes,
       (SELECT COUNTIF(billed = 0 AND bytes > 0 AND NOT cache_hit) FROM shapes) AS jobs_billing_no_bytes;

CREATE TEMP FUNCTION usd(bytes INT64, slot_ms INT64, model STRING) AS (
  IF(model = 'on-demand', bytes / POW(1024, 4) * usd_per_tib, slot_ms / 3600000 * usd_per_slot_hour));

-- A. headline: how much of the load is the same query shape run over and over
WITH n AS (SELECT shape, COUNT(*) runs FROM shapes GROUP BY 1)
SELECT
  COUNT(*)                                            AS queries,
  ROUND(SUM(bytes) / POW(1024, 4), 1)                 AS tib_scanned,
  ROUND(SUM(slot_ms) / 3600000, 0)                    AS slot_hours,
  ROUND(SUM(usd(bytes, slot_ms, billing_model)), 0)   AS usd_est,
  ROUND(100 * COUNTIF(cache_hit) / COUNT(*), 1)       AS pct_cache_hit,
  -- the pitch number: share of spend (on-demand) or of slot capacity (reservation) burned by shapes run 10+ times
  ROUND(100 * SUM(IF(runs >= 10, usd(bytes, slot_ms, billing_model), 0))
            / NULLIF(SUM(usd(bytes, slot_ms, billing_model)), 0), 1) AS pct_from_repeated
FROM shapes JOIN n USING (shape);

-- B. the top repeat offenders — these are the migration candidates.
-- on-demand: usd_30d is the bill. reservation: slot_hours_30d is reclaimable capacity.
SELECT
  shape AS query_shape,
  COUNT(*)                                          AS runs,
  COUNTIF(cache_hit)                                AS cached,
  COUNT(DISTINCT user_email)                        AS users,
  ROUND(AVG(bytes) / POW(1024, 3), 1)               AS avg_gib_scanned,
  ROUND(SUM(slot_ms) / 3600000, 1)                  AS slot_hours_30d,
  ROUND(SUM(usd(bytes, slot_ms, billing_model)), 2) AS usd_30d
FROM shapes
GROUP BY shape
HAVING runs >= 5
ORDER BY slot_hours_30d DESC, avg_gib_scanned DESC
LIMIT 25;
