# Visualization rewrite

## Goal

Replace the current visualization framework with direct, declarative TGP React components. Keep files cohesive and close to 300 lines. Reuse only proven rendering logic from `wonder/ui/viz/old-junk`; do not reuse its factories, wrappers, global profiles, or registry plumbing.

## Production structure

| File | Direct TGP React components |
|---|---|
| `viz-categorical.js` | `viz.Pie`, `viz.Funnel`, `viz.Treemap` |
| `viz-bars.js` | `viz.Bar`, `viz.HBar`, `viz.GroupedBar`, `viz.StackedBar` |
| `viz-trends.js` | `viz.Line`, `viz.Area` |
| `viz-correlation.js` | `viz.Scatter`, `viz.Bubble` |
| `viz-distribution.js` | `viz.Histogram`, `viz.Boxplot` |
| `viz-matrix.js` | `viz.Heatmap`, `viz.Radar` |
| `viz-indicators.js` | `viz.Kpi`, `viz.Gauge`, `viz.Bullet` |
| `viz-table.js` | `viz.Table` |
| `viz-waterfall.js` | `viz.Waterfall` |
| `viz-host.js` | `viz.Viz`, drill-panel composition and kind dispatch |

Supporting files:

- `viz-types.js`: only script-useful inner types such as `viz-highlight<viz>`, `viz-series<viz>`, `viz-column<viz>` and `viz-drill<viz>`.
- `tests/viz-tests.js`: separate registered TGP tests with profiles inline in their `Test` components.
- `viz-index.js`: imports only.

## Component shape

Every visualization is one explicit public component:

```js
ReactComp('viz.Bar', {
  params: [
    {id: 'title', as: 'string'},
    {id: 'items', as: 'array'},
    {id: 'highlight', type: 'viz-highlight<viz>'}
  ],
  impl: comp({
    enrichCtx: /* normalize runtime data */,
    hFunc: /* render the chart */
  })
})
```

## Delete from the new implementation

- `viz-core.js`
- `viz-dsl.js`
- `viz-public.js`
- `DefComponents`
- `jb.vizUtils.vizComp`
- Internal `barWidget`, `pieWidget`, and similar wrapper components
- Any non-TGP production definition; ask before introducing one
- Unregistered global profiles such as `const sample = [...]`
- Arbitrary waits where a semantic UI condition can be awaited

## Verification

1. Import every test through `tests/all-tests.js`.
2. Run every new TGP component through `formatAndValidateTgpComp`.
3. Run each test with the relevant logger and inspect its logs, not only its boolean result.
4. Run browser-dependent tests with `playwrightHarvest` after the fast Node tests.
5. Keep every edited line at most 180 characters.
