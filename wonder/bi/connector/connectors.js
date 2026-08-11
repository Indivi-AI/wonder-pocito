import { coreUtils, dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@wonder/db/db-drivers.js'

const { wfetch2, wresolve } = jb.wonderUtils
const {
  tgp: { TgpType, Component }
} = dsls

const Connector = TgpType('connector', 'wonder')
const connector = Component('connector', {
  type: 'connector<wonder>',
  params: [
    { id: 'wUrlPattern', as: 'string', mandatory: true },
    { id: 'connect', type: 'ctx-enricher<tgp>', dynamic: true },   // callable (ctx)=>Promise<Ctx>: invoked later with the real run-ctx
    { id: 'query',   type: 'ctx-enricher<tgp>', dynamic: true }    // (eager resolution ran them against the bare ctx — connectors never produced)
  ],
  impl: (ctx, {}, args) => {
    const id = ctx.jbCtx.profile?.$?.id
    ctx?.vars?.dbLogger?.info?.({ t: 'connector built', id, wUrlPattern: args.wUrlPattern, connectIsFn: typeof args.connect === 'function', queryIsFn: typeof args.query === 'function' }, {}, { ctx })
    return { ...args, id }
  }
})

const Account = TgpType('account', 'wonder', { typescript: '{ expand: (ctx) => Promise<{ platform, accountId, vertical, secret?, connectors[] }[]> }' })
// accountId = the RAW API id (act_123 / customer_id 111). the comp id (fb_act_123) is the registry name. id = comp id.
const single = (a, platform, ctx) => { const self = { ...a, platform, id: ctx.jbCtx.profile?.$?.id }; return { ...self, expand: async () => [self] } }

Account('fbAccount', {
  params: [{ id: 'accountId', as: 'string', mandatory: true }, { id: 'secret', as: 'string', mandatory: true }, { id: 'vertical', as: 'string' }, { id: 'connectors', type: 'connector<wonder>[]' }],
  impl: (ctx, {}, a) => single(a, 'facebook', ctx)
})
Account('ttAccount', {
  params: [{ id: 'accountId', as: 'string', mandatory: true }, { id: 'secret', as: 'string', mandatory: true }, { id: 'vertical', as: 'string' }, { id: 'connectors', type: 'connector<wonder>[]' }],
  impl: (ctx, {}, a) => single(a, 'tiktok', ctx)
})
Account('gAccount', {
  params: [{ id: 'accountId', as: 'string', mandatory: true }, { id: 'secret', type: 'secret<wonder>', mandatory: true, description: 'ref to the shared google manager (OAuth creds)' }, { id: 'vertical', as: 'string' }, { id: 'connectors', type: 'connector<wonder>[]' }],
  impl: (ctx, {}, a) => single(a, 'google', ctx)
})
const Secret = TgpType('secret', 'wonder')
Secret('googleManager', {
  params: ['client_id','client_secret','developer_token','refresh_token','manager_id'].map(id => ({ id, as: 'string' }))
})
Account('bingAccount', {
  params: [{ id: 'accountId', as: 'string', mandatory: true }, { id: 'secret', as: 'string' }, { id: 'vertical', as: 'string' }, { id: 'connectors', type: 'connector<wonder>[]' }],
  impl: (ctx, {}, a) => single(a, 'bing', ctx)
})

const readSettings = async (from, ctx) => {
  const { spawn } = await import('child_process')
  const glob = (await wresolve(from, ctx)).replace('https://storage.googleapis.com/', 'gs://')
  const out = await new Promise(res => { let o = ''; const p = spawn('duckdb', ['-json', '-c', `SELECT settings FROM read_parquet('${glob}') LIMIT 1`]); p.stdout.on('data', d => o += d); p.on('exit', () => res(o)) })
  return JSON.parse(JSON.parse(out.trim() || '[{}]')[0].settings || '{}')
}
Account('dynamicAccounts', {
  params: [
    { id: 'from', as: 'string', mandatory: true, description: 'CRM leadcenter_settings parquet wUrl' },
    { id: 'platforms', as: 'array', defaultValue: ['facebook','google','tiktok'] },
    { id: 'connectors', type: 'connector<wonder>[]' }
  ],
  impl: (ctx, {}, { from, platforms, connectors }) => ({ from, platforms, connectors, id: ctx.jbCtx.profile?.$?.id,
    expand: async runCtx => {
      const settings = await readSettings(from, runCtx)
      return platforms.flatMap(platform => {
        const d = settings[platform] || {}, ids = d.ad_accounts || [], cats = d.ad_accounts_category || []
        return ids.map((accountId, i) => ({ platform, accountId, vertical: cats[i], connectors }))
      })
    } })
})
