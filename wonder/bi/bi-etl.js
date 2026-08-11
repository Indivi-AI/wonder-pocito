import { dsls, coreUtils, jb } from '@jb6/core'
import '@wonder/db/etl/etl-dsl.js'

const biUtils = jb.biUtils ||= {}
const {
  tgp: { Component },
  etl: { etl: { cliEtl }, 'cli-extract': { localFile }, 'cli-transform': { duckdb }, 'cli-load': { copyToFile } }
} = dsls

Component('parquetRowGroups', {
  moreTypes: 'etl<etl>',
  params: [
    {id: 'source', as: 'string'},
    {id: 'outFile', as: 'string'},
    {id: 'rowGroupSize', as: 'number', defaultValue: 262144}
  ],
  impl: cliEtl({
    extract: localFile('%$source%'),
    transform: duckdb("SELECT * FROM read_parquet('{%$inputFile%}')", 'PARQUET, COMPRESSION GZIP, ROW_GROUP_SIZE %$rowGroupSize%'),
    load: copyToFile('%$outFile%')
  })
})

biUtils.writeMonthQuarterYearParquet = async ({ source, outFile, dateColumn }) => {
  if (!/^[A-Za-z_]\w*$/.test(dateColumn)) throw new Error(`invalid date column ${dateColumn}`)
  const py = `import os, duckdb, pyarrow as pa, pyarrow.parquet as pq
src,out,col=${JSON.stringify(source)},${JSON.stringify(outFile)},${JSON.stringify(dateColumn)}
con=duckdb.connect(); last=con.execute(f"select year(max({col}))*12+month(max({col}))-1 from read_parquet(?)",[src]).fetchone()[0]
num=lambda m:int(m[:4])*12+int(m[5:])-1
segment=lambda m:m if num(m)==last else f'{m[:4]}-Q{(int(m[5:])-1)//3+1}' if num(m)>=last-last%3-9 else m[:4]
tmp=out+'.tmp'; writer=None; pending=[]; current=None; segments=set()
def flush():
 global pending
 if pending: writer.write_table(pa.concat_tables(pending),row_group_size=sum(x.num_rows for x in pending)); pending=[]
for batch in con.execute(f"select * from read_parquet(?) order by {col}",[src]).fetch_record_batch(1000000):
 table=pa.Table.from_batches([batch]); keys=[segment(str(x)[:7]) for x in table.column(col).to_pylist()]
 cuts=[0]+[i for i in range(1,len(keys)) if keys[i]!=keys[i-1]]+[len(keys)]
 if writer is None: writer=pq.ParquetWriter(tmp,table.schema)
 for a,z in zip(cuts,cuts[1:]):
  key=keys[a]
  if current!=key: flush(); current=key
  pending.append(table.slice(a,z-a)); segments.add(key)
flush(); writer.close()
groups=con.execute("select count(distinct row_group_id) from parquet_metadata(?)",[tmp]).fetchone()[0]
if groups!=len(segments): raise RuntimeError(f'MQY segments {len(segments)} != row groups {groups}')
os.replace(tmp,out); print('DONE',len(segments))`
  const result = await coreUtils.runBashScript(`python3 - <<'PYEOF'\n${py}\nPYEOF`)
  if (!/DONE/.test(result.stdout || '')) throw new Error(result.stderr || 'MQY parquet failed')
  return +(result.stdout.match(/DONE (\d+)/) || [])[1]
}

Component('monthQuarterYearParquet', {
  moreTypes: 'etl<etl>',
  params: [{id: 'source', as: 'string'}, {id: 'outFile', as: 'string'}, {id: 'dateColumn', as: 'string'}],
  impl: (_, {}, args) => biUtils.writeMonthQuarterYearParquet(args)
})
