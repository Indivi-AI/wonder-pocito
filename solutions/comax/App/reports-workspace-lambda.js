import { dsls } from '@jb6/core'
import '@wonder/llm-flow/report-step.js'
import '@wonder-admin/room/room-lambda-client.js'

const { common: { Lambda, data: { runReport } } } = dsls

const REPORTS_ROOT = 'signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466'

// The Reports-workspace test runner: one (possibly edited) slot is wrapped in a minimal single-slot
// registry and executed through the production runReport path — same {{ROOT}} substitution, same
// widget materialization the agent uses, so a green run here means the slot works in production.
Lambda('testVerifiedSlot', {
  permissionByPath: 'usersRO',
  description: 'run one verified-queries slot ({goal,sql,widget}) against the room parquet; returns {rows, rowCount, widgets, durMs, error?}',
  params: [
    {id: 'slot', description: '{goal, sql, widget} — the slot under test'},
    {id: 'viewSql', as: 'text', asIs: true, description: 'full_data slice mode: the section fullData viewSql; slot.sql is the slice over it'},
    {id: 'root', as: 'string', defaultValue: REPORTS_ROOT},
    {id: 'runSlot', dynamic: true, defaultValue: runReport({reportId: 'workspaceSlot', scope: ctx => ctx.vars.viewSql ? 'none' : 'executiveSummary', sections: ctx => ctx.vars.viewSql ? ['slice'] : []})}
  ],
  impl: async (ctx, {}, {slot, viewSql, root, runSlot}) => {
    // dev machines mount the room parquet at files/rooms/<roomId>/... (symlink) - prefer it over the room wUrl (duckdb reads local disk, no signing)
    const { existsSync } = await import('fs')
    const localRoot = root.replace(/^room:\/\//, 'files/rooms/')
    const rootInUse = existsSync(localRoot) ? localRoot : root
    const t0 = Date.now()
    const report = viewSql ? { id: 'workspaceSlot', sections: [{ id: 'slice', summary: slot, fullData: { viewSql } }] } : { id: 'workspaceSlot', executiveSummary: slot }
    const res = await runSlot(ctx.setVars({ reportsRegistry: [report], reportsRoot: rootInUse, viewSql }))
    const rows = viewSql ? res?.results?.sections?.slice?.rows : res?.results?.executiveSummary
    const error = res?.error || rows?.error
    return { durMs: Date.now() - t0, root: rootInUse, ...(error ? { error } : {}), rowCount: Array.isArray(rows) ? rows.length : 0,
      rows: Array.isArray(rows) ? rows.slice(0, 200) : [], widgets: res?.widgets || [] }
  }
})
