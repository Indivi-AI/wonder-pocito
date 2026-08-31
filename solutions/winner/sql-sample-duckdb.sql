-- NOTE: the authoritative runnable copy of this model now lives in winner-sql-parity-tests.js (winnerCube.matchesSqlModel);
-- this file is the standalone CLI/reading copy that produced sql-model-output.csv.
-- DuckDB port of sql-sample.sql (dbt/BigQuery `sport_ticket_daily`), used as the REFERENCE the cube is compared against.
-- Only source_data differs: data-sample.csv IS the source_data CTE output (already unnested + joined + SelectionKey'd),
-- so the unnest/joins/CreateTime filters are upstream. Everything from agg_date_brand down is verbatim.

WITH source_data AS (
  SELECT * FROM read_csv('__CSV__', header = true, nullstr = '')
),

agg_date_brand AS (
  SELECT Dt, Brand,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrand,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrand,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrand
  FROM source_data GROUP BY 1, 2
),
agg_date_brand_league AS (
  SELECT Dt, Brand, CountryName, ClassName, leagueName,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandLeagueName,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandLeagueName,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandLeagueName
  FROM source_data GROUP BY 1, 2, 3, 4, 5
),
agg_date_brand_bettype AS (
  SELECT Dt, Brand, BettypeId,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandBettypeId,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandBettypeId,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandBettypeId
  FROM source_data GROUP BY 1, 2, 3
),
agg_date_brand_event AS (
  SELECT Dt, Brand, EventId,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandEventId,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandEventId,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandEventId
  FROM source_data GROUP BY 1, 2, 3
),
agg_date_brand_isbb AS (
  SELECT Dt, Brand, IsBB,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandIsBB,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandIsBB,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandIsBB
  FROM source_data GROUP BY 1, 2, 3
),
agg_date_brand_bbtype_prodtype AS (
  SELECT Dt, Brand, BBType, ProdType,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandBBTypeProdType,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandBBTypeProdType,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandBBTypeProdType
  FROM source_data GROUP BY 1, 2, 3, 4
),
agg_date_brand_prodtype AS (
  SELECT Dt, Brand, ProdType,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandProdType,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandProdType,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandProdType
  FROM source_data GROUP BY 1, 2, 3
),
agg_date_brand_isbb_class_prodtype AS (
  SELECT Dt, Brand, IsBB, ClassName, ProdType,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandIsBBClassNameProdType,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandIsBBClassNameProdType,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandIsBBClassNameProdType
  FROM source_data GROUP BY 1, 2, 3, 4, 5
),
agg_date_brand_isbb_prodtype AS (
  SELECT Dt, Brand, IsBB, ProdType,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandIsBBProdType,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandIsBBProdType,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandIsBBProdType
  FROM source_data GROUP BY 1, 2, 3, 4
),

base_agg AS (
  SELECT
    Dt, Brand, BettypeId, EventId, leagueName, ClassName, CountryName, ProdType,
    IsSettled, ChannelId, IsByBookingCode, IsBB, IsFirstBB, BBType,
    COUNT(DISTINCT UserId) AS ActivesCount,
    COUNT(DISTINCT OrderId) AS OrdersCount,
    SUM(betAmount) AS BetAmount,
    SUM(IFNULL(relativeWin, 0)) AS WinAmount,
    SUM(TotalSelections) AS TotalSelections,
    SUM(betAmount / CurrencyRate) AS BetAmountUSD,
    SUM(IFNULL(relativeWin / CurrencyRate, 0)) AS WinAmountUSD,
    SUM(orderPayOut) AS orderPayOut,
    SUM(IFNULL(orderPayOut / CurrencyRate, 0)) AS orderPayOutUSD,
    MAX(IsBB) OVER (PARTITION BY Brand) AS isBrandWithBB
  FROM source_data
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14
)

SELECT b.*,
  a1.ActivesCountByDateBrand, a1.OrdersCountByDateBrand, a1.SelectionCountByDateBrand,
  a2.ActivesCountByDateBrandLeagueName, a2.OrdersCountByDateBrandLeagueName, a2.SelectionCountByDateBrandLeagueName,
  a3.ActivesCountByDateBrandBettypeId, a3.OrdersCountByDateBrandBettypeId, a3.SelectionCountByDateBrandBettypeId,
  a4.ActivesCountByDateBrandEventId, a4.OrdersCountByDateBrandEventId, a4.SelectionCountByDateBrandEventId,
  a5.ActivesCountByDateBrandIsBB, a5.OrdersCountByDateBrandIsBB, a5.SelectionCountByDateBrandIsBB,
  a6.ActivesCountByDateBrandBBTypeProdType, a6.OrdersCountByDateBrandBBTypeProdType, a6.SelectionCountByDateBrandBBTypeProdType,
  a7.ActivesCountByDateBrandProdType, a7.OrdersCountByDateBrandProdType, a7.SelectionCountByDateBrandProdType,
  a8.ActivesCountByDateBrandIsBBClassNameProdType, a8.OrdersCountByDateBrandIsBBClassNameProdType, a8.SelectionCountByDateBrandIsBBClassNameProdType,
  a9.ActivesCountByDateBrandIsBBProdType, a9.OrdersCountByDateBrandIsBBProdType, a9.SelectionCountByDateBrandIsBBProdType
FROM base_agg b
LEFT JOIN agg_date_brand a1 ON b.Dt = a1.Dt AND b.Brand = a1.Brand
LEFT JOIN agg_date_brand_league a2 ON b.Dt = a2.Dt AND b.Brand = a2.Brand
  AND b.CountryName = a2.CountryName AND b.ClassName = a2.ClassName AND b.leagueName = a2.leagueName
LEFT JOIN agg_date_brand_bettype a3 ON b.Dt = a3.Dt AND b.Brand = a3.Brand AND b.BettypeId = a3.BettypeId
LEFT JOIN agg_date_brand_event a4 ON b.Dt = a4.Dt AND b.Brand = a4.Brand AND b.EventId = a4.EventId
LEFT JOIN agg_date_brand_isbb a5 ON b.Dt = a5.Dt AND b.Brand = a5.Brand AND b.IsBB = a5.IsBB
LEFT JOIN agg_date_brand_bbtype_prodtype a6 ON b.Dt = a6.Dt AND b.Brand = a6.Brand
  AND b.BBType = a6.BBType AND b.ProdType = a6.ProdType
LEFT JOIN agg_date_brand_prodtype a7 ON b.Dt = a7.Dt AND b.Brand = a7.Brand AND b.ProdType = a7.ProdType
LEFT JOIN agg_date_brand_isbb_class_prodtype a8 ON b.Dt = a8.Dt AND b.Brand = a8.Brand
  AND b.IsBB = a8.IsBB AND b.ClassName = a8.ClassName AND b.ProdType = a8.ProdType
LEFT JOIN agg_date_brand_isbb_prodtype a9 ON b.Dt = a9.Dt AND b.Brand = a9.Brand
  AND b.IsBB = a9.IsBB AND b.ProdType = a9.ProdType
ORDER BY Dt, Brand, BettypeId, EventId
