import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/common'
import '@jb6/react'
import '@wonder/ai/report-step.js'
import '@wonder/ui/viz/viz-index.js'
import './Reports/index.js'
import './Agents/report-edit-agent.js'
import '@wonder/db/db-drivers.js'

const { wfetch2 } = jb.wonderUtils
import { applyReportPatch } from './Agents/report-edit-agent.js'
import { comaxFontCss, comaxLogo } from './Comps/comax-brand.js'

const {
  react: {
    ReactComp,
    'react-comp': { comp },
  },
  common: {
    data: { duckDbSql, publishReportStudioDraft, runReport, verifiedReportsRegistry },
  },
} = dsls
const DEFAULT_REPORT = 'promotions',
  ROOM = 'signedRoom://comaxDemo/usersRW',
  DEPTHS = ['executiveSummary', 'summary', 'inDepth']
const root = () =>
  globalThis.process?.versions?.node
    ? new URL('../../files/rooms/comaxDemo/usersRO/parquet/OEM_BI_4466', import.meta.url).pathname
    : 'files/rooms/comaxDemo/usersRO/parquet/OEM_BI_4466'
const roomFile = (roomWUrl, file) => `${String(roomWUrl || ROOM).replace(/\/$/, '')}/report-studio/${file}`
const loadJson = async (url, ctx) => {
  const r = await wfetch2(url, { method: 'GET' }, ctx.setVars({ db: 'bucket',
    ...(!coreUtils.isNode && { dbHost: 'browser' }) })).catch(() => null)
  return r?.ok ? r.json() : null
}
const QUESTIONS_URL = '/solutions/comax/Doclets/50-retail-manager-questions.md'
const sqlOf = (q) => (q.kind == 'fullData' ? q.slot.viewSql : q.slot.sql)
const sectionsOf = (r) => (r.sections || []).map((s) => s.id)
const runSelectedReport = (ctx, report, reportsRoot) =>
  runReport.$runWithCtx(ctx.setVars({ reportsRegistry: [report], reportsRoot }), {
    reportId: report.id,
    registry: [report],
    root: reportsRoot,
    scope: 'executiveSummary',
    sections: sectionsOf(report),
    sectionDepth: 'summary',
  })
const queriesOf = (r) =>
  [
    ...['executiveSummary', 'summary'].map((d) => ({ key: `report.${d}`, label: `Report / ${d}`, sectionTitle: r.title, slot: r[d] })),
    ...(r.sections || []).flatMap((s, i) => [
      ...DEPTHS.map((d) => ({ key: `${s.id}.${d}`, label: d, sectionId: s.id, sectionIdx: i, sectionTitle: s.title, slot: s[d] })),
      { key: `${s.id}.fullData`, label: 'fullData', sectionId: s.id, sectionIdx: i, sectionTitle: s.title, kind: 'fullData', slot: s.fullData },
    ]),
  ].filter((q) => q.slot && sqlOf(q))
const prettySql = (s) =>
  String(s || '')
    .trim()
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+\b(WITH|SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|UNION ALL|UNION|LEFT JOIN|RIGHT JOIN|INNER JOIN|CROSS JOIN|JOIN|ON)\b/gi, '\n$1')
    .replace(/,\s+(?=[A-Za-z_"(])/g, ',\n  ')
    .replace(/\n{2,}/g, '\n')
    .trim()
const patchText = (p) => (p?.ops?.length ? JSON.stringify({ changes: p.changes, ops: p.ops }, null, 2) : 'No draft patch')
const sectionOf = (r, id) => (r.sections || []).find((s) => s.id == id)
const previewSql = (r, q, reportsRoot) => {
  const sql = String(sqlOf(q) || '')
      .replaceAll('{{ROOT}}', reportsRoot)
      .trim()
      .replace(/;+\s*$/, ''),
    view = q.kind != 'fullData' && q.sectionId && /\bfull_data\b/i.test(sql) && sectionOf(r, q.sectionId)?.fullData?.viewSql?.replaceAll('{{ROOT}}', reportsRoot)
  return `SELECT * FROM (${view ? `WITH full_data AS (${view}) ${sql.replace(/^\s*WITH\s/i, ', ')}` : sql}) LIMIT 50`
}
const colsOf = (rows) => [...new Set(coreUtils.asArray(rows).flatMap((r) => Object.keys(r || {})))].slice(0, 12)
const cell = (v) => (v == null ? '' : typeof v == 'object' ? JSON.stringify(v) : String(v))
const parseQuestionsMd = (md) =>
  md.split('\n').reduce(
    (a, line) => {
      const cat = line.match(/^##\s+(.+)/),
        q = line.match(/^(\d+)\.\s+\*\*\[([^\]]+)]\*\*\s+(.+)/)
      return cat ? { ...a, cat: cat[1] } : q ? { ...a, qs: [...a.qs, { id: `Q${q[1]}`, n: +q[1], tag: q[2], text: q[3], category: a.cat }] } : a
    },
    { cat: '', qs: [] },
  ).qs
const forcedReport = {
  Q4: 'branch-performance',
  Q24: 'promotions',
  Q25: 'promotions',
  Q26: 'promotions',
  Q27: 'pricing-cost-drift',
  Q28: 'pricing-cost-drift',
  Q30: 'customers-loyalty',
  Q31: 'suppliers',
  Q39: 'suppliers',
}
const newReports = [
  { id: 'promo-cannibalization', title: 'קניבליזציית מבצעים', qs: ['Q29'], why: 'השפעת מבצע על פריטים דומים במחיר מלא.' },
  { id: 'supplier-commercials', title: 'תנאי ספק והחזרים', qs: ['Q37', 'Q38'], why: 'דורש תנאי תשלום, הסכמי בונוס וזיכויי ספק.' },
  {
    id: 'space-investment',
    title: 'יעילות שטח והשקעות סניף',
    qs: ['Q45', 'Q50'],
    why: 'דורש מ"ר, שכירות, CAPEX והיסטוריית שיפוצים.',
  },
  {
    id: 'workforce-productivity',
    title: 'תפוקת עובדים ועלות איוש',
    qs: ['Q49'],
    why: 'דורש משמרות ועלויות שכר מול מכירות עובדים.',
  },
]
const words = (s) =>
  new Set(
    String(s || '')
      .toLowerCase()
      .match(/[\p{L}\p{N}_-]{3,}/gu) || [],
  )
const clusterQuestions = (reports, qs) => {
  const gap = new Map(newReports.flatMap((r) => r.qs.map((q) => [q, r.id]))),
    textOf = (r) => [r.title, r.description, r.whenToUse, ...(r.routePhrases || [])].join(' '),
    max = (q, r) =>
      (r.id == forcedReport[q.id] ? 50 : 0) +
      ((r.questionsCovered || []).includes(q.id) ? 25 : 0) +
      [...words(`${q.tag} ${q.text} ${q.category}`)].filter((w) => words(textOf(r)).has(w)).length
  const matched = qs
    .filter((q) => !gap.has(q.id))
    .map((q) => ({ ...q, report: reports.map((r) => ({ r, score: max(q, r) })).sort((a, b) => b.score - a.score)[0]?.r }))
    .filter((q) => q.report)
  return {
    matched,
    unmatched: qs.filter((q) => gap.has(q.id)),
    byReport: reports.map((r) => ({ report: r, questions: matched.filter((q) => q.report.id == r.id) })),
    suggestions: newReports.map((r) => ({ ...r, questions: qs.filter((q) => r.qs.includes(q.id)) })),
  }
}

ReactComp('comaxReportsStudioDemo', {
  impl: comp({
    hFunc:
      (ctx, { initialPatch, initialReport, initialRun, reportsRoot, roomWUrl, react: { h, hh, useEffect, useMemo, useState } }) =>
      () => {
        const reports = ctx.vars.initialReports || [initialReport]
        const [report, setReport] = useState(initialReport),
          [patch, setPatch] = useState(initialPatch),
          [res, setRes] = useState(initialRun)
        const [tab, setTab] = useState('ui'),
          [key, setKey] = useState('coverage.summary'),
          [draft, setDraft] = useState(''),
          [busy, setBusy] = useState(false),
          [status, setStatus] = useState(''),
          [trace, setTrace] = useState([]),
          [last, setLast] = useState(null)
        const [sqlData, setSqlData] = useState({}),
          [questionRows, setQuestionRows] = useState([])
        const [msgs, setMsgs] = useState([{ role: 'assistant', text: patch?.ops?.length ? 'טענתי טיוטת עריכה קיימת.' : 'מוכן לעריכת הדוח.' }])
        const qs = useMemo(() => queriesOf(report), [report]),
          groups = useMemo(
            () => [
              { id: 'report', title: report.title, qs: qs.filter((q) => !q.sectionId) },
              ...(report.sections || []).map((s) => ({ id: s.id, title: s.title, qs: qs.filter((q) => q.sectionId == s.id) })),
            ],
            [report, qs],
          ),
          selected = qs.find((q) => q.key == key) || qs[0],
          comps = res?.reactComps || [],
          widgets = res?.widgets || []
        const rows = coreUtils.asArray(sqlData.rows),
          cols = useMemo(() => colsOf(rows), [sqlData.rows])
        const runSqlPreview = (q = selected, live = () => true) =>
          q &&
          (setSqlData({ loading: true }),
          duckDbSql
            .$runWithCtx(ctx.setVars({ db: 'local' }), previewSql(report, q, reportsRoot))
            .then((r) => live() && setSqlData(r?.error ? { error: r.error } : { rows: r }))
            .catch((e) => live() && setSqlData({ error: String(e.message || e) })))
        useEffect(() => {
          let live = true
          fetch(QUESTIONS_URL)
            .then((r) => r.text())
            .then((md) => live && setQuestionRows(parseQuestionsMd(md)))
            .catch(() => live && setQuestionRows([]))
          return () => (live = false)
        }, [])
        useEffect(() => {
          if (tab != 'code' || !selected) return
          let live = true
          runSqlPreview(selected, () => live)
          return () => (live = false)
        }, [tab, key, report])
        const say = (role, text, meta) => setMsgs((ms) => [...ms, { role, text, meta }])
        const loadReport = async (id) => {
          const base = reports.find((r) => r.id == id) || report
          setBusy(true)
          setStatus('מריץ דוח...')
          const active = (await loadJson(roomFile(roomWUrl, `${id}.json`), ctx)) || base,
            savedPatch = await loadJson(roomFile(roomWUrl, `${id}-draft-patch.json`), ctx)
          const nextPatch = savedPatch?.ops?.length ? savedPatch : null,
            nextReport = nextPatch ? applyReportPatch(active, nextPatch) : active
          setReport(nextReport)
          setPatch(nextPatch)
          setRes(null)
          setKey(queriesOf(nextReport)[0]?.key || 'report.executiveSummary')
          setLast(null)
          setTrace([])
          setRes(await runSelectedReport(ctx, nextReport, reportsRoot))
          setBusy(false)
          setStatus('הדוח רץ')
          setTab('ui')
        }
        const edit = async (text) => {
          const t = text.trim()
          if (!t) return
          const chatHistory = [...msgs, { role: 'user', text: t }].slice(-10).map(({ role, text }) => ({ role, text }))
          setMsgs(chatHistory)
          setDraft('')
          setBusy(true)
          setStatus('מתחיל workflow...')
          const onProgress = (e) => e?.t && setStatus(e.t)
          coreUtils.eventEmitter.on('progress', onProgress)
          try {
            const wfCtx = ctx.setVars({
              userMessage: t,
              chatHistory,
              currentReport: report,
              currentPatch: patch,
              reportId: report.id,
              reportsRoot,
              roomWUrl,
              selectedSlotKey: selected?.key || key,
              db: 'local',
              dbHost: 'node',
              roomId: 'comaxDemo',
            })
            const wf = await dsls.ai.workflow['reports-studio-edit'].$run().calcWorkflow(wfCtx),
              out = wf?.runRes
            setTrace(wf?.workflowTrace || [])
            setLast({ adminUrl: wf?.adminUrl, patch: out?.patch, log: wf?.workflowLog || [] })
            if (out?.report)
              (setReport(out.report),
                setPatch(out.patch),
                setRes(out.validation?.run || res),
                setTab('ui'),
                say('assistant', out.text || 'נוצרה טיוטה.', { adminUrl: wf?.adminUrl, patch: out.patch }),
                setStatus('הטיוטה מוכנה'))
            else (say('assistant', out?.error || 'העריכה נכשלה.', { adminUrl: wf?.adminUrl }), setStatus('נכשל'))
          } catch (e) {
            say('assistant', String(e.message || e))
            setStatus('נכשל')
          }
          coreUtils.eventEmitter.off('progress', onProgress)
          setBusy(false)
        }
        const rerun = async () => {
          setBusy(true)
          setStatus('מריץ דוח...')
          setRes(await runSelectedReport(ctx, report, reportsRoot))
          setBusy(false)
          setStatus('הדוח רץ')
          setTab('ui')
        }
        const save = async () => {
          setBusy(true)
          setStatus('שומר דוח פעיל...')
          const r = await publishReportStudioDraft.$runWithCtx(ctx.setVars({
            currentReport: report, roomWUrl, db: 'bucket', dbHost: coreUtils.isNode ? 'node' : 'browser'
          }), {
            report,
            reportId: report.id,
            roomWUrl,
          })
          r?.ok && setPatch({ reportId: report.id, ops: [] })
          say('assistant', r?.ok ? 'השינוי נשמר כדוח פעיל.' : 'השמירה נכשלה.')
          setBusy(false)
          setStatus(r?.ok ? 'נשמר' : 'נכשל')
        }
        const btn = (id, icon, txt, click = () => setTab(id)) =>
          h(
            `button:h-9 px-3 rounded-md inline-flex items-center gap-1.5 text-sm font-bold ${
              tab == id ? 'bg-[#61A60E] text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`,
            { onClick: click, disabled: busy },
            h(`L:${icon}`, { size: 15 }),
            txt,
          )
        const chat = h(
          'aside:w-full lg:w-[390px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col min-h-[360px] lg:h-screen',
          {},
          h(
            'div:p-4 border-b-2 border-[#61A60E]',
            {},
            h('img:h-7 w-auto mb-3', { src: comaxLogo, alt: 'COMAX' }),
            h(
              'div:flex items-center justify-between gap-2',
              {},
              h('div:text-lg font-black text-[#454343]', {}, 'AI Reports Studio'),
              h('span:text-[11px] font-bold rounded-full px-2 py-1 bg-[#61A60E]/10 text-[#3d7d08]', {}, patch?.ops?.length ? 'Draft' : 'Active'),
            ),
            h('div:text-xs text-slate-500 truncate', {}, selected?.sectionTitle || report.title),
          ),
          h(
            'div:p-3 border-b border-slate-200',
            {},
            h(
              'select:w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm font-bold text-[#454343] outline-none focus:border-[#61A60E]',
              { value: report.id, disabled: busy, onChange: (e) => loadReport(e.target.value) },
              reports.map((r) => h('option', { key: r.id, value: r.id }, r.title || r.id)),
            ),
          ),
          h(
            'div:flex-1 overflow-y-auto p-3 space-y-2',
            {},
            msgs.map((m, i) =>
              h(
                `div:max-w-[94%] rounded-lg px-3 py-2 text-sm leading-6 ${m.role == 'user' ? 'mr-auto bg-[#61A60E] text-white' : 'bg-slate-100 text-slate-700'}`,
                { key: i },
                h('div:whitespace-pre-wrap break-words', {}, m.text),
                m.meta?.adminUrl && h('a:text-xs text-[#3d7d08] underline', { href: m.meta.adminUrl, target: '_blank' }, 'biglog'),
              ),
            ),
          ),
          h(
            'div:border-t border-slate-200 p-3 space-y-2',
            {},
            status &&
              h(
                'div:rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600 flex items-center gap-2',
                {},
                h(`L:${busy ? 'LoaderCircle' : 'Workflow'}`, { size: 14, className: busy ? 'animate-spin text-[#61A60E]' : 'text-[#61A60E]' }),
                h('span:truncate', {}, status),
              ),
            h(
              'div:grid grid-cols-2 gap-2',
              {},
              [
                ['שנה לוגיקת מפסידים', 'change the logic behind losing promotions to be active promotions with negative margin or negative sales lift'],
                ['טבלת חלשים', 'add a table of all the low performing promotions'],
              ].map(([lbl, q]) =>
                h(
                  'button:rounded-md border border-[#61A60E]/30 bg-[#61A60E]/10 px-2 py-1.5 text-xs font-bold text-[#3d7d08]',
                  { key: lbl, onClick: () => edit(q), disabled: busy },
                  lbl,
                ),
              ),
            ),
            h('textarea:w-full h-24 rounded-md border border-slate-200 p-2 text-sm resize-none outline-none focus:border-[#61A60E]', {
              value: draft,
              onInput: (e) => setDraft(e.target.value),
              placeholder: 'Ask the editor to change SQL or UI...',
              dir: 'auto',
            }),
            h(
              'button:w-full h-9 rounded-md bg-[#61A60E] text-white text-sm font-bold disabled:opacity-50',
              { disabled: !draft.trim() || busy, onClick: () => edit(draft) },
              busy ? 'Working...' : 'Apply edit',
            ),
          ),
        )
        const header = h(
          'header:h-auto sm:h-16 shrink-0 bg-white/95 border-b border-slate-200 px-3 sm:px-4 py-2 sm:py-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3',
          {},
          h(
            'div:min-w-0 flex-1',
            {},
            h('div:text-lg font-black text-[#454343] truncate', {}, report.title),
            h(
              'div:text-xs text-slate-500 truncate',
              {},
              res?.error ||
                `${patch?.ops?.length ? 'Draft' : 'Saved'} · ${reports.length} reports · ${comps.length} ReactComp panels · ${widgets.length} widgets · ${qs.length} queries`,
            ),
          ),
          h(
            'div:grid grid-cols-5 sm:flex items-center gap-2 shrink-0',
            {},
            btn('ui', 'PanelsTopLeft', 'UI'),
            btn('questions', 'MessageCircleQuestion', h('span', {}, h('span:hidden sm:inline', {}, 'Questions'), h('span:sm:hidden', {}, 'Qs'))),
            btn('code', 'Code2', 'Code'),
            btn('', patch?.ops?.length ? 'Save' : 'Check', patch?.ops?.length ? 'Save' : 'Saved', save),
            btn('', busy ? 'LoaderCircle' : 'RefreshCw', busy ? 'Running' : 'Run', rerun),
          ),
        )
        const ui = h(
          'div:p-4 sm:p-5 space-y-4 overflow-y-auto',
          {},
          res?.error && h('pre:rounded-lg bg-red-50 border border-red-100 p-3 text-xs text-red-700 whitespace-pre-wrap', {}, res.error),
          comps.map((spec, i) => {
            const Cmp = dsls.react['react-comp'][spec.cmpId]
            return Cmp && h('div:min-w-0', { key: `c${i}` }, hh(ctx, Cmp, { spec, send: (q) => edit(q) }))
          }),
          !comps.length &&
            widgets.map((spec, i) =>
              h(
                'div:min-w-0 rounded-lg border border-slate-200 bg-white p-2 overflow-hidden',
                { key: `w${i}`, dir: 'ltr' },
                hh(ctx, dsls.react['react-comp'].VizWidget, { spec: { width: 760, height: 340, ...spec } }),
              ),
            ),
        )
        const code = h(
          'div:grid lg:grid-cols-[280px_1fr] h-full min-h-0 overflow-hidden',
          {},
          h(
            'nav:border-b lg:border-b-0 lg:border-r border-slate-200 bg-white overflow-y-auto p-3 space-y-3',
            {},
            groups.map((g) =>
              h(
                'div',
                { key: g.id },
                h('div:text-xs font-black text-[#454343] mb-1 truncate', {}, g.title),
                g.qs.map((q) =>
                  h(
                    `button:w-full text-left rounded-md px-2 py-1.5 text-xs ${selected?.key == q.key ? 'bg-[#61A60E] text-white' : 'text-slate-600 hover:bg-slate-50'}`,
                    { key: q.key, onClick: () => setKey(q.key) },
                    q.label,
                  ),
                ),
              ),
            ),
          ),
          h(
            'section:min-w-0 overflow-y-auto p-4 sm:p-5 space-y-3',
            {},
            h(
              'div:flex flex-wrap items-center justify-between gap-2',
              {},
              h('div:min-w-0', {}, h('div:text-xs font-bold text-[#61A60E]', {}, selected?.sectionTitle), h('h2:text-lg font-black text-[#454343] truncate', {}, selected?.label)),
              last?.adminUrl && h('a:text-xs font-bold text-[#3d7d08] underline', { href: last.adminUrl, target: '_blank' }, 'biglog'),
            ),
            h(
              'div:rounded-lg border border-slate-200 bg-white overflow-hidden',
              { dir: 'ltr' },
              h(
                'div:flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100',
                {},
                h(
                  'div:min-w-0',
                  {},
                  h('div:text-sm font-black text-[#454343]', {}, 'SQL Results'),
                  h('div:text-xs text-slate-500', {}, sqlData.loading ? 'Running SQL...' : sqlData.error ? 'Error' : `${rows.length} rows`),
                ),
                h(
                  'button:h-8 rounded-md border border-[#61A60E]/30 bg-[#61A60E]/10 px-2 text-xs font-bold text-[#3d7d08] disabled:opacity-50',
                  { onClick: () => runSqlPreview(), disabled: sqlData.loading },
                  'Run SQL',
                ),
              ),
              sqlData.error
                ? h('pre:p-3 text-xs text-red-700 whitespace-pre-wrap break-words', {}, sqlData.error)
                : rows.length
                  ? h(
                      'div',
                      {},
                      h(
                        'div:hidden sm:block',
                        {},
                        h(
                          'table:w-full table-fixed text-xs',
                          {},
                          h(
                            'thead:bg-slate-50',
                            {},
                            h(
                              'tr',
                              {},
                              cols.map((c) => h('th:px-2 py-2 text-left font-bold text-slate-500 truncate', { key: c, title: c }, c)),
                            ),
                          ),
                          h(
                            'tbody',
                            {},
                            rows.slice(0, 50).map((r, i) =>
                              h(
                                'tr:odd:bg-white even:bg-slate-50/60',
                                { key: i },
                                cols.map((c) => h('td:px-2 py-1.5 border-t border-slate-100 text-slate-700 truncate', { key: c, title: cell(r[c]) }, cell(r[c]))),
                              ),
                            ),
                          ),
                        ),
                      ),
                      h(
                        'div:sm:hidden divide-y divide-slate-100',
                        {},
                        rows.slice(0, 10).map((r, i) =>
                          h(
                            'div:p-3 space-y-1',
                            { key: i },
                            cols
                              .slice(0, 8)
                              .map((c) =>
                                h(
                                  'div:grid grid-cols-[96px_1fr] gap-2 text-xs',
                                  { key: c },
                                  h('div:font-bold text-slate-500 truncate', {}, c),
                                  h('div:text-slate-700 break-words', {}, cell(r[c])),
                                ),
                              ),
                          ),
                        ),
                      ),
                    )
                  : h('div:p-3 text-xs text-slate-500', {}, sqlData.loading ? 'Loading...' : 'No rows'),
            ),
            h(
              'pre:rounded-lg border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-800 overflow-auto whitespace-pre-wrap break-words sm:whitespace-pre font-mono',
              { dir: 'ltr' },
              prettySql(sqlOf(selected)),
            ),
            h(
              'details:rounded-lg border border-slate-200 bg-white p-3',
              { open: !!last?.patch },
              h('summary:text-sm font-black text-[#454343] cursor-pointer', {}, 'Draft patch'),
              h('pre:mt-2 text-xs whitespace-pre-wrap break-words font-mono text-slate-700', { dir: 'ltr' }, patchText(last?.patch || patch)),
            ),
            trace?.length > 0 &&
              h(
                'details:rounded-lg border border-slate-200 bg-white p-3',
                {},
                h('summary:text-sm font-black text-[#454343] cursor-pointer', {}, `Trace ${trace.length}`),
                h('pre:mt-2 text-xs whitespace-pre-wrap break-words font-mono text-slate-700', { dir: 'ltr' }, JSON.stringify(trace.slice(-8), null, 2)),
              ),
          ),
        )
        const qModel = useMemo(() => clusterQuestions(reports, questionRows), [reports, questionRows]),
          maxQ = Math.max(1, ...qModel.byReport.map((g) => g.questions.length))
        const qChip = (q) =>
          h(
            'div:rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs leading-5',
            { key: q.id },
            h('div:font-black text-[#454343]', {}, `${q.id} · ${q.tag}`),
            h('div:text-slate-600', {}, q.text),
          )
        const questions = h(
          'div:p-4 sm:p-5 space-y-4 overflow-y-auto',
          {},
          h(
            'div:flex flex-wrap items-end justify-between gap-3',
            {},
            h('div', {}, h('div:text-xs font-bold text-[#61A60E]', {}, 'Questions Asked'), h('h2:text-xl font-black text-[#454343]', {}, 'Coverage by report')),
            h('div:text-xs text-slate-500', {}, `${qModel.matched.length}/${questionRows.length || 50} matched · ${qModel.unmatched.length} unmatched`),
          ),
          h(
            'div:grid grid-cols-2 lg:grid-cols-4 gap-3',
            {},
            [
              ['Questions', questionRows.length || 50],
              ['Matched', qModel.matched.length],
              ['Unmatched', qModel.unmatched.length],
              ['Create', qModel.suggestions.filter((s) => s.questions.length).length],
            ].map(([k, v]) =>
              h(
                'div:rounded-lg border border-slate-200 bg-white p-3',
                { key: k },
                h('div:text-xs font-bold text-slate-500', {}, k),
                h('div:text-2xl font-black text-[#454343]', {}, v),
              ),
            ),
          ),
          h(
            'div:grid xl:grid-cols-[1fr_380px] gap-4',
            {},
            h(
              'div:space-y-3',
              {},
              [...qModel.byReport]
                .sort((a, b) => b.questions.length - a.questions.length || a.report.title.localeCompare(b.report.title))
                .map((g) =>
                  h(
                    'div:rounded-lg border border-slate-200 bg-white p-3',
                    { key: g.report.id },
                    h(
                      'div:flex items-center justify-between gap-3',
                      {},
                      h('div:min-w-0', {}, h('div:text-sm font-black text-[#454343] truncate', {}, g.report.title), h('div:text-xs text-slate-500 truncate', {}, g.report.id)),
                      h(
                        'button:h-8 rounded-md border border-[#61A60E]/30 bg-[#61A60E]/10 px-2 text-xs font-bold text-[#3d7d08]',
                        { onClick: () => loadReport(g.report.id), disabled: busy },
                        `${g.questions.length} questions`,
                      ),
                    ),
                    h('div:mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden', {}, h('div:h-full bg-[#61A60E]', { style: { width: `${(100 * g.questions.length) / maxQ}%` } })),
                    g.questions.length ? h('div:mt-3 grid md:grid-cols-2 gap-2', {}, g.questions.map(qChip)) : h('div:mt-3 text-xs text-slate-400', {}, 'No questions matched'),
                  ),
                ),
            ),
            h(
              'aside:space-y-3',
              {},
              h('div:rounded-lg border border-slate-200 bg-white p-3', {}, h('div:text-sm font-black text-[#454343] mb-2', {}, 'No Matching Report'), qModel.unmatched.map(qChip)),
              qModel.suggestions
                .filter((s) => s.questions.length)
                .map((s) =>
                  h(
                    'div:rounded-lg border border-slate-200 bg-white p-3',
                    { key: s.id },
                    h('div:text-sm font-black text-[#454343]', {}, s.title),
                    h('div:text-xs text-slate-500 leading-5 mt-1', {}, s.why),
                    h('div:mt-2 space-y-2', {}, s.questions.map(qChip)),
                  ),
                ),
            ),
          ),
        )
        return h(
          'div:comax-brand h-screen overflow-hidden bg-[#F6F7F8] text-slate-900 flex flex-col lg:flex-row',
          {},
          h('style', {}, comaxFontCss),
          chat,
          h('main:flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden', {}, header, tab == 'code' ? code : tab == 'questions' ? questions : ui),
        )
      },
    enrichCtx: async (ctx) => {
      const reportsRoot = ctx.vars.reportsRoot || root(),
        roomWUrl = ctx.vars.reportRoomUrl || ROOM,
        reports = verifiedReportsRegistry.$runWithCtx(ctx),
        activeBase = reports.find((r) => r.id == (ctx.vars.reportId || DEFAULT_REPORT)) || reports[0]
      ctx = ctx.setVars({ db: 'local', dbHost: 'node', reportsRoot, roomWUrl })
      const active = (await loadJson(roomFile(roomWUrl, `${activeBase.id}.json`), ctx)) || activeBase,
        savedPatch = await loadJson(roomFile(roomWUrl, `${activeBase.id}-draft-patch.json`), ctx)
      const patch = savedPatch?.ops?.length ? savedPatch : null,
        report = patch ? applyReportPatch(active, patch) : active
      ctx = ctx.setVars({ reportsRegistry: [report] })
      return ctx.setVars({
        initialPatch: patch,
        initialReport: report,
        initialReports: reports,
        reportsRoot,
        roomWUrl,
        initialRun: await runSelectedReport(ctx, report, reportsRoot),
      })
    },
  }),
})
