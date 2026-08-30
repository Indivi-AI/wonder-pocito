-- Parameterised synthetic bronze, Winner-shaped (nested BetDetails + dimension tables).
-- Substitute __ORDERS__ and __GROUPS__ where cells = __GROUPS__ * 8 and collapse = __ORDERS__ / __GROUPS__.
--   40M rows @ 8:1 -> ORDERS=5000000  GROUPS=625000
--   10M rows @ 8:1 -> ORDERS=1250000  GROUPS=156250
--  300K rows @ 8:1 -> ORDERS=37504    GROUPS=4688
--
-- The grain is CONTROLLED, not emergent: every dimension is a function of (g, s), so the 14-column key has
-- exactly GROUPS*8 distinct values. UserId is a function of i (not g) so the orders sharing a cell carry
-- different users and COUNT(DISTINCT) does real work.
-- Dimension tables are keyed on (ID, Brand) because the model joins on both — keying on ID alone silently
-- drops 4/5 of rows and NULLs every CountryName.
SET preserve_insertion_order = false;

CREATE OR REPLACE TABLE Countries AS
SELECT c AS ID, 'Brand' || b AS Brand, 'Country' || c AS Name
FROM range(1, 61) t(c), range(1, 6) u(b);

CREATE OR REPLACE TABLE EventsData AS
SELECT 360000000 + e AS ID, 'Brand' || b AS Brand, 1 + (e % 60) AS CountyId,
  TIMESTAMP '2025-06-01' + INTERVAL ((e * 13) % 400) DAY AS CreateTime
FROM range(0, 50000) t(e), range(1, 6) u(b);

CREATE OR REPLACE TABLE sportTickets AS
WITH o AS (SELECT i, i % __GROUPS__ AS g FROM range(0, __ORDERS__) t(i))
SELECT
  'Brand' || (1 + (g % 5))                                       AS Brand,
  TIMESTAMP '2026-04-14' + INTERVAL ((g * 7) % 92) DAY
    + INTERVAL (i % 86400) SECOND                                AS CreateTime,
  5000000000 + i                                                 AS OrderId,
  1 + ((i * 2654435761) % 600000)                                AS UserId,
  (g % 7) <> 0                                                   AS isSetteled,
  1 + (g % 5)                                                    AS ChannelId,
  CASE WHEN g % 11 = 0 THEN 'BC' || g END                        AS BookingCodeOrigin,
  (g % 23) = 0                                                   AS IsBB,
  (g % 47) = 0                                                   AS IsFirstBB,
  CASE WHEN (g % 23) = 0 THEN 1 ELSE 0 END                       AS BBType,
  1 + (g % 3)                                                    AS ProdType,
  round(10 + (i % 5000) / 3.0, 4)                                AS betAmount,
  CASE WHEN (i % 3) = 0 THEN round((i % 9000) / 7.0, 4) END      AS relativeWin,
  1 + (i % 20)                                                   AS TotalSelections,
  round((i % 30000) / 2.0, 2)                                    AS orderPayOut,
  CASE (g % 5) WHEN 0 THEN 2400.0 WHEN 1 THEN 7430.0 WHEN 2 THEN 3.67
       WHEN 3 THEN 1.0 ELSE 18.2 END                             AS CurrencyRate,
  [ { 'orderBetID': (i * 8 + s)::BIGINT,
      'BettypeId':  (30000 + ((g * 31 + s * 977) % 900))::BIGINT,
      'EventId':    (360000000 + ((g * 17 + s * 613) % 50000))::BIGINT,
      -- derived from the same expression as EventId so they add no key cardinality of their own
      'leagueName': 'League' || (((g * 17 + s * 613) % 50000) % 240),
      'ClassName':  'Class'  || (((g * 17 + s * 613) % 50000) % 12) }
    for s in range(0, 8) ]                                       AS BetDetails
FROM o;

-- VERIFY BEFORE USING — collapse must equal the target, null_country must be 0.
-- Note DuckDB cannot LEFT JOIN on a correlated lateral UNNEST; flatten first, then join.
-- CREATE OR REPLACE TABLE u AS SELECT ... FROM sportTickets st, unnest(st.BetDetails) AS t(bd);
-- SELECT count(*) n_rows, count(DISTINCT (Dt,Brand,...14 cols...)) n_cells,
--        round(count(*)*1.0/count(DISTINCT (...)),2) collapse,
--        sum(CASE WHEN CountryName IS NULL THEN 1 ELSE 0 END) null_country FROM source_data;
