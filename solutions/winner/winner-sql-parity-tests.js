// Parity harness: the dbt model `sport_ticket_daily` ([sql-sample.sql], DuckDB port in sql-sample-duckdb.sql) vs winnerCube,
// both over the SAME bronze CSV. The cube now materializes the model's grain, so this is a full row-by-row, column-by-column
// diff: same 51 columns, same 138 rows, and every one of the 37 measures per row equal. One parquet, no joins.
import { dsls, jb } from '@jb6/core'
import '@jb6/testing'
import '@jb6/rx'
import './winner-cube.js'
import '@wonder/db/etl/file-query.js'

const {
  tgp: { Const, 'ctx-enricher': { setVars } },
  test: { Test, test: { dataTest } },
  common: { Data, data: { asIs, fileQuery, materializeCubeEvents, materializeCubePeriod, pipe }, boolean: { equals, and } },
  etl: { 'cli-transform': { duckdb }, 'cli-extract': { localFile } },
  bi: { cube: { winnerCube, cube }, 'silver-source': { materializeFromEvents }, metric: { metric },
    'field-reducer': { pick, rollupFields }, pick: { first, distinctCount } }
} = dsls

// what the cube's own source wUrl (signedRoom:fs//winner/admin/bronze/winner-events.csv) resolves to locally
Const('winnerBronzeFile', 'files/rooms/winner/admin/bronze/winner-events.csv')
Const('winnerBuildPeriod', '2026-07-11')

// dry run of materializePeriod: pull the cube's OWN event source and reduce it, without writing the parquet or uploading.
const materializeCubeSource = Data('materializeCubeSource', {
  params: [
    { id: 'cube', type: 'cube<bi>', dynamic: true, mandatory: true },
    { id: 'period', as: 'string', mandatory: true }
  ],
  impl: async (ctx, {}, { cube, period }) => {
    const c = cube(ctx), events = []
    const { sourceCb } = await c.eventSource.read(ctx, period, c.keyField)
    await new Promise((next, error) => jb.rxUtils.subscribe({ next: e => events.push(e), complete: next, error })(sourceCb))
    return c.materialize(events, ctx)
  }
})

// the composite keyField reduces the bronze to exactly the model's GROUP BY 1..14 — asserted without touching the room.
Test('winnerCube.reducesToModelGrain', {
  impl: dataTest({
    calculate: materializeCubeSource(winnerCube(), '%$winnerBuildPeriod%'),
    expectedResult: equals(138, '%length%'),
    timeout: 30000,
    logger: 'biLogger'
  })
})

// build → ONE parquet holding the model's whole output; the coarser-grain counts ride as columns, not sibling files.
Test('winnerCube.buildsOneParquet', {
  impl: dataTest({
    calculate: materializeCubePeriod(winnerCube(), '%$winnerBuildPeriod%'),
    expectedResult: and(equals(138, '%objs%'), equals('signedRoom:fs//winner/usersRO/winner-cells-2026-07-11.parquet', '%outUrl%')),
    setup: setVars(asIs({ localDir: '/tmp/winner-build' })),
    timeout: 60000,
    logger: 'biLogger'
  })
})

// THE parity test: rebuild, then diff every model row/column against the artifacts. 0 mismatches = the cube IS the model.
Test('winnerCube.matchesSqlModel', {
  impl: dataTest({
    calculate: pipe(materializeCubePeriod(winnerCube(), '%$winnerBuildPeriod%'), fileQuery({
      from: localFile('%$winnerBronzeFile%'),
      query: duckdb(`WITH source_data AS (SELECT * FROM read_csv('{%$inputFile%}', header = true, nullstr = '')),
r1_ AS (SELECT "Dt", "Brand",
    count(DISTINCT "UserId") actives, count(DISTINCT "OrderId") orders, count(DISTINCT "SelectionKey") selections
  FROM source_data GROUP BY 1, 2),
r2_ AS (SELECT "Dt", "Brand", "CountryName", "ClassName", "leagueName",
    count(DISTINCT "UserId") actives, count(DISTINCT "OrderId") orders, count(DISTINCT "SelectionKey") selections
  FROM source_data GROUP BY 1, 2, 3, 4, 5),
r3_ AS (SELECT "Dt", "Brand", "BettypeId",
    count(DISTINCT "UserId") actives, count(DISTINCT "OrderId") orders, count(DISTINCT "SelectionKey") selections
  FROM source_data GROUP BY 1, 2, 3),
r4_ AS (SELECT "Dt", "Brand", "EventId",
    count(DISTINCT "UserId") actives, count(DISTINCT "OrderId") orders, count(DISTINCT "SelectionKey") selections
  FROM source_data GROUP BY 1, 2, 3),
r5_ AS (SELECT "Dt", "Brand", "IsBB",
    count(DISTINCT "UserId") actives, count(DISTINCT "OrderId") orders, count(DISTINCT "SelectionKey") selections
  FROM source_data GROUP BY 1, 2, 3),
r6_ AS (SELECT "Dt", "Brand", "BBType", "ProdType",
    count(DISTINCT "UserId") actives, count(DISTINCT "OrderId") orders, count(DISTINCT "SelectionKey") selections
  FROM source_data GROUP BY 1, 2, 3, 4),
r7_ AS (SELECT "Dt", "Brand", "ProdType",
    count(DISTINCT "UserId") actives, count(DISTINCT "OrderId") orders, count(DISTINCT "SelectionKey") selections
  FROM source_data GROUP BY 1, 2, 3),
r8_ AS (SELECT "Dt", "Brand", "IsBB", "ClassName", "ProdType",
    count(DISTINCT "UserId") actives, count(DISTINCT "OrderId") orders, count(DISTINCT "SelectionKey") selections
  FROM source_data GROUP BY 1, 2, 3, 4, 5),
r9_ AS (SELECT "Dt", "Brand", "IsBB", "ProdType",
    count(DISTINCT "UserId") actives, count(DISTINCT "OrderId") orders, count(DISTINCT "SelectionKey") selections
  FROM source_data GROUP BY 1, 2, 3, 4),
base_agg AS (SELECT "Dt", "Brand", "BettypeId", "EventId", "leagueName", "ClassName", "CountryName",
    "ProdType", "IsSettled", "ChannelId", "IsByBookingCode", "IsBB", "IsFirstBB", "BBType",
    count(DISTINCT "UserId") AS "ActivesCount", count(DISTINCT "OrderId") AS "OrdersCount",
    sum("betAmount") AS "BetAmount", sum(ifnull("relativeWin", 0)) AS "WinAmount", sum("TotalSelections") AS "TotalSelections",
    sum("betAmount" / "CurrencyRate") AS "BetAmountUSD", sum(ifnull("relativeWin" / "CurrencyRate", 0)) AS "WinAmountUSD",
    sum("orderPayOut") AS "orderPayOut", sum(ifnull("orderPayOut" / "CurrencyRate", 0)) AS "orderPayOutUSD",
    max("IsBB") OVER (PARTITION BY "Brand") AS "isBrandWithBB"
  FROM source_data GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14),
model AS (SELECT b.*,
  r1.actives AS "ActivesCountByDateBrand",
  r1.orders AS "OrdersCountByDateBrand",
  r1.selections AS "SelectionCountByDateBrand",
  r2.actives AS "ActivesCountByDateBrandLeagueName",
  r2.orders AS "OrdersCountByDateBrandLeagueName",
  r2.selections AS "SelectionCountByDateBrandLeagueName",
  r3.actives AS "ActivesCountByDateBrandBettypeId",
  r3.orders AS "OrdersCountByDateBrandBettypeId",
  r3.selections AS "SelectionCountByDateBrandBettypeId",
  r4.actives AS "ActivesCountByDateBrandEventId",
  r4.orders AS "OrdersCountByDateBrandEventId",
  r4.selections AS "SelectionCountByDateBrandEventId",
  r5.actives AS "ActivesCountByDateBrandIsBB",
  r5.orders AS "OrdersCountByDateBrandIsBB",
  r5.selections AS "SelectionCountByDateBrandIsBB",
  r6.actives AS "ActivesCountByDateBrandBBTypeProdType",
  r6.orders AS "OrdersCountByDateBrandBBTypeProdType",
  r6.selections AS "SelectionCountByDateBrandBBTypeProdType",
  r7.actives AS "ActivesCountByDateBrandProdType",
  r7.orders AS "OrdersCountByDateBrandProdType",
  r7.selections AS "SelectionCountByDateBrandProdType",
  r8.actives AS "ActivesCountByDateBrandIsBBClassNameProdType",
  r8.orders AS "OrdersCountByDateBrandIsBBClassNameProdType",
  r8.selections AS "SelectionCountByDateBrandIsBBClassNameProdType",
  r9.actives AS "ActivesCountByDateBrandIsBBProdType",
  r9.orders AS "OrdersCountByDateBrandIsBBProdType",
  r9.selections AS "SelectionCountByDateBrandIsBBProdType"
  FROM base_agg b
  LEFT JOIN r1_ r1 ON b."Dt" = r1."Dt" AND b."Brand" = r1."Brand"
  LEFT JOIN r2_ r2 ON b."Dt" = r2."Dt" AND b."Brand" = r2."Brand" AND b."CountryName" = r2."CountryName"
      AND b."ClassName" = r2."ClassName" AND b."leagueName" = r2."leagueName"
  LEFT JOIN r3_ r3 ON b."Dt" = r3."Dt" AND b."Brand" = r3."Brand" AND b."BettypeId" = r3."BettypeId"
  LEFT JOIN r4_ r4 ON b."Dt" = r4."Dt" AND b."Brand" = r4."Brand" AND b."EventId" = r4."EventId"
  LEFT JOIN r5_ r5 ON b."Dt" = r5."Dt" AND b."Brand" = r5."Brand" AND b."IsBB" = r5."IsBB"
  LEFT JOIN r6_ r6 ON b."Dt" = r6."Dt" AND b."Brand" = r6."Brand" AND b."BBType" = r6."BBType" AND b."ProdType" = r6."ProdType"
  LEFT JOIN r7_ r7 ON b."Dt" = r7."Dt" AND b."Brand" = r7."Brand" AND b."ProdType" = r7."ProdType"
  LEFT JOIN r8_ r8 ON b."Dt" = r8."Dt" AND b."Brand" = r8."Brand" AND b."IsBB" = r8."IsBB" AND b."ClassName" = r8."ClassName" AND b."ProdType" = r8."ProdType"
  LEFT JOIN r9_ r9 ON b."Dt" = r9."Dt" AND b."Brand" = r9."Brand" AND b."IsBB" = r9."IsBB" AND b."ProdType" = r9."ProdType"),
cube AS (SELECT * FROM read_parquet('files/rooms/winner/usersRO/winner-cells-{%$period%}.parquet'))
SELECT (SELECT count(*) FROM model) AS model_rows, (SELECT count(*) FROM cube) AS cube_rows,
  (SELECT count(*) FROM (DESCRIBE SELECT * FROM model)) AS model_columns,
  (SELECT count(*) FROM (DESCRIBE SELECT * FROM cube)) AS cube_columns,
  (SELECT count(*) FROM ((SELECT column_name FROM (DESCRIBE SELECT * FROM model))
    EXCEPT (SELECT column_name FROM (DESCRIBE SELECT * FROM cube)))) AS columns_missing_from_cube,
  (SELECT count(*) FROM model m FULL OUTER JOIN cube k
    USING ("Dt", "Brand", "BettypeId", "EventId", "leagueName", "ClassName",
      "CountryName", "ProdType", "IsSettled", "ChannelId", "IsByBookingCode", "IsBB", "IsFirstBB", "BBType")
    WHERE m."Brand" IS NULL OR k."Brand" IS NULL) AS unmatched_rows,
  37 AS values_compared_per_row,
  (SELECT sum(CASE WHEN round(m."ActivesCount", 6) IS DISTINCT FROM round(k."ActivesCount", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."OrdersCount", 6) IS DISTINCT FROM round(k."OrdersCount", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."BetAmount", 6) IS DISTINCT FROM round(k."BetAmount", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."WinAmount", 6) IS DISTINCT FROM round(k."WinAmount", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."TotalSelections", 6) IS DISTINCT FROM round(k."TotalSelections", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."BetAmountUSD", 6) IS DISTINCT FROM round(k."BetAmountUSD", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."WinAmountUSD", 6) IS DISTINCT FROM round(k."WinAmountUSD", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."orderPayOut", 6) IS DISTINCT FROM round(k."orderPayOut", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."orderPayOutUSD", 6) IS DISTINCT FROM round(k."orderPayOutUSD", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."ActivesCountByDateBrand", 6) IS DISTINCT FROM round(k."ActivesCountByDateBrand", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."OrdersCountByDateBrand", 6) IS DISTINCT FROM round(k."OrdersCountByDateBrand", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."SelectionCountByDateBrand", 6) IS DISTINCT FROM round(k."SelectionCountByDateBrand", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."ActivesCountByDateBrandLeagueName", 6) IS DISTINCT FROM round(k."ActivesCountByDateBrandLeagueName", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."OrdersCountByDateBrandLeagueName", 6) IS DISTINCT FROM round(k."OrdersCountByDateBrandLeagueName", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."SelectionCountByDateBrandLeagueName", 6) IS DISTINCT FROM round(k."SelectionCountByDateBrandLeagueName", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."ActivesCountByDateBrandBettypeId", 6) IS DISTINCT FROM round(k."ActivesCountByDateBrandBettypeId", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."OrdersCountByDateBrandBettypeId", 6) IS DISTINCT FROM round(k."OrdersCountByDateBrandBettypeId", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."SelectionCountByDateBrandBettypeId", 6) IS DISTINCT FROM round(k."SelectionCountByDateBrandBettypeId", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."ActivesCountByDateBrandEventId", 6) IS DISTINCT FROM round(k."ActivesCountByDateBrandEventId", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."OrdersCountByDateBrandEventId", 6) IS DISTINCT FROM round(k."OrdersCountByDateBrandEventId", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."SelectionCountByDateBrandEventId", 6) IS DISTINCT FROM round(k."SelectionCountByDateBrandEventId", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."ActivesCountByDateBrandIsBB", 6) IS DISTINCT FROM round(k."ActivesCountByDateBrandIsBB", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."OrdersCountByDateBrandIsBB", 6) IS DISTINCT FROM round(k."OrdersCountByDateBrandIsBB", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."SelectionCountByDateBrandIsBB", 6) IS DISTINCT FROM round(k."SelectionCountByDateBrandIsBB", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."ActivesCountByDateBrandBBTypeProdType", 6) IS DISTINCT FROM round(k."ActivesCountByDateBrandBBTypeProdType", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."OrdersCountByDateBrandBBTypeProdType", 6) IS DISTINCT FROM round(k."OrdersCountByDateBrandBBTypeProdType", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."SelectionCountByDateBrandBBTypeProdType", 6) IS DISTINCT FROM round(k."SelectionCountByDateBrandBBTypeProdType", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."ActivesCountByDateBrandProdType", 6) IS DISTINCT FROM round(k."ActivesCountByDateBrandProdType", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."OrdersCountByDateBrandProdType", 6) IS DISTINCT FROM round(k."OrdersCountByDateBrandProdType", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."SelectionCountByDateBrandProdType", 6) IS DISTINCT FROM round(k."SelectionCountByDateBrandProdType", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."ActivesCountByDateBrandIsBBClassNameProdType", 6) IS DISTINCT FROM round(k."ActivesCountByDateBrandIsBBClassNameProdType", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."OrdersCountByDateBrandIsBBClassNameProdType", 6) IS DISTINCT FROM round(k."OrdersCountByDateBrandIsBBClassNameProdType", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."SelectionCountByDateBrandIsBBClassNameProdType", 6) IS DISTINCT FROM round(k."SelectionCountByDateBrandIsBBClassNameProdType", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."ActivesCountByDateBrandIsBBProdType", 6) IS DISTINCT FROM round(k."ActivesCountByDateBrandIsBBProdType", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."OrdersCountByDateBrandIsBBProdType", 6) IS DISTINCT FROM round(k."OrdersCountByDateBrandIsBBProdType", 6) THEN 1 ELSE 0 END +
    CASE WHEN round(m."SelectionCountByDateBrandIsBBProdType", 6) IS DISTINCT FROM round(k."SelectionCountByDateBrandIsBBProdType", 6) THEN 1 ELSE 0 END +
    CASE WHEN m."isBrandWithBB" IS DISTINCT FROM k."isBrandWithBB" THEN 1 ELSE 0 END) FROM model m JOIN cube k
    USING ("Dt", "Brand", "BettypeId", "EventId", "leagueName", "ClassName",
      "CountryName", "ProdType", "IsSettled", "ChannelId", "IsByBookingCode", "IsBB", "IsFirstBB", "BBType"))::int AS mismatches`, { format: 'JSON, ARRAY' })
    })),
    expectedResult: equals(asIs([{ model_rows: 138, cube_rows: 138, model_columns: 51, cube_columns: 51,
      columns_missing_from_cube: 0, unmatched_rows: 0, values_compared_per_row: 37, mismatches: 0 }])),
    setup: setVars(asIs({ localDir: '/tmp/winner-build', period: '2026-07-11' })),
    timeout: 60000,
    logger: 'biLogger,etlLogger'
  })
})

// The fixture has NULL in none of its 14 dimensions, so matchesSqlModel is structurally blind to NULL-grain behaviour.
// This pins it directly: GROUP BY forms a NULL group, `s.c = p.c` never matches it, so a null-grain cell gets NULL
// aggregates — what the dbt model's LEFT JOINs produce. Before the fix the JS path broadcast the group's value instead.
Const('nullDimEvents', [
  { Brand: 'A', BBType: 1, UserId: 1 }, { Brand: 'A', BBType: null, UserId: 2 }, { Brand: 'A', BBType: null, UserId: 3 }
])
Test('winnerCube.nullDimensionMatchesSqlJoin', {
  impl: dataTest({
    calculate: materializeCubeEvents(
      cube(materializeFromEvents({
        keyField: 'Brand,BBType',
        fields: [pick('Brand,BBType', { take: first() }), pick('UserId as cellUsers', { take: distinctCount() }),
          rollupFields(['BBType'], [metric('usersByBBType', 'distinctCount(UserId)')])]
      })), '%$nullDimEvents%'),
    expectedResult: equals(asIs([
      { Brand: 'A', BBType: 1, cellUsers: 1, usersByBBType: 1 },
      { Brand: 'A', BBType: null, cellUsers: 2, usersByBBType: null }
    ])),
    logger: 'biLogger'
  })
})
