# Reading a model: grain, fan-out, partitionability

## Grain table — build this first
For every aggregating block, record its GROUP BY columns. Example (Winner sportTickets_daily):

| block | grain |
|---|---|
| base_agg | Dt, Brand, BettypeId, EventId, leagueName, ClassName, CountryName, ProdType, IsSettled, ChannelId, IsByBookingCode, IsBB, IsFirstBB, BBType |
| a1 | Dt, Brand |
| a2 | Dt, Brand, CountryName, ClassName, leagueName |
| a3..a9 | Dt, Brand + {BettypeId} {EventId} {IsBB} {BBType,ProdType} {ProdType} {IsBB,ClassName,ProdType} {IsBB,ProdType} |

## The day-partitionability test
A model can run one partition at a time iff **every** aggregating block's grain contains the partition column,
and no window function partitions by something that excludes it.

Winner: all ten blocks lead with `Dt`. The single exception was `MAX(isBB) OVER (PARTITION BY Brand)` —
brand-wide, so no single day can compute it. Fix: lift it into its own CTE over the full window and LEFT JOIN
it back. Cost: +11 / −1 / +1 / +2 lines. Output identical (see the equivalence note below).

Why it matters: peak memory divides by the number of partitions. A model that OOMs on a 32 GiB box as one
query can run in 8 GiB per-day. It does NOT help BigQuery (which shuffles rather than holding hash tables),
and can slightly *hurt* it via per-job overhead.

## Re-aggregation safety
`SUM`, `MIN`, `MAX`, `COUNT(*)` survive re-aggregation. **`COUNT(DISTINCT)` does not** — summing per-cell
distinct counts double-counts anything appearing in two cells. This is exactly why models like this run N
separate `GROUP BY`s over the source instead of rolling up the base table, and why those blocks cannot be
derived from the finished output.

## Equivalence expectations when you rewrite
Integer columns and all `COUNT(DISTINCT)` results must match **exactly**. Float `SUM` columns will differ by
≤1 ULP (~1e-16 relative) because IEEE-754 addition is not associative and a different execution shape sums in
a different order. Verify by rounding to 6 dp, not by byte comparison. Say "numerically identical", never
"bit-identical".
