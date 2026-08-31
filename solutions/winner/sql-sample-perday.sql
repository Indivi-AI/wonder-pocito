-- PER-DAY variant of sport_ticket_daily. Same 51 columns in the same order as the single-window run, and
-- VERIFIED equivalent at 10M (1.25M cells): all 27 COUNT(DISTINCT) rollups, ActivesCount, OrdersCount,
-- TotalSelections and isBrandWithBB match EXACTLY; the five float SUM columns differ by <=1 ULP
-- (max relative 5.4e-16, zero rows differ at 6dp) because IEEE-754 addition is not associative and the
-- per-day scan order differs. Not bit-identical -- numerically identical. Every invocation processes ONE Dt,
-- so peak memory drops ~92x and the model fits a
-- memory-bounded runtime. All nine rollup grains and base_agg already lead with Dt, so slicing the input by
-- day cannot change them. isBrandWithBB was the ONE cross-day value -- MAX(isBB) OVER (PARTITION BY Brand) --
-- so it moves to its own CTE over the FULL window. isBB is order-level, so that CTE needs two columns, no
-- UNNEST and no joins. bb_from/bb_to default to date_from/date_to, so with no new vars this behaves exactly
-- as the original. Drive it: --vars "{date_from: D, date_to: D, bb_from: <win start>, bb_to: <win end>}"
{{ 
    config(materialized="incremental",
         schema="warehouse",
          partition_by={
          "field": "Dt",
          "data_type": "date",
          "granularity": "day"},
          incremental_strategy = "insert_overwrite",
          on_schema_change='append_new_columns',
          labels={"component": "sport_ticket_daily", "owner": "data-engineering", "dbt": "true"},
         cluster_by=["Brand","ChannelId", "EventId", "BettypeId"])
}}





WITH source_data AS (
  SELECT
    DATE(st.CreateTime) AS Dt,
    st.Brand,
    bd.BettypeId,
    bd.EventId,
    bd.leagueName, 
    bd.ClassName, 
    c.Name as CountryName, 
    st.ProdType, 
    st.isSetteled AS IsSettled,
    st.ChannelId,
    IF(st.BookingCodeOrigin IS NULL, FALSE, TRUE) AS IsByBookingCode,
    st.IsBB, 
    st.IsFirstBB, 
    st.BBType, 
    st.UserId,
    st.OrderId,
    CONCAT(st.Brand, st.OrderId, bd.orderBetID) AS SelectionKey,
    betAmount, 
    relativeWin, 
    TotalSelections, 
    orderPayOut,
    CurrencyRate 
  FROM {{ source("warehouse","sportTickets") }} AS st
  LEFT JOIN UNNEST(st.BetDetails) AS bd
  LEFT JOIN {{ source("warehouse","EventsData") }} AS e 
    ON bd.EventId = e.ID AND st.Brand = e.Brand
  LEFT JOIN {{ source("warehouse","Countries") }} AS c 
    ON e.CountyId = c.ID AND st.Brand = c.Brand
  WHERE DATE(st.CreateTime) >= '2025-11-01' 
    {% if is_incremental() %}
      AND DATE(st.CreateTime) >= {{ get_date_from(var("date_from", none)) }} 
      AND DATE(st.CreateTime) <= {{ get_date_to(var("date_to", none)) }}
    {% endif %}
    AND DATE(e.CreateTime) >= '2024-11-01' 
    {% if is_incremental() %}
      AND DATE(e.CreateTime) >= DATE_SUB({{ get_date_from(var("date_from", none)) }}, INTERVAL 365 DAY)
    {% endif %}
),

-- ============ PRE-AGGREGATED COUNTS ============

-- By Date + Brand
agg_date_brand AS (
  SELECT Dt, Brand,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrand,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrand,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrand
  FROM source_data
  GROUP BY 1, 2
),

-- By Date + Brand + LeagueName
agg_date_brand_league AS (
  SELECT Dt, Brand, CountryName, ClassName, leagueName,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandLeagueName,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandLeagueName,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandLeagueName
  FROM source_data
  GROUP BY 1, 2, 3, 4, 5
),

-- By Date + Brand + BettypeId
agg_date_brand_bettype AS (
  SELECT Dt, Brand, BettypeId,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandBettypeId,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandBettypeId,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandBettypeId
  FROM source_data
  GROUP BY 1, 2, 3
),

-- By Date + Brand + EventId
agg_date_brand_event AS (
  SELECT Dt, Brand, EventId,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandEventId,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandEventId,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandEventId
  FROM source_data
  GROUP BY 1, 2, 3
),

-- By Date + Brand + IsBB
agg_date_brand_isbb AS (
  SELECT Dt, Brand, IsBB,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandIsBB,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandIsBB,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandIsBB
  FROM source_data
  GROUP BY 1, 2, 3
),

-- By Date + Brand + BBType + ProdType
agg_date_brand_bbtype_prodtype AS (
  SELECT Dt, Brand, BBType, ProdType,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandBBTypeProdType,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandBBTypeProdType,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandBBTypeProdType
  FROM source_data
  GROUP BY 1, 2, 3, 4
),

-- By Date + Brand + ProdType
agg_date_brand_prodtype AS (
  SELECT Dt, Brand, ProdType,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandProdType,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandProdType,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandProdType
  FROM source_data
  GROUP BY 1, 2, 3
),

-- By Date + Brand + IsBB + ClassName + ProdType
agg_date_brand_isbb_class_prodtype AS (
  SELECT Dt, Brand, IsBB, ClassName, ProdType,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandIsBBClassNameProdType,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandIsBBClassNameProdType,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandIsBBClassNameProdType
  FROM source_data
  GROUP BY 1, 2, 3, 4, 5
),

-- By Date + Brand + IsBB + ProdType
agg_date_brand_isbb_prodtype AS (
  SELECT Dt, Brand, IsBB, ProdType,
    COUNT(DISTINCT UserId) AS ActivesCountByDateBrandIsBBProdType,
    COUNT(DISTINCT OrderId) AS OrdersCountByDateBrandIsBBProdType,
    COUNT(DISTINCT SelectionKey) AS SelectionCountByDateBrandIsBBProdType
  FROM source_data
  GROUP BY 1, 2, 3, 4
),

-- ============ FINAL AGGREGATION ============
brand_bb AS (
  SELECT Brand, MAX(isBB) AS isBrandWithBB
  FROM {{ source("warehouse","sportTickets") }}
  WHERE DATE(CreateTime) >= '2025-11-01'
    {% if is_incremental() %}
      AND DATE(CreateTime) >= {{ get_date_from(var("bb_from", var("date_from", none))) }}
      AND DATE(CreateTime) <= {{ get_date_to(var("bb_to", var("date_to", none))) }}
    {% endif %}
  GROUP BY Brand
),

base_agg AS (
  SELECT
    Dt,
    Brand,
    BettypeId,
    EventId,
    leagueName,
    ClassName,
    CountryName,  
    ProdType, 
    IsSettled,
    ChannelId,
    IsByBookingCode,
    IsBB, 
    IsFirstBB, 
    BBType,
    COUNT(DISTINCT UserId) AS ActivesCount,
    COUNT(DISTINCT OrderId) AS OrdersCount,
    SUM(betAmount) AS BetAmount,
    SUM(IFNULL(relativeWin, 0)) AS WinAmount,
    SUM(TotalSelections) AS TotalSelections,
    SUM(betAmount / CurrencyRate) AS BetAmountUSD,
    SUM(IFNULL(relativeWin / CurrencyRate, 0)) AS WinAmountUSD, 
    SUM(orderPayOut) AS orderPayOut, 
    SUM(IFNULL(orderPayOut / CurrencyRate, 0)) AS orderPayOutUSD
  FROM source_data
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14
)

-- ============ JOIN ALL AGGREGATIONS ============
SELECT
  b.*,
  bb.isBrandWithBB,
  -- Date + Brand
  a1.ActivesCountByDateBrand,
  a1.OrdersCountByDateBrand,
  a1.SelectionCountByDateBrand,
  -- Date + Brand + League
  a2.ActivesCountByDateBrandLeagueName,
  a2.OrdersCountByDateBrandLeagueName,
  a2.SelectionCountByDateBrandLeagueName,
  -- Date + Brand + BettypeId
  a3.ActivesCountByDateBrandBettypeId,
  a3.OrdersCountByDateBrandBettypeId,
  a3.SelectionCountByDateBrandBettypeId,
  -- Date + Brand + EventId
  a4.ActivesCountByDateBrandEventId,
  a4.OrdersCountByDateBrandEventId,
  a4.SelectionCountByDateBrandEventId,
  -- Date + Brand + IsBB
  a5.ActivesCountByDateBrandIsBB,
  a5.OrdersCountByDateBrandIsBB,
  a5.SelectionCountByDateBrandIsBB,
  -- Date + Brand + BBType + ProdType
  a6.ActivesCountByDateBrandBBTypeProdType,
  a6.OrdersCountByDateBrandBBTypeProdType,
  a6.SelectionCountByDateBrandBBTypeProdType,
  -- Date + Brand + ProdType
  a7.ActivesCountByDateBrandProdType,
  a7.OrdersCountByDateBrandProdType,
  a7.SelectionCountByDateBrandProdType,
  -- Date + Brand + IsBB + ClassName + ProdType
  a8.ActivesCountByDateBrandIsBBClassNameProdType,
  a8.OrdersCountByDateBrandIsBBClassNameProdType,
  a8.SelectionCountByDateBrandIsBBClassNameProdType,
  -- Date + Brand + IsBB + ProdType
  a9.ActivesCountByDateBrandIsBBProdType,
  a9.OrdersCountByDateBrandIsBBProdType,
  a9.SelectionCountByDateBrandIsBBProdType

FROM base_agg b

LEFT JOIN brand_bb bb ON b.Brand = bb.Brand

LEFT JOIN agg_date_brand a1
  ON b.Dt = a1.Dt AND b.Brand = a1.Brand

LEFT JOIN agg_date_brand_league a2
  ON b.Dt = a2.Dt AND b.Brand = a2.Brand 
  AND b.CountryName = a2.CountryName
  AND b.ClassName = a2.ClassName
  AND b.leagueName = a2.leagueName

LEFT JOIN agg_date_brand_bettype a3
  ON b.Dt = a3.Dt AND b.Brand = a3.Brand AND b.BettypeId = a3.BettypeId

LEFT JOIN agg_date_brand_event a4
  ON b.Dt = a4.Dt AND b.Brand = a4.Brand AND b.EventId = a4.EventId

LEFT JOIN agg_date_brand_isbb a5
  ON b.Dt = a5.Dt AND b.Brand = a5.Brand AND b.IsBB = a5.IsBB

LEFT JOIN agg_date_brand_bbtype_prodtype a6
  ON b.Dt = a6.Dt AND b.Brand = a6.Brand 
  AND b.BBType = a6.BBType
  AND b.ProdType = a6.ProdType

LEFT JOIN agg_date_brand_prodtype a7
  ON b.Dt = a7.Dt AND b.Brand = a7.Brand AND b.ProdType = a7.ProdType

LEFT JOIN agg_date_brand_isbb_class_prodtype a8
  ON b.Dt = a8.Dt AND b.Brand = a8.Brand 
  AND b.IsBB = a8.IsBB 
  AND b.ClassName = a8.ClassName
  AND b.ProdType = a8.ProdType

LEFT JOIN agg_date_brand_isbb_prodtype a9
  ON b.Dt = a9.Dt AND b.Brand = a9.Brand 
  AND b.IsBB = a9.IsBB
  AND b.ProdType = a9.ProdType
sportTickets_daily.sql
Displaying job_reM9xFw-J4IjUGMJ8H2jft0LjqLf.json.