import { dsls } from '@jb6/core'
import '@jb6/llm-guide'
import '@wonder/ai/verified-report.js'
import '@wonder/bi/bi-common.js'
import '@solution/comax2/comax-cube.js'
import './comax-v2-reports.js'

const {
  tgp: { CtxEnricher, 'ctx-enricher': { addCategory, setupCube, Var, enrichCtx } },
  common: { data: { verifiedReportsCatalog, cubeSummary, bookletContent } },
  bi: { cube: { comaxSalesCube } },
  workflow: { Workflow, workflow: { verifiedReportAgent } },
  'llm-guide': { Doclet, Booklet, booklet: { booklet } }
} = dsls

Doclet('comaxReports.role.comax', {
  impl: `Select and execute predefined Comax verified reports over the live POS cube.
Never write SQL, invent a report, or choose a UI. Use one verified report when it answers the question.`
})
Doclet('comaxReports.cubeSummary.comax', { impl: `COMAX SALES CUBE SUMMARY

<BOOKLET-EVALUATE>%$cubeSummary%</BOOKLET-EVALUATE>` })
Doclet('comaxReports.catalog.comax', { impl: `AVAILABLE VERIFIED REPORTS

<BOOKLET-EVALUATE>%$verifiedReportsCatalog%</BOOKLET-EVALUATE>` })
Doclet('comaxReports.output.comax', {
  impl: `For a report request return one TGP profile without prose.
Use flow-elem<workflow>calcVerifiedReport with the exact report id from the catalog.
Use showIn nextChatItem for a compact report or sidePanel for a detailed report.
Use summaryCategories dataInsights for an explanation, otherwise noSummary.`
})

CtxEnricher('comaxVerifiedReportContext', {
  impl: enrichCtx([addCategory('comax,verifiedReports'), setupCube(comaxSalesCube(), '30'),
    Var('cubeSummary', cubeSummary()), Var('verifiedReportsCatalog', verifiedReportsCatalog())])
})
Booklet('comaxReportSelection', {
  impl: booklet('comaxReports.role,comaxReports.cubeSummary,comaxReports.catalog,comaxReports.output')
})
Workflow('comaxVerifiedReports', {
  impl: verifiedReportAgent({
    agentContext: dsls.tgp['ctx-enricher'].comaxVerifiedReportContext(),
    booklet: bookletContent('comaxReportSelection'),
    goal: 'select verified Comax report'
  })
})
