import { dsls, jb } from '@jb6/core'
import '@jb6/common/essentials.js'
import './bi-dsl.js'

const {
  tgp: { TgpType },
  common: { Data }
} = dsls
const Metric = TgpType('metric', 'bi')
const Hierarchy = TgpType('hierarchy', 'bi')
const Stat = TgpType('stat', 'bi')
const MetricValidation = TgpType('metric-validation', 'bi')

const biUtils = jb.biUtils ||= {}

// metric spec → duckdb aggregate SQL. sql exprs inline sibling metric names, recursing through byName = {metricName: spec}.
// Quoted literals/identifiers are kept verbatim, so another metric's name inside e.g. Status='pending' is never rewritten.
// seen = the expansion chain: a metric name reappearing is a true cross-metric cycle → clear error, not a stack overflow.
function metricToSql(m, byName, seen = []) {
  if (m.agg === 'count') return 'count(*)'
  if (m.agg === 'distinctCount') return `count(distinct ${m.field})`
  if (m.sql) {
    if (seen.includes(m.name)) throw new Error(`metric '${m.name}' has a circular sql reference: ${[...seen, m.name].join(' → ')}`)
    const chain = [...seen, m.name]
    return m.sql.split(/('(?:[^']|'')*'|"(?:[^"]|"")*")/g)   // odd segments = ''/"" quoted, kept verbatim
      .map((seg, i) => i % 2 ? seg : seg.replace(/\b[A-Za-z_]\w*\b/g, t => byName?.[t] && t !== m.name ? `(${metricToSql(byName[t], byName, chain)})` : t)).join('')
  }
  return `${m.agg}(${m.field})`   // sum | min | max
}
// the gold `time` column SQL: the time dimension's own hierarchy grain if it declares one, else the default day/hour/6h bucket over epoch-ms startTime.
function defaultTimeSql(col, width) {
  return width === 'hour' || width === '6h'
    ? `time_bucket(INTERVAL '${width === '6h' ? '6 hours' : '1 hour'}', to_timestamp(${col}/1000))` : `CAST(to_timestamp(${col}/1000) AS DATE)`
}
function timeColumnSql(cube, timeSlice) {
  const h = (cube.dimensions || []).find(d => d.name === 'time')?.hierarchy
  return h ? h.groupSql('startTime', timeSlice) : defaultTimeSql('startTime', timeSlice || 'day')
}
// the whole cube rendered as LLM vocabulary: dimensions + metric fragments + epistemic limits — replaces per-app hand-copied schema doclets
function cubeVocab(c) {
  const byName = Object.fromEntries((c.metrics || []).map(m => [m.name, m]))
  return [
    'DIMENSIONS (GROUP BY / filter):',
    ...(c.dimensions || []).map(d => `- ${d.name}${d.values?.length ? ` ∈ ${d.values.join('|')}` : ''}${d.guidance ? `   -- ${d.guidance}` : ''}`),
    'METRICS — canonical aggregate fragments, use VERBATIM:',
    ...(c.metrics || []).map(m => `- ${m.name} = ${metricToSql(m, byName)}${m.description ? `   -- ${m.description}` : ''}`),
    ...(c.limits?.length ? ['LIMITS — questions this data CANNOT answer; say so instead of guessing:', ...c.limits.map(l => `- ${l}`)] : [])
  ].join('\n')
}
Object.assign(biUtils, { metricToSql, defaultTimeSql, timeColumnSql, cubeVocab })

// metric = aggregation over FIELDS, never stored (gold-grain). field = stored per-object column (cubeReducer output).
// returns a gold-aggregation spec; gold compiles {<agg>(field) / count(*) / Σnum÷Σden·scale}.
Metric('metric', {
  description: "aggregate a field across rows via expr 'agg(field)', e.g. sum(revenue), distinctCount(session_id). 'count' needs no field.",
  macroByValue: true,
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'expr', as: 'string', mandatory: true, description: "agg(field) e.g. sum(revenue), distinctCount(session_id), or just count"},
    {id: 'unit', as: 'string', description: "display unit of the aggregate — '$', '%', 'int', '₪', … — drives value formatting in self-serve widgets"},
    {id: 'hierarchy', type: 'hierarchy<bi>', description: 'default histogram bucketing of this measure (the brush reads its buckets to bucket field values)'},
    {id: 'expectedStat', type: 'stat<bi>', description: 'declared value shape for summaries and drift checks'},
    {id: 'validations', type: 'metric-validation<bi>[]', description: 'value-level checks on the aggregate, e.g. positive(), inRange(0,1), withinSigma(2)'},
    {id: 'description', as: 'string', description: 'business meaning of the measure — what it counts/sums and why it matters'}
  ],
  impl: (_, {}, { name, expr, unit, hierarchy, expectedStat, validations, description }) => {
    const m = expr.match(/^(\w+)\(([^)]*)\)$/)
    const shape = m ? { name, agg: m[1], field: m[2] } : /^\w+$/.test(expr) ? { name, agg: expr } : { name, sql: expr }   // agg(field) | bare 'count' | raw expr (incl. sibling-metric formula)
    return { ...shape, unit, hierarchy, expectedStat, validations, description }
  }
})
Metric('ratio', {
  description: "ratio metric: Σnumerator / Σdenominator · scale (correct cross-group ratio). ratio(name, 'num/den', {scale: 100}).",
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'ratio', as: 'string', mandatory: true, description: 'numerator/denominator, e.g. bids/sessions'},
    {id: 'scale', as: 'number', defaultValue: 100, byName: true},
    {id: 'unit', as: 'string', defaultValue: '%', byName: true, description: "display unit — scale 100 makes it a percent, hence the default"},
    {id: 'description', as: 'string', byName: true, description: 'business meaning of the ratio — spell out acronyms and any deviation from the textbook metric'}
  ],
  impl: (_, {}, { name, ratio, scale, unit, description }) => {
    const [num, den] = ratio.split('/').map(s => s.trim())
    return { name, sql: `round(${scale}.0 * (${num}) / nullif((${den}), 0), 2)`, unit, description }
  }
})
Metric('share', {
  description: "share-of-total: a sibling metric ÷ its window-sum over ALL groups in the query, as %. share('money_in_share','money_in') → concentration analysis.",
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'of', as: 'string', mandatory: true, description: 'sibling metric name this is a share of'},
    {id: 'description', as: 'string', byName: true}
  ],
  impl: (_, {}, { name, of, description }) =>
    ({ name, sql: `round(100.0 * (${of}) / nullif(sum(${of}) over (), 0), 1)`, unit: '%', description })
})

// hierarchy = the levels a dimension/measure groups at. shared RT { levels, groupSql(col, level) → GROUP-BY expr,
// buckets?(values) → [{lo,hi}] for the brush histogram, rollUp?(level) → coarser levels above it }.
// timeBin (day→hour→6h grains) & rangeBin (numeric width) are single-column hierarchies; geoHierarchy is a multi-column roll-up.
Hierarchy('timeBin', {
  description: 'time grains day/hour/6h over an epoch-ms column. the gold GROUP-BY grain + the time-series brush bucketing.',
  params: [{id: 'width', as: 'string', defaultValue: 'day', options: 'day,hour,6h'}],
  impl: (_, {}, { width }) => ({
    levels: ['day', 'hour', '6h'],
    groupSql: (col, level = width) => level === 'day' ? `CAST(to_timestamp(${col}/1000) AS DATE)`
      : `time_bucket(INTERVAL '${level === '6h' ? '6 hours' : '1 hour'}', to_timestamp(${col}/1000))`,
    buckets: () => []
  })
})
Hierarchy('rangeBin', {
  description: 'equal-width numeric grain of a measure; the brush histogram reads buckets(values) for its bar boundaries.',
  params: [{id: 'width', as: 'number', mandatory: true}],
  impl: (_, {}, { width }) => ({
    levels: [String(width)],
    groupSql: col => `floor(${col} / ${width}) * ${width}`,
    buckets: values => { const lo = Math.floor(Math.min(...values) / width) * width, hi = Math.max(...values)
      return Array.from({ length: Math.max(1, Math.ceil((hi - lo + 1) / width)) }, (_, i) => ({ lo: lo + i * width, hi: lo + (i + 1) * width })) }
  })
})
const geoHierarchy = Hierarchy('geoHierarchy', {
  description: 'a geo roll-up: ordered level columns fine→coarse (city,state,country). one dimension groups at any level and knows its roll-up.',
  params: [
    {id: 'levels', as: 'array', mandatory: true, description: 'level column names fine→coarse, e.g. city,state,country'},
    {id: 'members', as: 'array', description: 'known leaf rows {city,state,country,...} — the membership that lets resolve(leaf) roll a value up its levels'}
  ],
  impl: (_, {}, { levels, members }) => ({
    levels, members: members || [],
    groupSql: (_col, level = levels[0]) => level,
    rollUp: level => levels.slice(levels.indexOf(level) + 1),
    drillDown: level => levels.slice(0, levels.indexOf(level)).reverse(),
    resolve: leaf => (members || []).find(m => m[levels[0]] === leaf) || null   // city → its full {city,state,country}
  })
})

// USPartialCities — a concrete geoHierarchy profile: 10 US cities, each rolling up city→state→country. the demo membership.
Hierarchy('USPartialCities', {
  description: '10-city USA geo hierarchy (demo). city→state→country membership so a city rolls up to its state and to US.',
  impl: geoHierarchy(['city', 'state', 'country'], [
    { city: 'New York', state: 'NY', country: 'US' }, { city: 'Los Angeles', state: 'CA', country: 'US' },
    { city: 'Chicago', state: 'IL', country: 'US' }, { city: 'Houston', state: 'TX', country: 'US' },
    { city: 'Phoenix', state: 'AZ', country: 'US' }, { city: 'San Francisco', state: 'CA', country: 'US' },
    { city: 'Seattle', state: 'WA', country: 'US' }, { city: 'Miami', state: 'FL', country: 'US' },
    { city: 'Boston', state: 'MA', country: 'US' }, { city: 'Denver', state: 'CO', country: 'US' }
  ])
})

// stat = a dimension or metric's declared shape prior. statFitMetrics turns its estimators into cube metrics.
const fittedStat = (kind, aggs, fit) => ({ kind, aggs, fit })
Stat('normalStat', {
  description: 'unimodal & symmetric. constants μ,σ fitted via avg,stddev; skewness reports tail asymmetry (≈0 when truly normal).',
  impl: () => fittedStat('normal', { mu: c => `avg(${c})`, sigma: c => `stddev(${c})`, skew: c => `skewness(${c})` },
    r => ({ mu: r.mu, sigma: r.sigma, skew: r.skew }))
})
Stat('skewedStat', {
  description: 'long-tailed. constants median (honest center) + skewness (sign/strength of the tail) fitted in one pass.',
  params: [{id: 'direction', as: 'string', options: 'left,right', defaultValue: 'right'}],
  impl: (_, {}, { direction }) => fittedStat(`skewed-${direction}`,
    { median: c => `median(${c})`, skew: c => `skewness(${c})` }, r => ({ median: r.median, skew: r.skew }))
})
Stat('uniformStat', {
  description: 'flat over [a,b]. constants a,b fitted via min,max.',
  impl: () => fittedStat('uniform', { a: c => `min(${c})`, b: c => `max(${c})` }, r => ({ a: r.a, b: r.b }))
})
Stat('categoricalStat', {
  description: 'discrete labels. the value→count map (histogram) IS the fit; fit() normalizes it to probabilities pᵢ.',
  impl: () => fittedStat('categorical', { hist: c => `histogram(${c})` },
    r => { const t = Object.values(r.hist).reduce((a, b) => a + b, 0)
      return { probs: Object.fromEntries(Object.entries(r.hist).map(([k, v]) => [k, v / t])) } })
})

Data('statFitMetrics', {
  description: "expand a stat's fit estimators into cube metrics over a field",
  params: [
    {id: 'stat', type: 'stat<bi>', mandatory: true},
    {id: 'field', as: 'string', mandatory: true}
  ],
  impl: (_, {}, { stat, field }) =>
    Object.entries(stat.aggs).map(([k, f]) => ({ name: `${field}_${k}`, agg: f(field).match(/^(\w+)/)[1], field }))
})

// metric-validation = a named check over a metric's aggregate VALUE, expressed as a SQL predicate so it rides the SAME
// cubeQuery (no rows leave duckdb). sql(v, fit) → boolean SQL: v = the value column, fit = {const→column} of the metric's
// fitted stat constants (window-function columns metricDrift exposes in its CTEs), so a check asserts the shape.
MetricValidation('positive', {
  description: 'the metric value must be ≥ 0 (counts, revenue, spend).',
  impl: () => ({ name: 'positive', sql: v => `${v} >= 0` })
})
MetricValidation('inRange', {
  description: 'the metric value must lie within [min,max], e.g. inRange(0,1) for a rate/ctr.',
  params: [{id: 'min', as: 'number', mandatory: true}, {id: 'max', as: 'number', mandatory: true}],
  impl: (_, {}, { min, max }) => ({ name: `inRange(${min},${max})`, sql: v => `${v} between ${min} and ${max}` })
})
MetricValidation('aboveBaseline', {
  description: 'drift floor: the value must stay ≥ frac · its fitted baseline (the fresh-window center). first breach = the drift day.',
  params: [{id: 'frac', as: 'number', defaultValue: 0.5}],
  impl: (_, {}, { frac }) => ({ name: `aboveBaseline(${frac})`, sql: (v, fit) => `${v} >= ${frac} * ${fit.baseline}` })
})
MetricValidation('withinSigma', {
  description: 'inner-stat check: fit μ,σ and assert the value is within k·σ of μ.',
  params: [
    {id: 'k', as: 'number', defaultValue: 2},
    {id: 'stat', type: 'stat<bi>', defaultValue: { $: 'stat<bi>normalStat' }}
  ],
  impl: (_, {}, { k }) => ({ name: `withinSigma(${k})`, sql: (v, fit) => `abs(${v} - ${fit.mu}) <= ${k} * ${fit.sigma}` })
})

// metricDrift: pure windowing over a (key, day, val) SERIES relation — NO cube, NO metric expansion. the upstream stage
// (a tempView/cubeQuery) already aggregated the cube metric into the series; metricDrift only FITS the fresh-window baseline
// (a window-fn const per key) then applies validation.sql(val, {baseline}) → the first day it breaches = drift_day.
Data('metricDrift', {
  description: 'fit a fresh-window baseline per key over a (key,day,val) series, then find the first day val breaches the validation floor (the drift day).',
  params: [
    { id: 'series', as: 'string', mandatory: true, description: 'a FROM-able relation with columns key,day,val — typically %$name% set by a tempView' },
    { id: 'key', as: 'string', defaultValue: 'sub1', description: 'the drift partition column' },
    { id: 'validation', type: 'metric-validation<bi>', defaultValue: { $: 'metric-validation<bi>aboveBaseline' }, description: 'the floor predicate; its breach defines the drift day' },
    { id: 'freshDays', as: 'number', defaultValue: 3, description: 'how many first active days define the healthy baseline' }
  ],
  impl: async (ctx, {}, { series, key, validation, freshDays }) => {
    const log = ctx?.vars?.biLogger
    const sql = `
with ranked as (select ${key}, day, val, row_number() over (partition by ${key} order by day) daynum from ${series}),
fit as (select ${key}, max(case when daynum<=${freshDays} then val end) over (partition by ${key}) baseline from ranked),
flagged as (select r.${key}, r.day, r.val, round(f.baseline,2) baseline,
  case when not (${validation.sql('r.val', { baseline: 'f.baseline' })}) then 1 else 0 end below
  from ranked r join fit f using (${key}))
select ${key}, min(case when below=1 then day end) drift_day, max(baseline) baseline
from flagged group by ${key} order by drift_day nulls last`
    const rows = await biUtils.runDuckdb(sql, ctx)
    log?.info?.({ t: 'metricDrift', key, freshDays, validation: validation.name, drifted: rows.filter(r => r.drift_day).length, rows }, {}, { ctx })
    return rows
  }
})
