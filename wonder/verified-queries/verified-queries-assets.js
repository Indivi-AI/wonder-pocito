import { dsls } from '@jb6/core'
import './verified-queries-dsl.js'
import '@wonder/asset/asset-dsl.js'

const {
  common: {
    Data,
    data: { verifiedReportsRegistry },
  },
  asset: {
    VariantProp,
    AssetType,
    'variant-prop': { variantProp, format },
    'asset-type': { assetType },
  },
} = dsls

const sectionCount = VariantProp('sectionCount', { impl: variantProp('report sections', 'number') })
const questionCount = VariantProp('questionCount', { impl: variantProp('verified questions covered', 'number') })

AssetType('verifiedQueries', {
  impl: assetType('verified queries report', '🧾', {
    description: 'a verified-report catalog entry published as a room asset — payload is the plain registry JSON',
    variantProps: [format(), sectionCount(), questionCount()],
  }),
})

Data('loadVerifiedReportsAsAssets', {
  description: 'put every registered verified-report into %$assetModel% as a verifiedQueries asset whose payload is the registry JSON',
  impl: async (ctx, { assetModel, assetLogger }) => {
    const reports = verifiedReportsRegistry.$runWithCtx(ctx)
    for (const r of reports)
      await assetModel.put({
        variantId: `${r.id}.verified`,
        assetType: 'verifiedQueries',
        format: 'json',
        sectionCount: (r.sections || []).length,
        questionCount: (r.questionsCovered || []).length,
        payload: JSON.stringify(r, null, 1),
      })
    assetLogger?.info?.({ t: 'loadVerifiedReports', reports: reports.map((r) => r.id) }, {}, { ctx })
    return reports.map((r) => `${r.id}.verified`)
  },
})
