import { dsls } from '@jb6/core'
import '@jb6/react'
import '@jb6/react/reveal.js'
import '@wonder/ui/zui/zui-dsl.js'
import './finance-benchmarks.js'

const {
  tgp: { Const, 'ctx-enricher': { loadReveal, Var } },
  common: { data: { compareBenchmarks } },
  bi: {
    'query-case': { 'finance2Bench.counterpartyQuarterFeeLeakage': counterpartyQuarterFeeLeakage },
    'query-environment': { wasm }
  },
  react: { ReactComp, 'react-comp': { comp, zoomingSvg } },
  zui: {
    'metadata-layout': { twoLayerMetadataLayout },
    'zoom-views': { zoomViews }, 'item-view': { itemView }
  }
} = dsls

const symbols = { transaction: '🧾', counterparty: '👤', account: '🏦', payment: '💳', transactionType: '⇄', symbol: '✦' }
const symbolNames = Object.fromEntries(Object.entries(symbols).map(([name, symbol]) => [symbol, name]))

Const('finance2InternalsMetadata', {
  graph: {
    children: [
      ['transactions', 'finance-mqy.parquet',
        [[symbols.transaction, 'transaction_id'], '↦', [symbols.counterparty, 'counterparty_id'], '·',
          [symbols.account, 'account_id'], '·', [symbols.payment, 'payment_method_id'], '·',
          [symbols.transactionType, 'transaction_type_id']],
        'fact', 9, 100000, 5, 1462874],
      ['counterparties', 'counterparties.parquet',
        [[symbols.counterparty, 'counterparty_id']], 'dim', 6, 200, 1, 1590],
      ['accounts', 'accounts.parquet',
        [[symbols.account, 'account_id']], 'dim', 4, 12, 1, 1053],
      ['paymentMethods', 'payment_methods.parquet',
        [[symbols.payment, 'payment_method_id']], 'dim', 5, 8, 1, 983],
      ['transactionTypes', 'transaction_types.parquet',
        [[symbols.transactionType, 'transaction_type_id']], 'dim', 4, 8, 1, 994],
      ['symbols', 'symbols.parquet', [[symbols.symbol, 'id']], 'lookup', 3, 27, 1, 1223]
    ],
    edges: [
      ['counterparty', 'transactions', 'counterparties', `${symbols.counterparty} counterparty_id N → 1`],
      ['account', 'transactions', 'accounts', `${symbols.account} account_id N → 1`],
      ['payment', 'transactions', 'paymentMethods', `${symbols.payment} payment_method_id N → 1`],
      ['transactionType', 'transactions', 'transactionTypes', `${symbols.transactionType} transaction_type_id N → 1`],
      ['accountSymbol', 'accounts', 'symbols', `${symbols.account} account_group → ${symbols.symbol}`],
      ['paymentSymbol', 'paymentMethods', 'symbols', `${symbols.payment} channel / method → ${symbols.symbol}`],
      ['transactionSymbol', 'transactionTypes', 'symbols', `${symbols.transactionType} group / type → ${symbols.symbol}`]
    ]
  },
  schemas: {
    transactions: {
      primitiveData: ['date', 'amount_usd', 'fee_usd', 'status'],
      groups: {
        'Keys & joins': 'transaction_id:BIGINT,counterparty_id:VARCHAR,account_id:VARCHAR,payment_method_id:VARCHAR,transaction_type_id:VARCHAR',
        Measures: 'amount_usd:DOUBLE,fee_usd:DOUBLE',
        'Time & status': 'date:DATE,status:VARCHAR'
      }
    },
    counterparties: {
      primitiveData: ['counterparty', 'segment', 'country', 'risk_tier', 'strategic'],
      groups: { Identity: 'counterparty_id:VARCHAR,counterparty:VARCHAR', Classification: 'segment:VARCHAR,country:VARCHAR,risk_tier:VARCHAR,strategic:BOOLEAN' }
    },
    accounts: {
      primitiveData: ['account_group', 'account', 'currency'],
      groups: { Identity: 'account_id:VARCHAR,account:VARCHAR', Classification: 'account_group:VARCHAR,currency:VARCHAR' }
    },
    paymentMethods: {
      primitiveData: ['payment_channel', 'payment_method', 'expected_fee_bps', 'settlement_days'],
      groups: {
        Identity: 'payment_method_id:VARCHAR,payment_method:VARCHAR',
        Contract: 'payment_channel:VARCHAR,expected_fee_bps:INTEGER,settlement_days:INTEGER'
      }
    },
    transactionTypes: {
      primitiveData: ['transaction_group', 'transaction_type', 'direction'],
      groups: { Identity: 'transaction_type_id:VARCHAR,transaction_type:VARCHAR', Classification: 'transaction_group:VARCHAR,direction:VARCHAR' }
    },
    symbols: {
      primitiveData: ['symbol', 'description'],
      groups: { Identity: 'id:VARCHAR', Presentation: 'symbol:VARCHAR,description:VARCHAR' }
    }
  }
})

Const('finance2LeakageZuiMetadata', {
  width: 1320, height: 700, laneWidth: 320, top: 66, columns: 3, itemWidth: 82, itemHeight: 58, columnGap: 12, rowGap: 82,
  levels: { identity: 1.25, comparison: 2.1, investigation: 3.2 },
  magnitude: { symbol: '$', maxSymbols: 5 },
  theme: {
    surface: '#0b1220', raised: '#111c2e', border: '#334155', text: '#e2e8f0', muted: '#94a3b8',
    leakage: '#fb7185', actual: '#f8fafc', expected: '#67e8f9'
  },
  segments: {
    Enterprise: {
      label: 'Enterprise · office tower', color: '#38bdf8', colorName: 'cyan',
      paths: ['M5 21V3h14v18', 'M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2', 'M3 21h18']
    },
    'Mid-market': {
      label: 'Mid-market · commercial building', color: '#a78bfa', colorName: 'purple',
      paths: ['M4 10h16v11H4z', 'M3 10l2-6h14l2 6', 'M8 14h3v7M14 14h3v3h-3z']
    },
    SMB: {
      label: 'SMB · storefront', color: '#4ade80', colorName: 'green',
      paths: ['M4 9v12h16V9', 'M3 9l2-5h14l2 5', 'M3 9c0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0', 'M8 14h8v7']
    }
  }
})

Const('finance2LeakageZoomAuditMetadata', {
  scales: [1, 1.2, 1.4, 1.6, 1.9, 2.2, 2.6, 3, 3.5, 4.2],
  item: {
    counterparty: 'Counterparty 102', segment: 'Enterprise', yr: 2025, qtr: 1, fee_leakage: 4661.84,
    fees: 5268.86, expected_fees: 607.02, settled_volume: 242806.5, fee_rate_bps: 217, txns: 125
  }
})

ReactComp('finance2InternalsApplet', {
  params: [{ id: 'layout', type: 'metadata-layout<zui>', dynamic: true, defaultValue: twoLayerMetadataLayout() }],
  impl: comp(
    Var('metadataLayout', '%$layout%'),
    Var('tableZoomViews', zoomViews(
      itemView(0, { hFunc: ctx => ctx.vars.renderTable(ctx, 'overview') }),
      itemView(400, { hFunc: ctx => ctx.vars.renderTable(ctx, 'groups') }),
      itemView(770, { hFunc: ctx => ctx.vars.renderTable(ctx, 'details') })
    )),
    {
      enrichCtx: loadReveal(),
      hFunc: (ctx, { reveal, react: { h, hh, useEffect, useRef, useState }, metadataLayout, tableZoomViews }) => () => {
        const [queryResult, setQueryResult] = useState()
        const metadata = ctx.exp('%$finance2InternalsMetadata%')
        const graph = {
          children: metadata.graph.children.map(([id, label, relation, kind, fields, rows, rowGroups, bytes]) => {
            const weight = Math.max(0, Math.log10(bytes) - 3)
            return {
              id, label, relation, kind, meta: { fields, rows, rowGroups, bytes },
              schema: metadata.schemas[id], layer: kind === 'fact' ? 'main' : 'lookup',
              width: 180 + weight * 18, height: 88 + weight * 8
            }
          }),
          edges: metadata.graph.edges.map(([id, source, target, text]) => ({
            id, sources: [source], targets: [target], text,
            labels: [{ id: `${id}-label`, text, width: Math.max(72, text.length * 6.5 + 20), height: 17 }]
          }))
        }
        const host = useRef(), erd = metadataLayout(ctx.setData(graph))
        useEffect(() => {
          const { disconnect } = reveal.mount(host.current, { width: '100%', height: '100%', margin: 0 })
          return disconnect
        }, [])
        useEffect(() => {
          let active = true
          compareBenchmarks.$runWithCtx(ctx, {
            queryCase: counterpartyQuarterFeeLeakage(), environments: [wasm()], warmRuns: 0
          }).then(([{ cold }]) => active && setQueryResult(cold))
          return () => { active = false }
        }, [])
        const colors = { fact: '#0369a1', dim: '#15803d', lookup: '#b45309' }
        const path = section => [section.startPoint, ...(section.bendPoints || []), section.endPoint]
          .map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`).join(' ')
        const Erd = () => hh(ctx, zoomingSvg, {
          width: erd.width, height: erd.height,
          zoomingVars: [
            { id: 'columns', calc: scale => Math.max(0, Math.min(1, (scale - 1) * 4)) },
            { id: 'joins', calc: scale => Math.max(0, Math.min(1, (scale - 1.1) * 4)) },
            { id: 'fontSize', calc: scale => `${11 / scale}px` }
          ],
          content: zctx => h('g', {},
            ...erd.edges.flatMap(edge => edge.sections.map(section => h('path', {
              d: path(section), fill: 'none', stroke: '#38bdf8', strokeWidth: 3
            })).concat(edge.labels.map(label => h('g', { opacity: 'var(--joins)' },
              h('rect', { x: label.x - 3, y: label.y, width: label.width + 6, height: 17, rx: 4, fill: '#071521' }),
              h('text', {
                x: label.x + label.width / 2, y: label.y + 12, fill: '#bae6fd',
                fontSize: 'var(--fontSize)', textAnchor: 'middle'
              }, edge.text))))),
            ...erd.children.map(node => {
              const groups = Object.entries(node.schema.groups).map(([name, fields]) => ({
                name, fields: fields.split(',').map(field => {
                  const [name, type] = field.split(':')
                  return { name, type }
                })
              }))
              const header = h('div', { style: {
                padding: '.55em .7em', borderLeft: `.35em solid ${colors[node.kind]}`,
                borderBottom: '1px solid #334155', background: '#111c2e', fontWeight: 700
              } }, node.label, h('span', { style: { float: 'right', color: '#64748b', fontSize: '.75em' } }, node.kind))
              const relation = h('div', { style: {
                padding: '.35em .7em', color: '#fbbf24', borderBottom: '1px solid #1e293b', textAlign: 'center'
              } }, ...node.relation.map((part, i) => {
                const [symbol, field] = Array.isArray(part) ? part : [part]
                const title = [symbolNames[symbol], field].filter(Boolean).join(' — ')
                return h('span', { key: i, title, 'aria-label': title }, `${symbol}${field ? ` ${field}` : ''} `)
              }))
              const columns = h('div', { style: {
                opacity: 'var(--columns)', padding: '0 .7em', color: '#94a3b8', overflow: 'hidden'
              } }, node.schema.primitiveData.join(' · '))
              const meta = h('div', { style: {
                display: 'flex', justifyContent: 'space-between', padding: '.35em .7em', color: '#94a3b8'
              } }, h('span', {}, `▥ ${node.meta.fields}`), h('span', {}, `◫ ${(node.meta.bytes / 1024).toFixed(1)} KB`),
              h('span', {}, `≡ ${node.meta.rows.toLocaleString()} · ${node.meta.rowGroups} RG`))
              const renderTable = (_, view) => h('div', {
                xmlns: 'http://www.w3.org/1999/xhtml', 'data-zui-card': node.id,
                style: {
                  height: '100%', overflow: 'hidden', border: '1px solid #334155', borderRadius: '.55em',
                  background: '#0b1220', color: '#cbd5e1', fontSize: 'var(--fontSize)'
                }
              }, header, relation, columns, meta, view === 'groups'
                ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '.4em', padding: '.6em' } },
                    ...groups.map(group => h('div', { style: { padding: '.4em', border: '1px solid #334155' } },
                      h('b', { style: { color: '#7dd3fc' } }, group.name), h('div', {}, `${group.fields.length} fields`))))
                : view === 'details' && h('div', { style: { padding: '.5em .7em' } },
                    ...groups.flatMap(group => [h('b', { style: { color: '#7dd3fc' } }, group.name),
                      ...group.fields.map(field => h('div', {}, `${field.name} · ${field.type}`))])))
              let view = tableZoomViews.activeView(node.width * zctx.vars.zoomState.scale)
              if (view === 2 && zctx.vars.zoomState.hotCard !== node.id) view = 1
              const card = tableZoomViews.views[view].hFunc(zctx.setData(node).setVars({ renderTable }))
              return h('g', { transform: `translate(${node.x},${node.y})` },
                h('foreignObject', { width: node.width, height: view === 2 ? node.height * 2.2 : node.height }, card))
            }))
        })
        const rows = queryResult?.rows || []
        const quarters = [1, 2, 3, 4].map(qtr => {
          const quarterRows = rows.filter(row => row.qtr === qtr)
          return { qtr, rows: quarterRows, total: quarterRows.reduce((sum, row) => sum + row.fee_leakage, 0) }
        })
        const zui = ctx.exp('%$finance2LeakageZuiMetadata%')
        const fade = (scale, start) => Math.max(0, Math.min(1, (scale - start) * 3))
        const magnitude = (value, domain) => {
          const base = Math.min(...domain), span = Math.log1p(Math.max(...domain) - base)
          return zui.magnitude.symbol.repeat(1 + Math.round(Math.log1p(value - base) / (span || 1) * (zui.magnitude.maxSymbols - 1)))
        }
        const compact = value => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
        const leakageDomain = rows.map(row => row.fee_leakage), quarterDomain = quarters.map(quarter => quarter.total)
        const zoomVars = scale => ({
          far: scale < 1.4 ? 1 : 0, identity: scale < 1.4 ? 0 : 1,
          comparison: fade(scale, zui.levels.comparison), investigation: fade(scale, zui.levels.investigation),
          fontSize: `${11 / scale}px`, dollarSize: `${Math.max(6, Math.min(8, scale * 8)) / scale}px`,
          cardPad: `${6 / scale}px`, cardGap: `${7 / scale}px`, radius: `${7 / scale}px`
        })
        const Item = ({ row }) => {
          const segment = zui.segments[row.segment]
          return h('div', {
            xmlns: 'http://www.w3.org/1999/xhtml', 'data-zui-card': `${row.counterparty}-${row.qtr}`, 'data-zui-audit-card': '',
            style: {
              position: 'relative', height: '100%', boxSizing: 'border-box', border: `1px solid ${segment.color}55`,
              borderRadius: 'var(--radius)', background: zui.theme.surface, color: zui.theme.text,
              fontSize: 'var(--fontSize)', whiteSpace: 'nowrap', overflow: 'hidden'
            }
          }, h('div', { style: { position: 'absolute', inset: 0, opacity: 'var(--far)' } },
            h('svg', {
              'data-zui-audit-part': 'far-icon', viewBox: '0 0 24 24', title: segment.label,
              style: { position: 'absolute', top: 4, left: '50%', width: 25, height: 25, color: segment.color, transform: 'translateX(-50%)' }
            }, ...segment.paths.map(d => h('path', {
              d, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round'
            }))),
            h('div', {
              'data-zui-audit-part': 'far-label', title: `${row.counterparty} · $${row.fee_leakage} leakage`,
              style: { position: 'absolute', top: 35, left: 0, right: 0, textAlign: 'center', fontWeight: 750 }
            }, `${row.counterparty.replace('Counterparty ', 'C')} · ${magnitude(row.fee_leakage, leakageDomain)}`)),
          h('div', { style: {
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 'var(--cardPad)',
            opacity: 'var(--identity)', background: `linear-gradient(145deg,${zui.theme.raised},${zui.theme.surface})`
          } }, h('div', { 'data-zui-audit-part': 'header', style: { display: 'flex', alignItems: 'center', gap: 'var(--cardGap)' } },
            h('svg', { viewBox: '0 0 24 24', style: { width: '1.7em', height: '1.7em', flex: '0 0 auto', color: segment.color } },
              ...segment.paths.map(d => h('path', {
                d, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round'
              }))),
            h('div', { style: { minWidth: 0 } },
              h('div', { style: { fontWeight: 800 } }, row.counterparty.replace('Counterparty ', 'Client ')),
              h('div', { style: { color: segment.color } }, `${row.segment} · ${segment.colorName}`))),
          h('div', { 'data-zui-audit-part': 'leakage', style: { marginTop: 'var(--cardGap)' } },
            h('div', { style: { color: zui.theme.muted } }, 'EXCESS FEES'),
            h('div', { style: { color: zui.theme.leakage, fontSize: '1.35em', fontWeight: 850 } }, `+$${row.fee_leakage.toLocaleString()}`)),
          h('div', { 'data-zui-audit-part': 'comparison', style: {
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cardGap)',
            maxHeight: 'calc(var(--comparison) * 8em)', marginTop: 'calc(var(--comparison) * var(--cardGap))',
            opacity: 'var(--comparison)', overflow: 'hidden'
          } }, ...[
            ['ACTUAL', `$${row.fees.toLocaleString()}`, zui.theme.actual],
            ['EXPECTED', `$${row.expected_fees.toLocaleString()}`, zui.theme.expected]
          ].map(([label, value, color]) => h('div', { style: {
            minWidth: 0, padding: 'var(--cardPad)', border: `1px solid ${zui.theme.border}`,
            borderRadius: 'var(--radius)', background: zui.theme.raised
          } }, h('div', { style: { color: zui.theme.muted } }, label), h('div', { style: { color, fontWeight: 750 } }, value)))),
          h('div', { 'data-zui-audit-part': 'investigation', style: {
            display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 'var(--cardGap)',
            maxHeight: 'calc(var(--investigation) * 8em)', marginTop: 'calc(var(--investigation) * var(--cardGap))',
            opacity: 'var(--investigation)', overflow: 'hidden'
          } }, ...[
            ['VOLUME', `$${compact(row.settled_volume)}`], ['RATE', `${row.fee_rate_bps} bps`], ['TXNS', row.txns]
          ].map(([label, value]) => h('div', { style: { minWidth: 0 } },
            h('div', { style: { color: zui.theme.muted } }, label),
            h('div', { style: { overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 750 } }, value))))))
        }
        const Results = () => hh(ctx, zoomingSvg, {
          width: zui.width, height: zui.height,
          zoomingVars: Object.keys(zoomVars(1)).map(id => ({ id, calc: scale => zoomVars(scale * .7)[id] })),
          content: zctx => h('g', {}, h('g', { transform: `translate(${zui.width * .15} ${zui.height * .15}) scale(.7)` },
            ...quarters.flatMap((quarter, lane) => {
            const x = lane * zui.laneWidth + 16
            return [
              h('text', { x, y: 18, fill: '#67e8f9', fontSize: 'var(--fontSize)', fontWeight: 750 }, `2025 · Q${quarter.qtr}`),
              h('text', { x, y: 36, fill: '#94a3b8', fontSize: 'var(--fontSize)' },
                `${quarter.rows.length} clients · ${magnitude(quarter.total, quarterDomain)} · ${compact(quarter.total)} leakage`),
              ...quarter.rows.map((row, rank) => {
                const segment = zui.segments[row.segment]
                const itemX = x + rank % zui.columns * (zui.itemWidth + zui.columnGap)
                const itemY = zui.top + Math.floor(rank / zui.columns) * zui.rowGap
                return h('g', { transform: `translate(${itemX},${itemY})` },
                  h('foreignObject', { width: zui.itemWidth, height: zui.itemHeight },
                    h('div', { xmlns: 'http://www.w3.org/1999/xhtml', 'data-zui-card': `${row.counterparty}-${row.qtr}`, style: {
                      position: 'relative', height: '100%', border: `1px solid ${segment.color}55`, borderRadius: 6,
                      background: zui.theme.surface, color: zui.theme.text, fontSize: 'var(--fontSize)', whiteSpace: 'nowrap', overflow: 'hidden'
                    } }, h('svg', {
                      viewBox: '0 0 24 24', title: segment.label,
                      style: { position: 'absolute', top: 4, left: '50%', width: 25, height: 25, color: segment.color,
                        opacity: 'calc(1 - var(--identity))', transform: 'translateX(-50%)' }
                    }, ...segment.paths.map(d => h('path', {
                      d, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round'
                    }))), h('div', {
                      title: `${row.counterparty} · $${row.fee_leakage} leakage`,
                      style: { position: 'absolute', top: 35, left: 0, right: 0, textAlign: 'center', fontWeight: 750,
                        opacity: 'calc(1 - var(--identity))' }
                    }, `${row.counterparty.replace('Counterparty ', '')} · `,
                    h('span', { style: { fontSize: 'var(--dollarSize)' } }, magnitude(row.fee_leakage, leakageDomain))),
                    h('div', { style: {
                      position: 'absolute', inset: 0, padding: '3px 4px', opacity: 'var(--identity)',
                      background: `linear-gradient(145deg,${zui.theme.raised},${zui.theme.surface})`
                    } }, h('div', { style: { display: 'flex', alignItems: 'center', gap: 3 } },
                      h('svg', { viewBox: '0 0 24 24', style: { width: '1.6em', height: '1.6em', color: segment.color } },
                        ...segment.paths.map(d => h('path', {
                          d, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round'
                        }))),
                      h('div', { style: { minWidth: 0 } },
                        h('div', { style: { fontWeight: 800 } }, row.counterparty.replace('Counterparty ', 'Client ')),
                        h('div', { style: { color: segment.color } }, `${row.segment} · ${segment.colorName}`))),
                    h('div', { style: { position: 'absolute', top: '2.9em', left: 4, color: zui.theme.muted } }, 'EXCESS FEES'),
                    h('div', { style: {
                      position: 'absolute', top: '3.8em', left: 4, color: zui.theme.leakage, fontSize: '1.35em', fontWeight: 850
                    } }, `+$${row.fee_leakage.toLocaleString()}`),
                    h('div', { style: {
                      position: 'absolute', top: '5.7em', left: 4, right: 4, display: 'grid', gridTemplateColumns: '1fr 1fr',
                      gap: 3, opacity: 'var(--comparison)'
                    } }, ...[
                      ['ACTUAL', `$${row.fees.toLocaleString()}`, zui.theme.actual],
                      ['EXPECTED', `$${row.expected_fees.toLocaleString()}`, zui.theme.expected]
                    ].map(([label, value, color]) => h('div', { style: {
                      padding: 3, border: `1px solid ${zui.theme.border}`, borderRadius: 3, background: zui.theme.raised
                    } }, h('div', { style: { color: zui.theme.muted } }, label), h('div', { style: { color, fontWeight: 750 } }, value)))),
                    h('div', { style: {
                      position: 'absolute', left: 4, right: 4, bottom: 3, display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr',
                      gap: 2, opacity: 'var(--investigation)'
                    } }, ...[
                      ['VOLUME', `$${compact(Number(row.settled_volume) / 100)}`],
                      ['RATE', `${row.fee_rate_bps} bps`], ['TXNS', row.txns]
                    ].map(([label, value]) => h('div', {},
                      h('div', { style: { color: zui.theme.muted } }, label),
                      h('div', { style: { fontWeight: 750 } }, value)))))))
                )
              })
            ]
          })), h('text', { x: (12 - zctx.vars.zoomState.pan.x) / zctx.vars.zoomState.scale,
            y: (18 - zctx.vars.zoomState.pan.y) / zctx.vars.zoomState.scale, fill: '#94a3b8',
            fontSize: 14 / zctx.vars.zoomState.scale },
          `${(zctx.vars.zoomState.scale * .7).toFixed(2)} · ${zctx.vars.zoomState.pan.x.toFixed(0)}, ${zctx.vars.zoomState.pan.y.toFixed(0)}`))
        })
        return h('div:reveal', { ref: host, style: { position: 'absolute', inset: 0 } }, h('div:slides', {},
          h('section', { 'data-background-color': '#071521', style: { height: '100%', top: 0 } },
            h('h2', { style: { margin: 0, fontSize: '.42em', lineHeight: 1 } }, 'Which client-quarter drove excess fees?'),
            h('div', { style: { marginTop: 7, fontSize: '.25em', color: '#94a3b8' } },
              queryResult ? `${queryResult.rows.length} groups · browser WASM · ${queryResult.queryMs.toFixed(0)} ms`
                : 'Running in browser WASM…'),
            h('div', { style: { position: 'absolute', inset: '34px 0 0' } }, h(Results))),
          h('section', { 'data-background-color': '#071521', style: { height: '100%', top: 0 } },
            h('h2', { style: { margin: 0, fontSize: '.42em', lineHeight: 1 } }, 'KPI query activates this subgraph'),
            h('div', { style: { marginTop: 7, fontSize: '.25em', color: '#94a3b8' } },
              'fee leakage + settled volume + failed rate'),
            h('div', { style: { position: 'absolute', inset: '34px 0 0' } }, h(Erd)))))
      }
    }
  )
})
