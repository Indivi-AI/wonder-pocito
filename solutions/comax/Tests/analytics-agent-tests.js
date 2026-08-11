import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '../Agents/analytics-agent.js'

const {
  tgp: { 'ctx-enricher': { setVars } },
  common: { data: { duckDbSql, asIs, comaxEntityCandidates }, boolean: { and, contains, equals, notNull } },
  test: { Test, test: { dataTest } },
  workflow: { workflow: { basicAnalytics } }
} = dsls

const llmProxyUrl = 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
const COMAX = 'signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466'
const localRoom = setVars(asIs({ db: 'local', dbHost: 'node' }))   // room:// resolves to files/rooms/comaxDemo
const customerCountsSql = root => `SELECT 'לקוחות רשומים במערכת (Idx)' AS category, count(*) AS count_value FROM read_parquet('${root}/Idx.parquet') WHERE Type = 1
UNION ALL SELECT 'לקוחות ייחודיים שביצעו קנייה (CustomerC)', count(DISTINCT CustomerC) FROM read_parquet('${root}/KupaDoc_Header.parquet') WHERE CustomerC > 0
UNION ALL SELECT 'חברי מועדון ייחודיים שקנו (MOADON_NO)', count(DISTINCT MOADON_NO) FROM read_parquet('${root}/KupaDoc_Header.parquet') WHERE MOADON_NO > 0`
const hasAll = (s, xs) => xs.every(x => s.toLowerCase().includes(x.toLowerCase()))
const isSseChunkNoise = e => /llm can not parse line/.test(e?.t || '')   // non-fatal streaming chunk-boundary parse on the reasoning channel (any step)
const comaxFlowOk = xs => ctx => {
  const d = ctx.data, code = d.llmGeneratedCode || ''
  return !d.runRes?.error && !(d.workflowErrors || []).some(e => !isSseChunkNoise(e)) &&
    !code.includes('schematics') && !code.includes('read_json_auto') && hasAll(code, xs)
}
const runComaxAnalytics = userMessage => async ctx => {
  const vars = { db: 'local', userId: 'ScreenshotService', roomId: 'comaxDemo', userMessage, doNotWriteLogs: true, isLocalHost: false, llmProxyUrl, categories: { analytics: true, local: true } }
  const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars(vars))
  return basicAnalytics.$runWithCtx(wfCtx).calcWorkflow(wfCtx)
}

// --- finalAnswer: the declarative final-assembly step (replaces LLM-authored jq) ---

const runFinalAnswer = (rows, profileExtra = {}) => async ctx => {
  const logger = { workflowTrace: [], info() {}, error() {}, status() {}, warning() {}, step() {} }
  const { vars = {}, ...extra } = profileExtra
  const profile = { $: 'flow-elem<workflow>finalAnswer',
    sql: "SELECT name, value FROM t WHERE name LIKE '%קפה%'",
    narrative: '{0.name} מוביל עם {0.value:₪} (ללא מע"מ)',
    widgets: [{ kind: 'bar', title: 'מכירות', valueFormat: '₪', nameCol: 'name', valueCol: 'value', drill: { dimension: 'name', question: 'פרק את {name}' } }],
    followUps: [{ label: 'פירוק', question: 'פרק לפי סניף' }], ...extra }
  coreUtils.resolveProfileTypes(profile, { expectedType: 'flow-elem<workflow>', tgpModel: jb })
  const res = await ctx.setVars({ workflowLogger: logger, rows, answer: 'תשובה בעברית', ...vars }).run(profile)
  return res instanceof coreUtils.Ctx ? res.data : res
}

// hebrew gershayim in narrative, LIKE-% in sql, widget data built from rows columns — the exact traps that killed the jq step
Test('finalAnswer.assemblesFromVars', {
  impl: dataTest({
    calculate: runFinalAnswer([{ name: 'תל אביב', value: 18400 }, { name: 'ירושלים', value: 14200 }]),
    expectedResult: ctx => { const d = ctx.data
      return d.text === 'תשובה בעברית' && d.narrative.includes('תל אביב') && d.narrative.includes('18,400 ₪') && d.narrative.includes('מע"מ') &&
        d.sql.includes("LIKE '%קפה%'") && d.rows.length === 2 &&
        d.widgets[0].data.length === 2 && d.widgets[0].data[0].value === 18400 && !('nameCol' in d.widgets[0]) &&
        d.widgets[0].drill.question === 'פרק את {name}' && d.followUps[0].label === 'פירוק' }
  })
})

Test('finalAnswer.emptyRowsHandledByRuntime', {
  impl: dataTest({
    calculate: runFinalAnswer([]),
    expectedResult: ctx => { const d = ctx.data
      return d.text === 'תשובה בעברית' && d.narrative === 'לא נמצאו נתונים מתאימים לשאלה.' && d.rows.length === 0 && d.widgets.length === 0 }
  })
})

Test('finalAnswer.unverifiedWarning', {
  impl: dataTest({
    calculate: runFinalAnswer([{ name: 'מבצע', value: 7 }], { vars: { unverifiedAnswerWarning: 'This answer is not verified, validate yourself.' } }),
    expectedResult: ctx => ctx.data.text.startsWith('This answer is not verified, validate yourself.') && ctx.data.verified === false && ctx.data.verificationWarning
  })
})

// --- duckdb over the comax room parquets: the applet's exact data path ---

Test('comaxDuckDb.roomUrl.customerCounts', {
  impl: dataTest({
    setup: localRoom,
    calculate: duckDbSql(customerCountsSql(COMAX)),
    expectedResult: and(equals('לקוחות רשומים במערכת (Idx)', '%0/category%'), notNull('%0/count_value%'), notNull('%2/count_value%')),
    timeout: 60000
  })
})

Test('comaxDuckDb.bigCompanySmoke', {
  impl: dataTest({
    setup: localRoom,
    calculate: duckDbSql(`SELECT count(*) AS n FROM read_parquet('${COMAX}/KupaDoc_Lines.parquet')`),
    expectedResult: equals(69771038, '%0/n%'),
    timeout: 60000
  })
})

// the canonical sales spine: lines -> header -> store, net = Scm - VatAmount, trim() on Nm
Test('comaxDuckDb.branchSales', {
  impl: dataTest({
    setup: localRoom,
    calculate: duckDbSql(`SELECT trim(s.Nm) AS branch, round(sum(l.Scm - l.VatAmount)) AS net_sales, count(DISTINCT h.C) AS receipts
      FROM read_parquet('${COMAX}/KupaDoc_Lines.parquet') l
      JOIN read_parquet('${COMAX}/KupaDoc_Header.parquet') h ON l.KupaDocC = h.C
      JOIN read_parquet('${COMAX}/Store.parquet') s ON h.StoreC = s.C
      GROUP BY 1 ORDER BY net_sales DESC LIMIT 3`),
    expectedResult: and(equals('גני תקווה', '%0/branch%'), notNull('%0/net_sales%'), notNull('%0/receipts%')),
    timeout: 60000
  })
})

// promotion_cycles: the LLM-built recurring-deal table, read + joined to the Mivza master via the room path (the past-promotions path)
Test('comaxDuckDb.promoCyclesJoin', {
  impl: dataTest({
    setup: localRoom,
    calculate: duckDbSql(`WITH pc AS (SELECT * FROM read_parquet('${COMAX}/promotion_cycles.parquet')),
      m AS (SELECT * FROM read_parquet('${COMAX}/Mivza.parquet'))
      SELECT any_value(pc.deal_name) AS deal, any_value(pc.brand) AS brand, count(*) AS cycles, min(m.FromDate)::date::varchar AS first_run
      FROM pc JOIN m ON pc.mivza_c = m.C
      WHERE pc.deal_id = (SELECT deal_id FROM pc WHERE mivza_c = 6987)`),
    expectedResult: and(equals(30, '%0/cycles%'), notNull('%0/deal%'), notNull('%0/brand%'), notNull('%0/first_run%')),
    timeout: 60000
  })
})

Test('comaxDuckDb.promoNameFromMaster', {
  impl: dataTest({
    setup: localRoom,
    calculate: duckDbSql(`SELECT trim(m.Nm) AS campaign, count(*) AS items
      FROM read_parquet('${COMAX}/Mivza_Prt.parquet') mp
      JOIN read_parquet('${COMAX}/Mivza.parquet') m ON m.C = mp.MivzaC
      GROUP BY 1 ORDER BY items DESC LIMIT 1`),
    expectedResult: and(notNull('%0/campaign%'), notNull('%0/items%')),
    timeout: 60000
  })
})

// the margin recipe the booklet teaches: LATEST cost per item x store via arg_max (a same-day equi-join covers only ~5%)
Test('comaxDuckDb.deptMarginLatestCost', {
  impl: dataTest({
    setup: localRoom,
    calculate: duckDbSql(`WITH ic AS (SELECT StoreID, ItemID, arg_max(FinalRegularCostPrice, DateDoc) AS unit_cost
        FROM read_parquet('${COMAX}/DailyPriceCost.parquet') WHERE FinalRegularCostPrice > 0 GROUP BY 1, 2)
      SELECT trim(d.Nm) AS department,
        round(sum(l.Scm - l.VatAmount)) AS net_sales,
        round(sum((l.Scm - l.VatAmount) - ic.unit_cost * l.Cmt) FILTER (WHERE ic.unit_cost IS NOT NULL)) AS gross_profit_costed,
        round(100.0 * count(ic.unit_cost) / count(*), 1) AS costed_lines_pct
      FROM read_parquet('${COMAX}/KupaDoc_Lines.parquet') l
      JOIN read_parquet('${COMAX}/KupaDoc_Header.parquet') h ON l.KupaDocC = h.C
      JOIN read_parquet('${COMAX}/Prt.parquet') p ON l.PrtC = p.C
      JOIN read_parquet('${COMAX}/Departments.parquet') d ON p.DepartmentC = d.C
      LEFT JOIN ic ON ic.ItemID = l.PrtC AND ic.StoreID = h.StoreC
      GROUP BY 1 ORDER BY net_sales DESC LIMIT 4`),
    expectedResult: and(equals('פירות וירקות ללא מע"מ', '%0/department%'), notNull('%0/gross_profit_costed%'), notNull('%0/costed_lines_pct%')),
    timeout: 60000
  })
})

// the inventory recipe: stock snapshot key cols are Prt/Store; negative Itra reported apart from positive value
Test('comaxDuckDb.stockValue', {
  impl: dataTest({
    setup: localRoom,
    calculate: duckDbSql(`WITH ic AS (SELECT StoreID, ItemID, arg_max(FinalRegularCostPrice, DateDoc) AS unit_cost
        FROM read_parquet('${COMAX}/DailyPriceCost.parquet') WHERE FinalRegularCostPrice > 0 GROUP BY 1, 2)
      SELECT trim(s.Nm) AS branch,
        count(*) FILTER (WHERE i.Itra < 0) AS negative_rows,
        round(sum(i.Itra * ic.unit_cost) FILTER (WHERE i.Itra > 0)) AS positive_stock_value
      FROM read_parquet('${COMAX}/Prt_ItrotStore_Yomi.parquet') i
      JOIN read_parquet('${COMAX}/Store.parquet') s ON i.Store = s.C
      LEFT JOIN ic ON ic.ItemID = i.Prt AND ic.StoreID = i.Store
      GROUP BY 1 ORDER BY positive_stock_value DESC NULLS LAST LIMIT 5`),
    expectedResult: and(notNull('%0/branch%'), notNull('%0/negative_rows%')),
    timeout: 60000
	})
})

Test('comaxEntityCandidates.product', {
  impl: dataTest({
    setup: localRoom,
    calculate: comaxEntityCandidates('product', 'עגבניות שרי', 5),
    expectedResult: ctx => Array.isArray(ctx.data) && ctx.data.length > 0 && ctx.data.every(o => o.id && o.label && o.summary && o.details) && ctx.data.some(o => o.label.includes('עגבניות')),
    timeout: 60000
  })
})

Test('comaxEntityCandidates.branch', {
  impl: dataTest({
    setup: localRoom,
    calculate: comaxEntityCandidates('branch', 'גני', 5),
    expectedResult: ctx => Array.isArray(ctx.data) && ctx.data.some(o => o.label == 'גני תקווה' && o.details?.weekly_sales_avg != null && o.summary),
    timeout: 60000
  })
})

Test('comaxEntityCandidates.escape', {
  impl: dataTest({
    setup: localRoom,
    calculate: comaxEntityCandidates('product', "עגבניות 'שרי", 5),
    expectedResult: ctx => Array.isArray(ctx.data),
    timeout: 60000
  })
})

// --- the booklet must carry the query rules the LLM depends on ---

Test('comaxDuckDb.booklet.roomUrlGuidance', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.bookletContent('comaxAnalytics', ctx.setVars({categories: {analytics: true, local: true}})).then(x => x.nested),
    expectedResult: contains({text: ['signedRoom://comaxDemo/usersRO/parquet', 'OEM_BI_4466', 'Idx.parquet', 'KupaDoc_Header.parquet'], anyOrder: true})
  })
})

Test('comaxDuckDb.booklet.datasetPinnedBig', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.bookletContent('comaxAnalytics', ctx.setVars({categories: {analytics: true, local: true}})).then(x => x.nested),
    expectedResult: contains({text: ['ACTIVE DATASET: OEM_BI_4466', 'OEM_BI_4466/KupaDoc_Lines.parquet', 'OEM_BI_4466/DailyPriceCost.parquet'], anyOrder: true})
  })
})

Test('comaxAnalytics.booklet.queryRules', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.bookletContent('comaxAnalytics', ctx.setVars({categories: {analytics: true, local: true}})).then(x => x.nested),
    expectedResult: contains({text: ['arg_max(FinalRegularCostPrice', 'l.KupaDocC = h.C', '-99900', 'BETWEEN 0.01 AND 100', 'trim(m.Nm)', 'NEVER use Mivza_Prt.Nm'], anyOrder: true})
  })
})

Test('comaxAnalytics.booklet.promoRules', {
  impl: dataTest({
    calculate: async ctx => {
      const s = (await jb.workflowUtils.bookletContent('comaxAnalytics', ctx.setVars({categories: {analytics: true, local: true}}))).nested
      return hasAll(s, ['Mivza.parquet', 'trim(m.Nm)', 'NEVER use Mivza_Prt.Nm'])
    },
    expectedResult: equals(true)
  })
})

Test('comaxAnalytics.outputFormat.backbone', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.docletContent('essentialOutputFormat', ctx.setVars({categories: {analytics: true, local: true}})),
    expectedResult: contains({text: ['duckDbSql', 'llmSummary', 'finalAnswer', 'nameCol', 'type == "array"'], anyOrder: true})
  })
})

// --- live e2e: Hebrew question -> LLM flow -> duckdb over the comax room -> explorable answer ---

Test('workflowTest.comaxAnalytics.branchSalesHebrew', {
  impl: dataTest({
    calculate: runComaxAnalytics('מה סך המכירות נטו לפי סניף? הצג גם מספר עסקאות וסל ממוצע.'),
    expectedResult: comaxFlowOk(['duckDbSql', 'llmSummary', 'signedRoom://comaxDemo', 'KupaDoc_Header']),
    timeout: 100000
  })
})

// the margin question must follow the latest-cost recipe, not the sparse same-day join
Test('workflowTest.comaxAnalytics.deptMarginHebrew', {
  impl: dataTest({
    calculate: runComaxAnalytics('אילו מחלקות הכי רווחיות? הצג רווח גולמי ואחוז מרווח לפי מחלקה.'),
    expectedResult: comaxFlowOk(['duckDbSql', 'FinalRegularCostPrice', 'arg_max', 'Departments']),
    timeout: 100000
  })
})

// the generated flow must carry the explorable-answer keys: narrative, echoed $sql, $rows[0:50], followUps.
Test('workflowTest.comaxAnalytics.explorableContract', {
  impl: dataTest({
    calculate: runComaxAnalytics('חמשת הפריטים הנמכרים ביותר החודש. הוסף גרף ושאלות המשך.'),
    expectedResult: ctx => { const r = ctx.data?.runRes; return r?.rows?.length == 5 && r.sql?.includes('OEM_BI_4466') && r.widgets?.some(w => w.data?.length == 5) && r.followUps?.length > 0 && /[א-ת]/.test(r.text) },
    allowError: true,
    timeout: 120000
  })
})

// a drill-oriented question must attach drill:{dimension,question} with a {name} placeholder to a categorical widget.
Test('workflowTest.comaxAnalytics.attachesDrill', {
  impl: dataTest({
    calculate: runComaxAnalytics('הצג מכירות לפי מחלקה כגרף עמודות, ואפשר לי ללחוץ על מחלקה כדי לפרק אותה לפי סניף.'),
    expectedResult: ctx => { const code = ctx.data?.llmGeneratedCode || ''; return code.includes('drill') && /\{name\}/.test(code) },
    allowError: true,
    timeout: 120000
  })
})

// --- ungrounded-name safety net: inlined dimension values + replan/llmSql recovery ---

// the booklet must carry the exact dimension values so the LLM never guesses a Hebrew category/branch name
Test('comaxAnalytics.booklet.dimensionValues', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.bookletContent('comaxAnalytics', ctx.setVars({categories: {analytics: true, local: true}})).then(x => x.nested),
    expectedResult: contains({
      text: ['מוצרי חלב וביצים', 'יוגורט ומשקאות יוגורט', 'בר כוכבא פתח תקווה', 'NEVER equality-filter a guessed Hebrew name'],
      anyOrder: true
    })
  })
})

// the backbone must instruct the replan safety net with the llmSql two-stage recovery shape
Test('comaxAnalytics.outputFormat.safetyNet', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.docletContent('essentialOutputFormat', ctx.setVars({categories: {analytics: true, local: true}})),
    expectedResult: contains({
      text: ['flow-elem<workflow>replan', 'data<common>llmSql', '$rows | length > 0', 'name what was checked', 'DISTINCTIVE token', 'NEVER run numbers for a different entity', '%$comaxAnalytics%'],
      anyOrder: true
    })
  })
})

// flow authors (incl. replan follow-up authors) must see llmSql in the llmFlow booklet
Test('llmFlowBooklet.carriesLlmSql', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.bookletContent('llmFlow', ctx.setVars({categories: {analytics: true, local: true}})).then(x => x.nested),
    expectedResult: contains({text: ['llmSql', 'runtime-informed query', 'matchedProducts'], anyOrder: true})
  })
})

// llmSql unit: given discovery rows in ctx.data, the runtime-authored SQL must query the EXACT ids and return per-product rows
Test('llmSql.informedFromFixture', {
  impl: dataTest({
    calculate: async ctx => {
      const matches = [{C: 29535, name: 'גבינת שמנת פילדלפיה 22% שומן 175 גרם'}, {C: 29536, name: 'גבינת שמנת פילדלפיה 11% שומן 175 גרם'}]
      const booklet = (await jb.workflowUtils.bookletContent('comaxAnalytics', ctx.setVars({categories: {analytics: true, local: true}}))).nested
      const env = ctx.setVars({db: 'local', dbHost: 'node', roomId: 'comaxDemo', llmProxyUrl, flowModel: 'openai/gpt-5.4', comaxAnalytics: booklet})
      return dsls.common.data.llmSql.$runWithCtx(env.setData(matches),
        'כמה יחידות נמכרו וכמה מכירות נטו היו במאי 2026 לכל אחד מהמוצרים שב-#DATA? סנן לפי ה-C המדויקים מ-#DATA על KupaDoc_Lines.PrtC, GROUP BY שם המוצר')
    },
    expectedResult: ctx => Array.isArray(ctx.data) && ctx.data.length > 0 && ctx.data.every(r => Object.values(r).some(v => typeof v == 'number')),
    timeout: 120000
  })
})

// e2e: supplier names never match verbatim (real: 'קבוצת אסם סחר') and have no asHumanFeedback machinery —
// the answer must still come back non-empty (self-resolving LIKE upfront, or the replan+llmSql recovery)
Test('workflowTest.comaxAnalytics.badNameRecovery', {
  impl: dataTest({
    calculate: runComaxAnalytics('כמה מכרנו החודש ממוצרים של הספק אסם?'),
    expectedResult: ctx => { const r = ctx.data?.runRes; return (r?.rows || []).length > 0 && /[א-ת]/.test(r?.text || '') },
    allowError: true,
    timeout: 180000
  })
})

// e2e control: a truly nonexistent supplier must stay empty with an honest Hebrew answer, never a hallucinated result
Test('workflowTest.comaxAnalytics.genuineEmptyHonest', {
  impl: dataTest({
    calculate: runComaxAnalytics('כמה מכרנו החודש ממוצרים של הספק מחלבות הירח הכחול?'),
    expectedResult: ctx => { const r = ctx.data?.runRes; return (r?.rows || []).length == 0 && !r?.error && /[א-ת]/.test(r?.text || '') },
    allowError: true,
    timeout: 180000
  })
})
