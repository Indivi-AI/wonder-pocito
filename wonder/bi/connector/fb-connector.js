import { coreUtils, dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@wonder/db/db-drivers.js'
import './connectors.js'   // core: Connector type + connector component (registered before this file's body)

const { wfetch2 } = jb.wonderUtils
const {
  tgp: { TgpType, Component, DefComponents },
  wonder: { Connector, DbDriverInterceptor, Scope, 'connector': { connector }, 'db-driver-interceptor': { dbDriverInterceptor }, scope: { scope } }
} = dsls
const { enrichCtxWithDataContext } = coreUtils

// fb:// must be a registered Scope or extractFromUrl (which runs BEFORE the pre interceptor) crashes on the scheme.
// path:['fileName'] = the pathname (ad/adBreakdown) parses as fileName; the pre interceptor routes on it before any driver.
Scope('fb', { impl: scope({ path: ['fileName'] }) })

const FbInsightConnector = TgpType('fb-insight-connector', 'wonder')

// ── field<fb>: one /insights column. NO impl → run() returns the resolved params verbatim (jb-core: impl==null ⇒ compArgs).
// coerce lets a bare field name register as just the string: 'spend' ⇒ fieldDef(...). globalsOfType supplies `id` (=FB field name).
// kind/additive/note encode the FB-docs semantics the column name hides (reach non-additive; clicks ⊋ inline_link_clicks).
const Field = TgpType('field', 'fb', { coerce: kind => fieldDef(kind) })   // bare 'id' string ⇒ fieldDef('id'). type declared BEFORE its Component.
const fieldDef = Component('fieldDef', { type: 'field<fb>', params: [
  { id: 'kind', as: 'string', options: 'id,metric,attr', mandatory: true, description: 'id=identity dim · metric=additive measure · attr=ad/creative attribute' },
  { id: 'additive', as: 'boolean', description: 'safe to SUM across rows/breakdowns; false/absent for non-additive measures like reach' },
  { id: 'note', as: 'string', description: 'the non-obvious FB-docs caveat for this column' }
] })

DefComponents('account_id,account_name,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name', id => Field(id, { impl: fieldDef('id') }))
Field('spend',              { impl: fieldDef('metric', { additive: true, note: 'amount billed incl. over-delivery — not the budget you set' }) })
Field('impressions',        { impl: fieldDef('metric', { additive: true, note: 'times an ad entered screen; additive across breakdowns' }) })
Field('clicks',             { impl: fieldDef('metric', { additive: true, note: 'ALL clicks (links, likes, reactions…) — a superset of inline_link_clicks' }) })
Field('inline_link_clicks', { impl: fieldDef('metric', { additive: true, note: 'only clicks to the ad destination — ⊆ clicks; the CTR-to-site numerator' }) })
Field('reach',              { impl: fieldDef('metric', { note: 'unique people — NON-ADDITIVE: cannot be summed across breakdowns; valid only on the un-split ad row' }) })
Field('created_time',       { impl: fieldDef('attr', { note: 'ad creation timestamp — constant across the day; never aggregate' }) })
Field('creative_media_type',{ impl: fieldDef('attr', { note: 'image/video/carousel — a creative attribute surfaced on the insight row' }) })

// ── ad-split<fb>: a breakdown axis. NO impl → run() returns {breakdowns} (the resolved param) verbatim.
// coerce lets a split register as just its breakdowns string: 'age,gender' ⇒ adSplit('age,gender').
const AdSplit = TgpType('ad-split', 'fb', { coerce: breakdowns => adSplit(breakdowns) })   // type declared BEFORE its Component
const adSplit = Component('adSplit', { type: 'ad-split<fb>', params: [
  { id: 'breakdowns', as: 'string', mandatory: true, description: 'the FB breakdowns string for this split' }
] })

const GRAPH = 'https://graph.facebook.com/v19.0'
const FB_FIELDS = coreUtils.globalsOfTypeIds(dsls.fb.field).filter(f => f !== 'reach')   // request fields = registered field<fb> ids; reach added only by fb://ad
const BLOCKED = new Set(['1260861298926102'])

const getJson = async url => (await fetch(url)).json()   // never throw on !ok: let the FB {error} body flow back so pre can logger.error it
const retry = async (fn, n = 3) => { for (let i = 0; i < n; i++) { const d = await fn(); if (!d.error || i === n-1) return d; await new Promise(r => setTimeout(r, 2**i * 1000)) } }
// secret = literal token OR a room wUrl to secrets.json. resolving the ref is ACL-gated (admin ctx only): the token
// never lives in source/env/wUrl — only the REF travels (in ctx.vars / x-wonder-secret header). platform picks the key.
const resolveSecret = async (secret, platform, ctx) => {
  if (!/^(signedRoom|room):/.test(secret)) return secret
  const all = await (await wfetch2(secret, { method: 'GET' }, ctx)).json()
  // REDACTED read trace: classify by SHAPE only — never the value. lets a future llm see what's in the room and what's wrong.
  const kind = v => typeof v === 'object' && v ? 'object' : (s => !s ? 'empty' : /^%\$.*%$/.test(s) ? 'placeholder'
    : /^EAA/.test(s) ? 'fb-user-token' : /^\d+\|/.test(s) ? 'fb-app-token' : /^\d+$/.test(s) ? 'numeric-id'
    : /^act_/.test(s) ? 'ad-account-id' : s.length < 50 ? 'short' : 'opaque')(String(v ?? ''))
  const shape = v => typeof v === 'object' && v   // DRILL into an object secret: per sub-key {size,kind}, never the value
    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, { size: String(x ?? '').length, kind: kind(x) }]))
    : { size: String(v ?? '').length, kind: kind(v) }
  // the fb token may be flat (secrets.facebook = 'EAA...') OR nested (secrets.facebook = {token|access_token, app_id, ...}).
  const fb = all?.[platform], token = fb && typeof fb === 'object' ? (fb.token || fb.access_token) : fb, picked = kind(token)
  const EXPECTED = ['facebook', 'fb_app_id', 'fb_app_secret', 'fb_client_token', 'fb_ad_account_id']
  const bad = picked !== 'opaque' && picked !== 'fb-user-token' && picked !== 'fb-app-token'   // a usable token is opaque/EAA/app-token
  // ONE redacted line: top-level fields, drill into the picked secret obj, what's missing, verdict + concrete next-action.
  ctx?.vars?.dbLogger?.[bad ? 'error' : 'info']?.({ t: 'resolveSecret', ref: secret, platform,
    fields: Object.fromEntries(Object.entries(all || {}).map(([k, v]) => [k, kind(v)])),
    [platform]: shape(fb), tokenKind: picked, missing: EXPECTED.filter(k => !(k in (all || {}))),
    ...(bad ? { hint: `secrets.${platform} token is '${picked}' — need a real ads_read fb user token (EAA…, ~200ch). reseed via fbCube.seedSecret with FB_TOKEN set, or PUT {${platform}:{token,app_id,ad_account_id}}` } : {}) }, {}, { ctx })
  return token
}
// datetime(date @ hour:00) - offset hours, as epoch ms (advertiser-tz hour → UTC)
const constructDt = (hour, offset, date) => { const d = new Date(`${date}T00:00:00Z`); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour - offset) }

// CONNECT: resolve secret (token or room-ref) → auth + discover ad accounts → ctx.vars.fbAccounts {act_<id>:{offset,status}}.
// keeps the REF (fbSecretRef), not the token, in ctx — the pull carries the ref in a header; interceptor re-resolves it.
const fbConnect = Component('fbConnect', {
  type: 'ctx-enricher<tgp>',
  params: [
    { id: 'secret', as: 'string', mandatory: true, description: 'fb access-token OR a room wUrl to secrets.json' },
    { id: 'accountIds', as: 'array', mandatory: true, description: 'the schematics account ids (VERTICAL_MAPPING.facebook keys)' }
  ],
  impl: async (ctx, {}, { secret, accountIds }) => {
    const log = ctx?.vars?.dbLogger, wanted = new Set(accountIds.filter(id => !BLOCKED.has(id)))
    const token = await resolveSecret(secret, 'facebook', ctx)
    log?.info?.({ t: 'fbConnect secretResolved', viaRoomRef: /^(signedRoom|room):/.test(secret), tokenPresent: !!token, len: token?.length || 0 }, {}, { ctx })
    const accounts = {}
    let url = `${GRAPH}/me/adaccounts?fields=id,account_status,timezone_offset_hours_utc&limit=100&access_token=${token}`
    for (let page = 0; page < 50 && url; page++) {
      const res = await getJson(url)
      for (const a of (res.data || []))
        if (wanted.has(a.id.replace('act_', ''))) accounts[a.id] = { offset: a.timezone_offset_hours_utc, status: a.account_status }
      url = res.paging?.next
    }
    log?.info?.({ t: 'fbConnect', accounts: Object.keys(accounts).length }, {}, { ctx })
    return enrichCtxWithDataContext(ctx, { vars: { fbSecretRef: secret, fbAccounts: accounts } })
  }
})

// QUERY: name each request as a CLEAN wUrl (account/period — NO token) + a header carrying the secret REF.
// ctx.vars.fbUrls = [{ url, headers }]. interceptor reads the url + resolves x-wonder-secret to the token at pull time.
const fbQuery = Component('fbQuery', {
  type: 'ctx-enricher<tgp>',
  params: [
    { id: 'period', as: 'string', mandatory: true, description: 'cube period YYYY-MM-DD' },
    { id: 'periodGranularity', as: 'string', defaultValue: 'daily', options: 'daily,hourly' }
  ],
  impl: (ctx, {}, { period, periodGranularity }) => {
    const headers = { 'x-wonder-secret': ctx.vars.fbSecretRef }, urls = []
    for (const [account, { status }] of Object.entries(ctx.vars.fbAccounts || {})) {
      if (status !== 1) continue
      urls.push({ url: `fb://ad?${new URLSearchParams({ account, period, periodGranularity })}`, headers })
    }
    // lifecycle trace #3: query produced the clean wUrls to pull. 0 urls ⇒ connect found no ACTIVE account (status!==1) or fbAccounts empty.
    ctx?.vars?.dbLogger?.info?.({ t: 'fbQuery', period, periodGranularity, accounts: Object.keys(ctx.vars.fbAccounts || {}).length, urls: urls.length, sample: urls[0]?.url }, {}, { ctx })
    return enrichCtxWithDataContext(ctx, { vars: { fbUrls: urls } })
  }
})

// facebook<insights> use-case connector: owns its wUrlPattern; bundles connect + query (local comp refs, not via dsls registry).
// secret default = the room secrets file (a REF). admin ctx resolves it; nobody else. token never in source.
Connector('facebookInsights', {
  params: [
    { id: 'secret', as: 'string', defaultValue: 'signedRoom://schematics/admin/secrets.json' },
    { id: 'accountIds', as: 'array', defaultValue: '%$accounts.facebook%' }
  ],
  impl: connector({
    wUrlPattern: 'fb://ad?account=${account}&period=${period}',
    connect: fbConnect('%$secret%', '%$accountIds%'),
    query: fbQuery('%$period%')
  })
})

// HOURLY = the breakdown that folds into dt (one row per ad-hour). the ad pull's default split.
const HOURLY = 'hourly_stats_aggregated_by_advertiser_time_zone'
// period (a cube period) → FB time_range. daily = the whole day; hourly = that single hour. the wUrl is grain-agnostic;
// periodGranularity tells us how to read `period` (YYYY-MM-DD | YYYY-MM-DD-HH) into FB's since/until contract.
const periodRange = (period, periodGranularity) => {
  const day = period.slice(0, 10)
  return { since: day, until: day }   // FB time_range is day-grained; hourly grain is expressed via the hourly breakdown→dt
}
// fbGraphPull — the shared FB Graph /insights executor used by every fb-insight-connector path. ONE (account,period) pull:
// resolve the secret REF (ACL-gated) → page /insights with the given fields+breakdowns → map rows. breakdowns=''(none)=ad-level.
// hourly breakdown folds into dt; every OTHER breakdown column is KEPT on the row (NULL=* lands later in duckdb). returns rows[].
const fbGraphPull = async (ctx, { account: raw, period, periodGranularity, fields = FB_FIELDS, breakdowns = '', secretRef, logger, split }) => {
  const account = raw.startsWith('act_') ? raw : `act_${raw}`, offset = +(ctx.vars.fbAccounts?.[account]?.offset) || 0
  const token = await resolveSecret(secretRef, 'facebook', ctx)
  const params = new URLSearchParams({ access_token: token, level: 'ad', fields: fields.join(','), time_range: JSON.stringify(periodRange(period, periodGranularity)), limit: '500' })
  if (breakdowns) params.set('breakdowns', breakdowns)
  const rows = []; let next = `${GRAPH}/${account}/insights?${params}`, fbError = null
  while (next) {
    const data = await retry(() => getJson(next))
    if (data.error) { fbError = data.error; break }
    for (const r of (data.data || [])) {
      const row = { ...r, traffic_source: 'facebook' }
      delete row.date_start; delete row.date_stop
      const hv = r[HOURLY]
      if (hv != null) { row.dt = constructDt(parseInt(String(hv).slice(0, 2), 10), offset, period.slice(0, 10)); delete row[HOURLY] }
      else if (!breakdowns) row.date = period.slice(0, 10)
      rows.push(row)
    }
    next = data.paging?.next
  }
  logger?.[fbError ? 'error' : 'info']?.({ t: fbError ? 'fbGraphPull.refused' : 'fbGraphPull', account, period, split, breakdowns: breakdowns || '(ad-level)', rows: rows.length, ...(fbError ? { fbError, verdict: 'refused-or-below-privacy-floor' } : {}) }, {}, { ctx })
  return { rows, fbError }
}


// fb://ad — one row per ad, no demographic split (hourly folds to dt). carries reach (the un-split, privacy-safe total).
FbInsightConnector('ad', {
  impl: () => ({
    pull: (ctx, { account, period, periodGranularity, secretRef, logger }) =>
      fbGraphPull(ctx, { account, period, periodGranularity, fields: [...FB_FIELDS, 'reach'], breakdowns: HOURLY, secretRef, logger, split: 'ad' })
        .then(r => r.rows)
  })
})

// the demographic splits: each a registered ad-split<fb> carrying its FB breakdowns string. fbGraphPull keeps each split's
// dimension columns on the row; the rest land NULL in the wide parquet (NULL=*). reach is non-additive → only on fb://ad.
AdSplit('ageGender', { impl: adSplit('age,gender') })
AdSplit('placement', { impl: adSplit('publisher_platform,platform_position,impression_device') })
AdSplit('country',   { impl: adSplit('country') })
AdSplit('region',    { impl: adSplit('region') })
AdSplit('dma',       { impl: adSplit('comscore_market') })   // FB retired the `dma` breakdown (#100) → comscore_market is its replacement
AdSplit('hourly',    { impl: adSplit(HOURLY) })

// fb://adBreakdown — discover every registered ad-split<fb> and fire them in PARALLEL (one /insights each). fault-isolated:
// a split FB refuses (below the ~100-person privacy floor) returns {rows:[],fbError} — logged, contributes 0 rows → partial-green.
FbInsightConnector('adBreakdown', {
  impl: () => ({
    pull: (ctx, { account, period, periodGranularity, secretRef, logger }) =>
      Promise.all(coreUtils.globalsOfType(dsls.fb['ad-split'], ctx).map(({ id, breakdowns }) =>
        fbGraphPull(ctx, { account, period, periodGranularity, breakdowns, secretRef, logger, split: id })))
        .then(results => results.flatMap(r => r.rows))
  })
})

// INTERCEPTOR (router/executor): fb://<path>?account=&period=&periodGranularity= (CLEAN — no token). matches the pathname to a
// registered fb-insight-connector comp (globalsOfType → {id,pull}) and delegates. secret arrives as the x-wonder-secret HEADER.
DbDriverInterceptor('fb', {
  impl: dbDriverInterceptor({
    pre: async (ctx, { url, driverMethod, dbLogger }) => {
      if (!url?.startsWith('fb:') || driverMethod !== 'get') return null
      const q = new URL(url.replace('fb:', 'http:')).searchParams
      const path = url.slice(5).split('?')[0].replace(/^\/*/, '')   // case-preserved from the raw url; URL would lowercase the hostname
      const account = q.get('account'), period = q.get('period'), periodGranularity = q.get('periodGranularity') || 'daily'
      const secretRef = ctx.vars.opts?.headers?.['x-wonder-secret']
      const match = coreUtils.globalsOfType(dsls.wonder['fb-insight-connector'], ctx).find(c => c.id === path)
      dbLogger?.info?.({ t: 'fb pre', path, account, period, periodGranularity, matched: !!match, hasSecretHeader: !!secretRef }, {}, { ctx })
      if (!match) return null
      const rows = await match.pull(ctx, { account, period, periodGranularity, secretRef, logger: dbLogger })
      return { ok: true, status: 200, text: async () => JSON.stringify(rows), json: async () => rows }
    }
  })
})
