import { dsls } from '@jb6/core'
import './winner-cube.js'
import '@wonder/bi/benchmark/bi-benchmark-dsl.js'

const { bi: { QueryCase, 'query-case': { queryCase } } } = dsls
const cube = dsls.bi.cube.winnerCube()

// only the SUMMABLE cell measures — ActivesCount/OrdersCount are per-cell distinct counts and do not roll up (see cube.limits).
QueryCase('winnerBench.brands', {
  impl: queryCase({
    sql: `select Brand,BetAmount,WinAmount,TotalSelections,BetAmountUSD,WinAmountUSD,orderPayOut,orderPayOutUSD
      group by Brand order by BetAmount desc`,
    cube,
    expectedResult: ctx => ctx.data.length === 5
  })
})

// the coarser-grain counts, read at the grain they were broadcast to — max() reads the value back, it does not add.
QueryCase('winnerBench.dateBrandCounts', {
  impl: queryCase({
    sql: `select Dt,Brand,ActivesCountByDateBrand,OrdersCountByDateBrand,SelectionCountByDateBrand
      group by Dt,Brand order by ActivesCountByDateBrand desc`,
    cube,
    expectedResult: ctx => ctx.data.length === 8
  })
})
