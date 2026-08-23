import {jb, dsls, coreUtils} from '@jb6/core'
import '@jb6/llm-guide/essentials.js'

const {tgp: {TgpType, Component, CtxEnricher}, common: {Data}} = dsls
const CategoryType = TgpType('category-type', 'tgp',
  {typescript: `{defaultSelection: 'best'|'all', variants(scope: string, ctx: Ctx): Promise<Variant[]>}`})

const categoryTypeBySuffix = CategoryType('categoryTypeBySuffix', {
  params: [
    {id: 'suffix', as: 'string', mandatory: true},
    {id: 'variantsOf', as: 'string', mandatory: true}
  ],
  impl: (ctx, {}, {suffix, variantsOf}) => ({suffix, variantsOf, defaultSelection: 'all'})
})

const categoryTypeByBaseName = CategoryType('categoryTypeByBaseName', {
  params: [
    {id: 'variantsOf', as: 'string', mandatory: true}
  ],
  impl: (ctx, {}, {variantsOf}) => ({baseName: true, variantsOf, defaultSelection: 'best'})
})

CategoryType('doclet', {impl: categoryTypeByBaseName('doclet<llm-guide>')})

const selectCategoryType = Data('selectCategoryType', {
  params: [
    {id: 'scope', as: 'string', mandatory: true, description: 'base name and category type, comma separated'},
    {id: 'selection'}
  ],
  impl: async (ctx, {}, {scope, selection}) => {
    const categoryType = categoryTypeOf(scope, ctx)
    if (!categoryType) return []
    selection = selection || categoryType.defaultSelection
    const baseName = scope.split(',')[0].trim()
    const wanted = !['all', 'best'].includes(selection) && coreUtils.asArray(selection)
    const selected = Object.values(Object.groupBy((await categoryType.variants(scope, ctx))
      .filter(x => !wanted || wanted.includes(x.member)), x => x.member || baseName)).map(xs => bestVariant(xs, ctx))
    if (selection == 'best') selected.splice(0, selected.length, bestVariant(selected, ctx))
    return selected.filter(Boolean)
  }
})

Data('docletContent', {
  params: [
    {id: 'docletId', as: 'string', mandatory: true}
  ],
  impl: (ctx, {}, {docletId}) => docletContent(docletId, ctx)
})

Data('bookletContent', {
  params: [
    {id: 'bookletId', as: 'string', mandatory: true}
  ],
  impl: async (ctx, {}, {bookletId}) => (await bookletContent(bookletId, ctx))?.nested
})

CtxEnricher('addCategory', {
  params: [
    {id: 'categories', as: 'string', mandatory: true}
  ],
  impl: (ctx, {}, {categories}) => ctx.setVars({categories: {...ctx.vars.categories,
    ...Object.fromEntries(categories.split(',').map(x => [x.trim(), true]))}})
})

async function docletContent(docletId, ctx, tgpModel = jb) {
  const [{id, comp} = {}] = await ctx.run(selectCategoryType(`${docletId},doclet`))
  if (!comp) return null
  const docletCtx = ctx.setVars({doNotCalcExpression: true})
  const result = ctx.vars.docletOverrides?.[id] ?? await comp.$runWithCtx?.(docletCtx)
  if (typeof result == 'string') return coreUtils.sourceRefs.wrap(id, coreUtils.evaluateDoclet(result, docletCtx.vars))
  const rendered = coreUtils.evaluateDoclet(coreUtils.prettyPrintComp(comp, {tgpModel}), docletCtx.vars)
  return coreUtils.sourceRefs.wrap(id, rendered.replace(/\(/, `( ${coreUtils.estimateTokens(rendered)}, `))
}

async function bookletContent(booklet, ctx, tgpModel = jb) {
  const content = typeof booklet == 'string' ? await tgpModel.dsls['llm-guide'].booklet[booklet]?.$runWithCtx(ctx) : booklet
  if (!content) return null
  const bookletId = typeof booklet == 'string' ? booklet : booklet.id
  if (typeof content == 'string') return {bookletId, doclets: '', nested: `(${coreUtils.estimateTokens(content)}) ${content}`}
  const doclets = await docletsContent(content.doclets.split(',').map(id => id.trim()), ctx, tgpModel)
  return {bookletId, doclets, nested: `${bookletId} (${coreUtils.estimateTokens(doclets)}) {\n${doclets}\n}`}
}

const docletsContent = async (ids, ctx, model = jb) => (await Promise.all(ids.map(id => docletContent(id, ctx, model)))).filter(Boolean).join('\n\n')

const variantId = variant => typeof variant == 'string' ? variant : variant.id
const variantMatchRank = (variant, ctx) => variantId(variant).split('.').slice(1).filter(x => ctx.vars.categories?.[x]).length
const bestVariant = (variants, ctx) => [...variants].filter(Boolean).sort((a, b) => variantMatchRank(b, ctx) - variantMatchRank(a, ctx)
  || variantId(a).split('.').length - variantId(b).split('.').length || variantId(a).localeCompare(variantId(b)))[0]

function categoryTypeOf(scope, ctx) {
  const id = scope.split(',')[1]?.trim(), comp = CategoryType[id]
  if (comp) { const categoryType = comp.$runWithCtx(ctx)
    return {...categoryType, variants: (scope, rtCtx = ctx) => variants(scope, rtCtx, categoryType)} }
  ctx.vars.errorLogger?.error?.({t: 'category scope did not find meta-category', scope, categoryType: id}, {}, {ctx})
}

function variants(scope, ctx, {variantsOf, suffix, baseName: byBaseName}) {
  const [type, dsl] = variantsOf.includes('<') ? coreUtils.splitDslType(variantsOf) : []
  const registry = dsl ? dsls[dsl][type] : coreUtils.findCompDefById({id: variantsOf, tgpModel: jb})
  const baseName = scope.split(',')[0].trim()
  const ids = coreUtils.globalsOfTypeIds(registry, 'all')
    .filter(id => id == baseName || id.startsWith(`${baseName}.`))
  if (!ids.length) ctx.vars.errorLogger?.error?.({t: 'category scope did not find base', scope, baseName}, {}, {ctx})
  return ids.map(id => { const parts = id.split('.'), part = suffix && parts.find(x => x.endsWith(suffix)), offset = byBaseName ? baseName.split('.').length : 1
    return (byBaseName || part) && {id, comp: registry[id], member: byBaseName ? baseName : part.slice(0, -suffix.length),
      categories: parts.slice(offset).filter(x => x != part)} }).filter(Boolean)
    .sort((a, b) => variantMatchRank(b, ctx) - variantMatchRank(a, ctx))
}

Object.assign(jb.workflowUtils ||= {}, {docletContent, docletsContent, bookletContent, variants: (scope, ctx) => categoryTypeOf(scope, ctx)?.variants(scope, ctx) || [],
  variantMatchRank, bestVariant})

Data('docletsContent', {
  description: 'anti-pattern!! just use booklet instead',
  params: [
    {id: 'docletIds', as: 'string', mandatory: true}
  ],
  impl: (ctx, {}, {docletIds}) => docletsContent(docletIds.split(',').map(id => id.trim()), ctx)
})
