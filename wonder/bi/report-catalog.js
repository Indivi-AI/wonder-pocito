import { dsls } from '@jb6/core'
import './bi-dsl.js'

const {
  tgp: { TgpType }
} = dsls

// report = a verified question over a cube: cube-vocabulary SQL + widget/narrative builders.
// formalizes the finance-demo REPORTS registry: one entry runs identically as a dashboard insight,
// an Ask-AI suggestion and a "verified" chat answer. a report self-executes over the ctx cube (setupCube first).
const Report = TgpType('report', 'bi', {
  typescript: `{
  id: string
  question: string
  source: cubeQuery      // cubeQuery(sql) — metric refs expand via the cube, FROM may be omitted
  widget(ctx<data: rows>): VizSpec
  narrative?(ctx<data: rows, $depth>): string
  followUps?: string[]
}`
})

Report('report', {
  description: 'a verified, self-executing report: runs its cube-vocab SQL over the ctx cube (depth from %$depth%) → the askPayload shape { id, question, verified, sql, rows, text, widgets, followUps }',
  params: [
    {id: 'id', as: 'string', mandatory: true},
    {id: 'question', as: 'string', mandatory: true},
    {id: 'source', dynamic: true, mandatory: true, byName: true, description: 'cubeQuery(...) over the cube vocabulary; SQL uses only {%$x%} for vars — bare % passes through as literal SQL'},
    {id: 'widget', dynamic: true, mandatory: true, byName: true, description: 'rows (ctx.data) → viz spec {kind, title, data, drill, ...}'},
    {id: 'narrative', dynamic: true, byName: true, description: 'rows (ctx.data) → markdown answer; {%$depth%} ∈ short|medium|deep'},
    {id: 'icon', as: 'string', byName: true},
    {id: 'followUps', as: 'array', byName: true}
  ],
  impl: async (ctx, {}, { id, question, source, widget, narrative, followUps }) => {
    const rows = await source(ctx)
    const rctx = ctx.setVars({ depth: ctx.vars.depth || 'medium' }).setData(rows)
    return { id, question, verified: true, sql: source.profile.sql, rows,
      text: narrative?.(rctx) || '', widgets: [widget(rctx)],
      followUps: (followUps || []).map(q => ({ question: q, label: q })) }
  }
})
