// parquetContentDiff — does one build reproduce another, cell for cell?
//
// NOT a checksum. Parquet is not byte-reproducible from identical input: zstd framing, row-group boundaries
// and `created_by` metadata all drift between runs, so comparing hashes reports differences that do not exist.
// Content is compared instead, and order-independently, via a symmetric EXCEPT.
//
// SCHEMA IS CHECKED FIRST, and that ordering is load-bearing. A column's parquet type is INFERRED per build
// (trap 7.6: is_lead arrives from Datastream as a string and types VARCHAR one run, BIGINT the next). EXCEPT
// THROWS on mismatched types rather than reporting them, so a type drift checked second would surface as an
// opaque duckdb error instead of the actual finding.

import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@wonder/bi/bi-common.js'

const { common: { Data } } = dsls
const { runDuckdb } = jb.biUtils
const q = s => `'${String(s).replaceAll("'", "''")}'`
const describeCols = t => `SELECT column_name, column_type FROM (DESCRIBE SELECT * FROM read_parquet(${q(t)}))`

Data('parquetContentDiff', {
  description: 'symmetric content diff of two parquets: schema drift first, then rows present in one and not the other',
  params: [
    { id: 'left', as: 'string', mandatory: true, description: 'the reference build' },
    { id: 'right', as: 'string', mandatory: true, description: 'the build under test' }
  ],
  impl: async (ctx, {}, { left, right }) => {
    const schemaDrift = await runDuckdb(`WITH l AS (${describeCols(left)}), r AS (${describeCols(right)})
      SELECT coalesce(l.column_name, r.column_name) AS column_name,
             l.column_type AS left_type, r.column_type AS right_type
      FROM l FULL JOIN r USING (column_name)
      WHERE l.column_type IS DISTINCT FROM r.column_type
      ORDER BY 1`, ctx)
    if (schemaDrift.length) return { identical: false, schemaDrift }
    const [c] = await runDuckdb(`WITH l AS (SELECT * FROM read_parquet(${q(left)})), r AS (SELECT * FROM read_parquet(${q(right)}))
      SELECT (SELECT count(*) FROM l) AS left_rows, (SELECT count(*) FROM r) AS right_rows,
             (SELECT count(*) FROM (SELECT * FROM l EXCEPT SELECT * FROM r)) AS only_in_left,
             (SELECT count(*) FROM (SELECT * FROM r EXCEPT SELECT * FROM l)) AS only_in_right`, ctx)
    return { identical: +c.only_in_left === 0 && +c.only_in_right === 0, schemaDrift: [], ...c }
  }
})
