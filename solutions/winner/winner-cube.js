// winnerCube — the cube form of the dbt model `sport_ticket_daily` (sql-sample.sql). ONE parquet per period holding the
// model's whole output: the 14-dimension cell (base_agg) plus its nine pre-aggregated count blocks and the brand-wide BB
// flag. Those nine are period-phase `rollupFields` — a distinctCount stored per cell never re-aggregates upward, so they
// are computed over all the period's events and broadcast onto every row of their grain, exactly as the model's LEFT
// JOINs do. Column names are the model's verbatim (orderPayOut camelCase included) so the two diff without renaming.
import { dsls } from '@jb6/core'
import '@wonder/bi/metrics.js'
import '@wonder/bi/event-sources.js'
import '@wonder/bi/materialization.js'
import '@wonder/bi/bi-manifest.js'

const {
  tgp: { Const },
  bi: {
    Cube, cube: { cube }, 'event-source': { csvEventSource }, 'silver-source': { materializeFromEvents },
    'field-reducer': { pick, withAggFunc, rollupFields }, pick: { first, distinctCount, sum },
    'parquet-file': { projection }, dimension: { dimension }, metric: { metric }
  }
} = dsls

// the model's GROUP BY 1..14 — one string, used as BOTH the composite keyField and the pick carrying the cell's identity.
Const('winnerCellGrain', 'Dt, Brand, BettypeId, EventId, leagueName, ClassName, CountryName, ProdType, IsSettled, ChannelId, IsByBookingCode, IsBB, IsFirstBB, BBType')

const winnerCube = Cube('winnerCube', {
  impl: cube(materializeFromEvents({
    eventSource: csvEventSource('signedRoom:fs//winner/admin/bronze/winner-events.csv', { sortByKey: true }),
    keyField: '%$winnerCellGrain%',
    fields: [
      pick('%$winnerCellGrain%', { take: first() }),
      pick('UserId as ActivesCount', { take: distinctCount() }),
      pick('OrderId as OrdersCount', { take: distinctCount() }),
      pick('betAmount as BetAmount', { take: sum() }), pick('relativeWin as WinAmount', { take: sum() }),
      pick('TotalSelections as TotalSelections', { take: sum() }), pick('orderPayOut as orderPayOut', { take: sum() }),
      // the model's SUM(x / CurrencyRate); `|| 0` is its IFNULL — a null amount contributes nothing, never NaN.
      withAggFunc(ctx => ctx.data.reduce((r, e) => ({
        BetAmountUSD: r.BetAmountUSD + (e.betAmount / e.CurrencyRate || 0),
        WinAmountUSD: r.WinAmountUSD + (e.relativeWin / e.CurrencyRate || 0),
        orderPayOutUSD: r.orderPayOutUSD + (e.orderPayOut / e.CurrencyRate || 0)
      }), { BetAmountUSD: 0, WinAmountUSD: 0, orderPayOutUSD: 0 })),
      rollupFields(['Dt', 'Brand'],
        [metric('ActivesCountByDateBrand', 'distinctCount(UserId)'), metric('OrdersCountByDateBrand', 'distinctCount(OrderId)'),
          metric('SelectionCountByDateBrand', 'distinctCount(SelectionKey)')]),
      rollupFields(['Dt', 'Brand', 'CountryName', 'ClassName', 'leagueName'],
        [metric('ActivesCountByDateBrandLeagueName', 'distinctCount(UserId)'), metric('OrdersCountByDateBrandLeagueName', 'distinctCount(OrderId)'),
          metric('SelectionCountByDateBrandLeagueName', 'distinctCount(SelectionKey)')]),
      rollupFields(['Dt', 'Brand', 'BettypeId'],
        [metric('ActivesCountByDateBrandBettypeId', 'distinctCount(UserId)'), metric('OrdersCountByDateBrandBettypeId', 'distinctCount(OrderId)'),
          metric('SelectionCountByDateBrandBettypeId', 'distinctCount(SelectionKey)')]),
      rollupFields(['Dt', 'Brand', 'EventId'],
        [metric('ActivesCountByDateBrandEventId', 'distinctCount(UserId)'), metric('OrdersCountByDateBrandEventId', 'distinctCount(OrderId)'),
          metric('SelectionCountByDateBrandEventId', 'distinctCount(SelectionKey)')]),
      rollupFields(['Dt', 'Brand', 'IsBB'],
        [metric('ActivesCountByDateBrandIsBB', 'distinctCount(UserId)'), metric('OrdersCountByDateBrandIsBB', 'distinctCount(OrderId)'),
          metric('SelectionCountByDateBrandIsBB', 'distinctCount(SelectionKey)')]),
      rollupFields(['Dt', 'Brand', 'BBType', 'ProdType'],
        [metric('ActivesCountByDateBrandBBTypeProdType', 'distinctCount(UserId)'), metric('OrdersCountByDateBrandBBTypeProdType', 'distinctCount(OrderId)'),
          metric('SelectionCountByDateBrandBBTypeProdType', 'distinctCount(SelectionKey)')]),
      rollupFields(['Dt', 'Brand', 'ProdType'],
        [metric('ActivesCountByDateBrandProdType', 'distinctCount(UserId)'), metric('OrdersCountByDateBrandProdType', 'distinctCount(OrderId)'),
          metric('SelectionCountByDateBrandProdType', 'distinctCount(SelectionKey)')]),
      rollupFields(['Dt', 'Brand', 'IsBB', 'ClassName', 'ProdType'],
        [metric('ActivesCountByDateBrandIsBBClassNameProdType', 'distinctCount(UserId)'), metric('OrdersCountByDateBrandIsBBClassNameProdType', 'distinctCount(OrderId)'),
          metric('SelectionCountByDateBrandIsBBClassNameProdType', 'distinctCount(SelectionKey)')]),
      rollupFields(['Dt', 'Brand', 'IsBB', 'ProdType'],
        [metric('ActivesCountByDateBrandIsBBProdType', 'distinctCount(UserId)'), metric('OrdersCountByDateBrandIsBBProdType', 'distinctCount(OrderId)'),
          metric('SelectionCountByDateBrandIsBBProdType', 'distinctCount(SelectionKey)')]),
      // the model's MAX(isBB) OVER (PARTITION BY Brand) — brand-wide, so no 14-dimension cell can compute it alone.
      rollupFields(['Brand'], [metric('isBrandWithBB', 'max(IsBB)')])
    ],
    parquetFiles: [projection('cells', 'signedRoom:fs//winner/usersRO/winner-cells-${period}.parquet')]
  }), {
    cacheStrategy: 'noCache',
    dimensions: [dimension('Dt', { type: 'timestamp' }), dimension('Brand'), dimension('BettypeId'), dimension('EventId'),
      dimension('leagueName'), dimension('ClassName'), dimension('CountryName'), dimension('ProdType'),
      dimension('IsSettled', { type: 'boolean' }), dimension('ChannelId'), dimension('IsByBookingCode', { type: 'boolean' }),
      dimension('IsBB', { type: 'boolean' }), dimension('IsFirstBB', { type: 'boolean' }), dimension('BBType')],
    metrics: [
      ...['BetAmount', 'WinAmount', 'TotalSelections', 'BetAmountUSD', 'WinAmountUSD', 'orderPayOut', 'orderPayOutUSD']
        .map(name => metric(name, `sum(${name})`)),
      // already broadcast at their own grain — max() picks that one value back out, it never adds across grains.
      ...['ByDateBrand', 'ByDateBrandLeagueName', 'ByDateBrandBettypeId', 'ByDateBrandEventId', 'ByDateBrandIsBB',
        'ByDateBrandBBTypeProdType', 'ByDateBrandProdType', 'ByDateBrandIsBBClassNameProdType', 'ByDateBrandIsBBProdType']
        .flatMap(suffix => ['ActivesCount', 'OrdersCount', 'SelectionCount']
          .map(kind => metric(`${kind}${suffix}`, `max(${kind}${suffix})`))),
      metric('isBrandWithBB', 'max(isBrandWithBB)')
    ],
    limits: [
      'ActivesCount / OrdersCount are per-cell distinct counts and are NOT metrics — summing them across cells double counts any user or order in more than one cell.',
      'The ...ByDateBrandX columns are valid only when grouping AT or BELOW their own grain; max() reads the broadcast value back, it does not aggregate across grains.',
      'TotalSelections and orderPayOut are order-level amounts repeated on every unnested selection of that order; confirm allocation before financial reporting.'
    ]
  })
})
