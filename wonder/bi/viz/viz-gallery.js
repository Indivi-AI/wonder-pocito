import { dsls } from '@jb6/core'
import './viz-index.js'

const {
  react: {
    ReactComp,
    'react-comp': { comp },
  },
} = dsls

const cats = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const nv = (n, v) => ({ name: n, value: v })
const pts = (ys) => ys.map((y, i) => ({ x: i, y }))

// One representative spec per kind, each with a highlight, for visual QA.
const SPECS = [
  { kind: 'pie', title: 'Messages by sender', data: [nv('Alice', 120), nv('Bob', 80), nv('Carol', 50), nv('Dan', 30)], highlight: { name: 'Alice', note: 'most active' } },
  {
    kind: 'pie',
    donut: true,
    title: 'Revenue share (donut)',
    valueFormat: '$',
    data: [nv('Search', 5200), nv('Social', 3100), nv('Email', 1400)],
    highlight: { max: true, note: 'top channel' },
  },
  {
    kind: 'bar',
    title: 'Sessions by day',
    yLabel: 'sessions',
    data: [nv('Mon', 30), nv('Tue', 55), nv('Wed', 42), nv('Thu', 70), nv('Fri', 48)],
    highlight: { max: true, note: 'peak' },
  },
  {
    kind: 'hbar',
    title: 'Top destinations',
    valueFormat: 'compact',
    data: [nv('USA', 5200), nv('UK', 3100), nv('Germany', 2400), nv('France', 1800), nv('Spain', 1200)],
    highlight: { max: true, note: 'leader' },
  },
  {
    kind: 'groupedBar',
    title: 'Plan vs Actual',
    categories: cats,
    series: [
      { name: 'Plan', values: [40, 50, 45, 60, 55] },
      { name: 'Actual', values: [38, 55, 42, 70, 50] },
    ],
    highlight: { name: 'Actual', note: 'beat plan Thu' },
  },
  {
    kind: 'stackedBar',
    title: 'Traffic mix',
    categories: cats,
    series: [
      { name: 'Paid', values: [20, 25, 18, 30, 22] },
      { name: 'Organic', values: [10, 18, 22, 20, 26] },
    ],
    highlight: { name: 'Paid', note: 'paid heavy' },
  },
  {
    kind: 'line',
    title: 'Weekly trend',
    xType: 'category',
    series: [
      { name: 'Revenue', points: cats.map((c, i) => ({ x: c, y: [30, 45, 42, 68, 60][i] })) },
      { name: 'Cost', points: cats.map((c, i) => ({ x: c, y: [20, 22, 25, 30, 28][i] })) },
    ],
    highlight: { name: 'Revenue', note: 'fastest growth' },
  },
  {
    kind: 'area',
    title: 'Cumulative signups',
    stacked: true,
    series: [
      { name: 'Free', points: pts([10, 20, 35, 55, 80]) },
      { name: 'Pro', points: pts([5, 8, 14, 22, 33]) },
    ],
    highlight: { name: 'Pro', note: 'accelerating' },
  },
  {
    kind: 'scatter',
    title: 'Spend vs conversions',
    xLabel: 'spend',
    yLabel: 'conv',
    data: [
      { x: 10, y: 5, name: 'A' },
      { x: 25, y: 9, name: 'B' },
      { x: 40, y: 22, name: 'C' },
      { x: 15, y: 7, name: 'D' },
    ],
    highlight: { name: 'C', note: 'best ROI' },
  },
  {
    kind: 'bubble',
    title: 'Markets',
    xLabel: 'reach',
    yLabel: 'cvr',
    data: [
      { x: 10, y: 4, size: 30, name: 'A' },
      { x: 30, y: 8, size: 80, name: 'B' },
      { x: 50, y: 6, size: 50, name: 'C' },
    ],
    highlight: { name: 'B', note: 'largest' },
  },
  { kind: 'histogram', title: 'Session length (s)', values: [2, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 9, 12, 14, 4, 5, 5, 6, 7], bins: 6, highlight: { max: true, note: 'modal bin' } },
  {
    kind: 'boxplot',
    title: 'Latency by region',
    data: [
      { name: 'US', values: [20, 22, 25, 30, 40, 28, 26] },
      { name: 'EU', values: [30, 35, 40, 45, 60, 38] },
      { name: 'APAC', values: [50, 60, 70, 80, 120, 65] },
    ],
    highlight: { name: 'APAC', note: 'widest spread' },
  },
  {
    kind: 'heatmap',
    title: 'Activity by hour',
    xCategories: ['M', 'T', 'W', 'T', 'F'],
    yCategories: ['AM', 'PM', 'Eve'],
    data: [].concat(...['AM', 'PM', 'Eve'].map((y) => ['M', 'T', 'W', 'T', 'F'].map((x) => ({ x, y, value: Math.round(Math.random() * 100) })))),
    highlight: { max: true, note: 'peak load' },
  },
  {
    kind: 'radar',
    title: 'Product profile',
    indicators: [
      { name: 'Speed', max: 100 },
      { name: 'Cost', max: 100 },
      { name: 'UX', max: 100 },
      { name: 'Support', max: 100 },
      { name: 'Scale', max: 100 },
    ],
    series: [
      { name: 'Us', values: [80, 60, 90, 70, 75] },
      { name: 'Rival', values: [60, 80, 50, 65, 85] },
    ],
    highlight: { name: 'Us', note: 'UX edge' },
  },
  {
    kind: 'funnel',
    title: 'Conversion funnel',
    data: [nv('Sessions', 10000), nv('Clicks', 4200), nv('Leads', 1800), nv('Converters', 620)],
    highlight: { name: 'Converters', note: '6.2% overall' },
  },
  { kind: 'gauge', title: 'Goal attainment', value: 72, min: 0, max: 100, target: 80, highlight: { note: 'below target' } },
  {
    kind: 'treemap',
    title: 'Spend by category',
    valueFormat: '$',
    data: [nv('Ads', 5200), nv('Salaries', 8200), nv('Tools', 1400), nv('Travel', 900), nv('Office', 600)],
    highlight: { max: true, note: 'biggest cost' },
  },
  {
    kind: 'waterfall',
    title: 'Profit bridge',
    valueFormat: '$',
    data: [nv('Start', 1000), nv('Sales', 600), nv('Refunds', -150), nv('Costs', -300), { name: 'End', total: true }],
    highlight: { name: 'Costs', note: 'main drag' },
  },
  {
    kind: 'table',
    title: 'Campaign metrics',
    columns: [
      { key: 'name', label: 'Campaign' },
      { key: 'sessions', label: 'Sessions', format: 'int' },
      { key: 'revenue', label: 'Revenue', format: '$' },
    ],
    rows: [
      { name: 'Brand', sessions: 5200, revenue: 18400 },
      { name: 'Search', sessions: 3100, revenue: 9200 },
      { name: 'Social', sessions: 2400, revenue: 4100 },
    ],
    highlight: { max: true, col: 'revenue', note: 'top earner' },
  },
  {
    kind: 'kpi',
    title: 'This week',
    items: [
      { label: 'Revenue', value: 18400, format: '$', delta: 12 },
      { label: 'Sessions', value: 10700, format: 'compact', delta: -3 },
      { label: 'CVR', value: 6.2, unit: '%', delta: 0.4 },
    ],
    highlight: { label: 'Revenue', note: 'record' },
  },
  {
    kind: 'bullet',
    title: 'KPIs vs target',
    data: [
      { name: 'Revenue', value: 184, target: 200, ranges: [120, 170, 220] },
      { name: 'Signups', value: 96, target: 80, ranges: [50, 75, 110] },
    ],
    highlight: { name: 'Signups', note: 'beat target' },
  },
]

ReactComp('vizGallery', {
  impl: comp({
    hFunc:
      (ctx, { react: { h, hh } }) =>
      () =>
        h(
          'div',
          { style: { background: '#f8fafc', padding: '20px', minHeight: '100vh', fontFamily: 'ui-sans-serif, system-ui' } },
          h('h1', { style: { fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '16px' } }, 'Inline visualization widgets — gallery'),
          h(
            'div',
            { style: { display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' } },
            SPECS.map((spec, i) => h('div', { key: i, style: { flex: '1 1 320px', minWidth: 0, maxWidth: '620px' } }, hh(ctx, dsls.react['react-comp'].VizWidget, { spec }))),
          ),
        ),
  }),
})
