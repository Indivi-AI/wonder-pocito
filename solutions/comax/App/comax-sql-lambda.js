import { dsls } from '@jb6/core'
import '@wonder/ai/report-step.js'
import '@wonder/db/room/room-lambda-client.js'
// the report DEFINITIONS only - Reports/index.js also pulls the UI comps (@jb6/react), which a node lambda closure can't load
import '../Reports/comax-reports.js'
import '../Reports/inventory-analysis.js'
import '../Reports/promotions.js'
import '../Reports/promo-recommendations.js'
import '../Reports/qlik-sales-pulse.js'
import '../Reports/qlik-branch-operations.js'
import '../Reports/qlik-assortment-performance.js'
import '../Reports/qlik-flexible-comparison.js'
import '../Reports/qlik-holiday-performance.js'
import '../Reports/qlik-inventory-performance.js'
import '../Reports/qlik-period-comparison.js'

const { common: { Lambda, Data, data: { duckDbSql, runReport, queryReportFullData, verifiedReportsRegistry } } } = dsls

const ROOT = 'signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466'
const CACHE_ROOT = 'signedRoom://comaxDemo/usersRO/cache'

// The comax demo's server-side sql runner: the browser duckDbSql hook (%$sqlLambda% = 'comaxSql') ships
// duckDbSql profiles through this lambda's closure, so duckdb runs near the parquet with signed reads.
Lambda('comaxSql', {
  permissionByPath: 'usersRO',
  params: [
    { id: 'sql', as: 'text', asIs: true, defaultValue: 'select 1' },
    { id: 'runSql', dynamic: true, defaultValue: duckDbSql(ctx => ctx.vars.sqlToRun) }
  ],
  impl: (ctx, {}, { sql, runSql }) => runSql(ctx.setVars({ sqlToRun: sql }))
})

// the browser runReport hook ships the selected report slots and typed params here,
// so one lambda call runs the whole report near the data with the room cache - also the anon (noAuth) data path
Lambda('comaxRunReport', {
  permissionByPath: 'usersRO',
  params: [
    { id: 'reportId', as: 'string', mandatory: true },
    { id: 'scope', as: 'string', defaultValue: 'executiveSummary' },
    { id: 'sections', as: 'array' },
    { id: 'sectionDepth', as: 'string', defaultValue: 'summary' },
    { id: 'params', asIs: true },
    { id: 'runOne', dynamic: true, defaultValue: runReport({ reportId: '%$warmReportId%', scope: '%$warmScope%',
      sections: '%$warmSections%', sectionDepth: '%$warmSectionDepth%', params: ctx => ctx.vars.warmParams }) }
  ],
  impl: (ctx, {}, { reportId, scope, sections, sectionDepth, params, runOne }) => runOne(ctx.setVars({
    reportsRegistry: verifiedReportsRegistry.$runWithCtx(ctx), reportsRoot: ROOT, reportsCacheRoot: CACHE_ROOT,
    reportsCacheWrite: true,   // self-warming: a miss computed here lands in the room cache (no-op for callers without usersRO write)
    duckdbMatRun: `report_${Date.now()}`, warmReportId: reportId, warmScope: scope, warmSections: sections,
    warmSectionDepth: sectionDepth, warmParams: params
  }))
})

Data('comaxWarmRoomCache', {
  description: 'admin: run standard runReport combos and one slice per fullData section against the '
    + 'signedRoom root, building parquets and writing every result into the room cache',
  params: [
    { id: 'reportIds', as: 'array', description: 'empty = all catalog reports' },
    { id: 'root', as: 'string', defaultValue: ROOT },
    { id: 'cacheRoot', as: 'string', defaultValue: CACHE_ROOT },
    { id: 'runOne', dynamic: true, defaultValue: runReport({ reportId: '%$warmReportId%', scope: '%$warmScope%', sections: '%$warmSections%', sectionDepth: 'summary' }) },
    { id: 'runSlice', dynamic: true, defaultValue: queryReportFullData({ reportId: '%$warmReportId%', sectionId: '%$warmSectionId%', sql: 'SELECT count(*) AS n FROM full_data' }) }
  ],
  impl: async (ctx, {}, { reportIds, root, cacheRoot, runOne, runSlice }) => {
    const registry = verifiedReportsRegistry.$runWithCtx(ctx)
    const wCtx = ctx.setVars({ reportsRegistry: registry, reportsRoot: root, reportsCacheRoot: cacheRoot, reportsCacheWrite: true, duckdbMatRun: `warm_${Date.now()}` })
    const reports = registry.filter(r => !reportIds.length || reportIds.includes(r.id))
    const combos = r => {
      const secs = (r.sections || []).map(s => s.id)
      return [{ scope: 'executiveSummary', sections: [] }, { scope: 'summary', sections: [] },
        { scope: 'executiveSummary', sections: secs }, { scope: 'none', sections: secs },
        ...secs.map(id => ({ scope: 'none', sections: [id] }))].filter(c => c.scope != 'none' || c.sections.length)
    }
    const out = []
    const step = async (tag, run) => {   // a transient failure (e.g. signed-url hiccup) costs one combo, never the whole warm
      const t0 = Date.now()
      const res = await run().catch(e => ({ error: e.stack || String(e) }))
      out.push({ ...tag, ms: Date.now() - t0, ...(res?.error ? { error: String(res.error).slice(0, 300) } : {}) })
    }
    for (const r of reports) {
      for (const c of combos(r))
        await step({ reportId: r.id, ...c }, () => runOne(wCtx.setVars({ warmReportId: r.id, warmScope: c.scope, warmSections: c.sections })))
      for (const s of (r.sections || []).filter(s => s.fullData?.viewSql))
        await step({ reportId: r.id, slice: s.id }, () => runSlice(wCtx.setVars({ warmReportId: r.id, warmSectionId: s.id })))
    }
    return out
  }
})
