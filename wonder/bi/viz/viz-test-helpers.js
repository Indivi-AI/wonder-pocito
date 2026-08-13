import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import './viz-core.js'

const {
  tgp: { TgpType },
} = dsls

// Drive an ECharts series click through zrender — the only path that yields a named
// click in the layout-less jsdom harness (no pixel hit-test). Data elements are the
// non-silent shapes bound (directly or via a parent group) to a dataIndex/seriesIndex;
// shapeType narrows by zrender type ('rect', 'sector', 'ec-polyline', ...) and index
// picks among them. The click lands on the first candidate point zrender's own
// findHover resolves to the element (geometry centers can miss curves/donuts).
const candidatePoints = (el) => {
  el.getComputedTransform?.() // refresh el.transform from the ancestor chain (symbols hold position on parent groups)
  const toGlobal = ([x, y]) => (el.transformCoordToGlobal ? el.transformCoordToGlobal(x, y) : [x, y])
  const s = el.shape || {}
  const local = () => {
    if (s.cx != null && s.r != null) {
      const angle = ((s.startAngle ?? 0) + (s.endAngle ?? 0)) / 2,
        radius = ((s.r0 ?? 0) + s.r) / 2
      return [[s.cx + Math.cos(angle) * radius, s.cy + Math.sin(angle) * radius]]
    }
    if (s.x != null && s.width != null) return [[s.x + s.width / 2, s.y + s.height / 2]]
    if (s.points?.length) {
      // point list: nested pairs or a flat typed array — center then every vertex
      const pts = s.points,
        nested = Array.isArray(pts[0]),
        n = nested ? pts.length : pts.length / 2
      const pair = (i) => (nested ? pts[i] : [pts[2 * i], pts[2 * i + 1]])
      const b = el.getBoundingRect()
      return [[b.x + b.width / 2, b.y + b.height / 2], ...Array.from({ length: n }, (_, i) => pair(i))]
    }
    const b = el.getBoundingRect()
    return [[b.x + b.width / 2, b.y + b.height / 2]]
  }
  return local().map(toGlobal)
}

TgpType('ui-action', 'test')('clickVizShape', {
  params: [
    { id: 'index', as: 'number', defaultValue: 0 },
    { id: 'shapeType', as: 'string' },
  ],
  impl: ({}, {}, { index, shapeType }) => ({
    async exec(ctx) {
      const echarts = jb.reactRepository.importCache[jb.vizUtils.ECHARTS_IMPORT]
      const chart = echarts.getInstanceByDom(ctx.vars.win.document.querySelector('.viz-chart') || ctx.vars.win.document.querySelector('.viz-widget'))
      const boundToData = (el) => {
        for (let e = el; e; e = e.__hostTarget || e.parent)
          if (Object.keys(e).some((k) => k.startsWith('__ec_inner') && (e[k]?.dataIndex != null || e[k]?.seriesIndex != null))) return true
      }
      const all = chart.getZr().storage.getDisplayList()
      const els = all.filter((el) => !el.silent && !['tspan', 'text'].includes(el.type) && boundToData(el) && (!shapeType || el.type === shapeType))
      if (!els.length)
        throw new Error(`clickVizShape: no data element of type '${shapeType || 'any'}'; displayList: ${all.map((el) => el.type + (el.silent ? ':silent' : '')).join(' ')}`)
      const hoverAt = (pt) => chart.getZr().handler.findHover(pt[0], pt[1])?.target
      const [cx, cy] =
        els
          .slice(index)
          .flatMap(candidatePoints)
          .find((pt) => {
            const t = hoverAt(pt)
            return t && boundToData(t)
          }) || []
      if (cx == null)
        throw new Error(
          `clickVizShape: no candidate point hovers a data element ('${shapeType || 'any'}', from index ${index}); ` +
            els
              .slice(index)
              .map(
                (el) =>
                  `${el.type}[shape:${Object.keys(el.shape || {}).join(',')};x:${el.x},px:${el.parent?.x},rect:${JSON.stringify(el.getBoundingRect())}]: ${candidatePoints(el)
                    .map((pt) => `${Math.round(pt[0])},${Math.round(pt[1])}→${hoverAt(pt)?.type || 'none'}`)
                    .join(' ')}`,
              )
              .join(' | '),
        )
      ;['mousedown', 'mouseup', 'click'].forEach((t) => chart.getZr().handler.dispatch(t, { zrX: cx, zrY: cy }))
    },
  }),
})

// Drill test harness: hosts VizWidget with a recording runSql (echoes the filled SQL
// into the DOM as 'drillSql:...' and returns the given rows), so a test can assert
// placeholder filling + SQL quoting + the rendered side plot in one pass.
export const drillHost =
  (spec, rows) =>
  (ctx, { react: { h, hh, useState } }) =>
  () => {
    const [sql, setSql] = useState('')
    return h('div', {}, h('div', {}, 'drillSql:' + sql), hh(ctx, dsls.react['react-comp'].VizWidget, { spec, runSql: async (s) => (setSql(s), rows) }))
  }
