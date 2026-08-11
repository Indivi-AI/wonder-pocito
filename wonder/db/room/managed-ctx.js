import { coreUtils, dsls, jb } from '@jb6/core'
import '@wonder/db/db-drivers.js'
import './room-lambda-client.js'

const { wfetch2, getIdToken } = jb.wonderUtils
const {
  tgp: { TgpType, CtxEnricher },
  test: { Logger, logger: { domainLogger } },
} = dsls
const { enrichCtxWithDataContext } = coreUtils

Logger('managedDataCtxLogger', {
  impl: domainLogger('managedDataCtx')
})

const FreshnessPolicy = TgpType('freshness-policy', 'managed-data-ctx')

const ttl = FreshnessPolicy('ttl', {
  params: [{ id: 'maxAgeMs', as: 'number', mandatory: true }],
  impl: (_, {}, { maxAgeMs }) => ({
    check: lm => !lm ? 'missing' : Date.now() - new Date(lm).getTime() > maxAgeMs ? 'stale' : 'fresh'
  })
})
FreshnessPolicy('always', { impl: () => ({ check: lm => lm ? 'fresh' : 'missing' }) })
FreshnessPolicy('never',  { impl: () => ({ check: () => 'stale' }) })

const diffVars = (base, next) =>
  Object.fromEntries(Object.entries(next || {}).filter(([k, v]) => base[k] !== v))

const buildAndWrite = async (ctx, enricher, wUrl) => {
  const log = ctx.vars.managedDataCtxLogger
  log?.info?.({ event: 'buildAndWrite enter', wUrl }, { enricherProfile: enricher?.profile }, { ctx })
  const enriched = await enricher(ctx)
  log?.info?.({ event: 'buildAndWrite enriched', wUrl }, { enrichedData: enriched?.data }, { ctx })
  const dc = { data: enriched.data, vars: diffVars(ctx.vars, enriched.vars) }
  const body = JSON.stringify(dc)
  await wfetch2(wUrl, { method: 'PUT', body: dc }, ctx)
  log?.info?.({ event: 'wrote', wUrl, bytes: body.length }, {}, { ctx })
  return dc
}

CtxEnricher('managedDataCtx', {
  params: [
    { id: 'enricher',  type: 'ctx-enricher<tgp>',                   dynamic: true, mandatory: true },
    { id: 'wUrl',      as: 'string',                                dynamic: true, mandatory: true },
    { id: 'freshness', type: 'freshness-policy<managed-data-ctx>',  defaultValue: ttl({ maxAgeMs: 3600000 }) },
  ],
  impl: async (ctx, { managedDataCtxLogger: log }, { enricher, wUrl, freshness }) => {
    const url = wUrl(ctx)
    const head = await wfetch2(url, { method: 'HEAD' }, ctx).catch(() => null)
    const lastModified = head?.ok ? head.headers?.get('last-modified') : null
    const state = freshness.check(lastModified)
    log?.info?.({ event: 'freshness', state, wUrl: url, lastModified }, {}, { ctx })
    const dc = state === 'fresh'
      ? (log?.info?.({ event: 'cache hit', wUrl: url }, {}, { ctx }), (await wfetch2(url, {}, ctx)).json())
      : buildAndWrite(ctx, enricher, url)
    return enrichCtxWithDataContext(ctx, dc)
  }
})
