export const formatDay = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const formatTime = d => [d.getFullYear(), d.getMonth()+1, d.getDate(), d.getHours(), d.getMinutes()]
  .map((x,i) => i ? String(x).padStart(2,'0') : x).concat(d.getMilliseconds()).join('-')
const randomUniqueId = () => Math.random().toString(36).slice(2, 11)
export const formatTimeWithRandom = () => `${formatTime(new Date())}-${randomUniqueId()}`
const userId = globalThis.userId || 'anon'
const userName = userId

const sessionId = `${userId}-${formatTime(new Date())}`
let batchCounter = 0

export const betaUsersForWhatsAppLinking = [ '109212704944489416263', '116773885157576287176' ]
import { coreUtils, dsls } from '@jb6/core'

export const storagePrefix =  'https://storage.googleapis.com'
export const wonderBucketName = 'indiviai-wonder'

export function serversByUrl(ctx) {
  const window = globalThis.window || { location: {hostname: '', pathname: '', search: '', hash: ''}, innerWidth: 0, navigator: { userAgent: ''} } || null
  const isLocalHost = ctx?.vars.isLocalHost !== undefined ? ctx.vars.isLocalHost
    : globalThis.builtIn?.localhost || window?.location.hostname === 'localhost' || window?.location.hostname?.startsWith('192.168')
  const _pathSeg = window?.location.pathname?.split('/')[1]   // a versioned app path uses it; a w*.html entry or the /room/:roomId/applet shell must NOT — it's not a version
  const version = globalThis.builtIn?.wonderVersion?.versionId || ctx?.vars.wonderVersion
    || (_pathSeg && !_pathSeg.endsWith('.html') && _pathSeg !== 'room' ? _pathSeg : 'latestVersion')
  const db = ctx?.vars.db || Object.fromEntries([...new URLSearchParams(window?.location.search), ...new URLSearchParams(window?.location.hash.replace(/^#/, '?'))]).db
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window?.navigator.userAgent) || window?.innerWidth < 768
  const localhostServer = globalThis.builtIn?.window?.url || 'http://localhost:3000'
  return {
    isLocalHost, version, isMobile, db, localhostServer,
    lambdaServerBase: isLocalHost ? `${localhostServer}` : window?.location?.hostname === 'staging.indivi.ai' ? window.location.origin : 'https://wonder-lambda-me-west1.indivi.ai',
    llmProxyUrl: ctx?.vars.llmProxyUrl
      || (ctx?.vars.runningAsAutomation ? `http://localhost:${globalThis.process?.env?.PORT || 8080}/llmProxy`
          : (ctx?.vars.localProxy || isLocalHost) ? `${localhostServer}/llmProxy`
          : 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'),
    searchServer: isLocalHost ? `${localhostServer}/a/similaritySearch`
      : `https://node25-automations-server${ctx?.vars.isStaging ? '-staging' : ''}-365199207445.me-west1.run.app/a/${version}/similaritySearch`,
    filterServer: (ctx?.vars.localProxy || isLocalHost) ? `${localhostServer}/process-file`
      : 'https://node25-automations-server-365199207445.me-west1.run.app/process-file',
    wonderServer: isLocalHost ? `${localhostServer}/a` : window?.location?.hostname === 'staging.indivi.ai' ? `${window.location.origin}/a/${version}`
      : `https://node25-automations-server${ctx?.vars.isStaging ? '-staging' : ''}-365199207445.me-west1.run.app/a/${version}`,
    // signed-url is served ONLY by staging (no prod signed-url route) — so it's unconditional, never gated on isStaging.
    signedUrlServer: `https://node25-automations-server-staging-365199207445.me-west1.run.app/signed-url`,
    gcsProxyBase: isLocalHost ? localhostServer : window?.location?.hostname === 'staging.indivi.ai' ? window.location.origin
      : 'https://node25-automations-server-365199207445.me-west1.run.app'
  }
}

const extractError = obj => Object.fromEntries(
  Object.entries(obj).flatMap(([k,v]) => 
    v instanceof Error ? [[`${k}Name`,v.name], [`${k}Message`,v.message], [`${k}Stack`,v.stack], [k,v.toString()]] : [[k,v]]
  )
)

const STORAGE_KEY = 'pendingLogs'
const logBuffer   = []
let   lastFlush   = Date.now()
const MAX_BYTES = 50_000
const FLUSH_MS  = 30_000

;(function loadUnsent () {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (raw) logBuffer.push(...JSON.parse(raw))
  } catch {}
})();

function calcSessionId(ctx) {
  return ctx?.vars.sessionId || ctx?.vars.testSessionId || globalThis.sessionId || globalThis.vmId || sessionId
}


export function setHashUrl(appletId, roomId) {
  const params = new URLSearchParams(location.hash.replace(/^#/, '?'))
  params.set('applet', appletId)
  roomId && params.set('roomId', roomId)
  window.location.hash = `#${params.toString()}`
}

export const logger = {
  info: (logRecord, heavyOrSensitiveRecord, nonSerializableDebuggerRecord) => logEvent('info', logRecord, heavyOrSensitiveRecord, nonSerializableDebuggerRecord),
  error: (logRecord, heavyOrSensitiveRecord, nonSerializableDebuggerRecord) => logEvent('error', extractError(logRecord), heavyOrSensitiveRecord, nonSerializableDebuggerRecord), 
  warning: (logRecord, heavyOrSensitiveRecord, nonSerializableDebuggerRecord) => logEvent('warning', logRecord, heavyOrSensitiveRecord, nonSerializableDebuggerRecord),
  log: (logRecord, heavyOrSensitiveRecord, nonSerializableDebuggerRecord) => logEvent('info', logRecord, heavyOrSensitiveRecord, nonSerializableDebuggerRecord),
}


function logEvent(severity, logRecord = {}, heavyOrSensitiveRecord = {}, debuggerRecord = {}) {
  if (!logRecord || !heavyOrSensitiveRecord || !debuggerRecord)
    return console.error('missing log parameter. please provide 3 logRecord, heavyOrSensitiveRecord, debuggerRecord', logRecord, heavyOrSensitiveRecord, debuggerRecord)
  const {ctx, ...nonSerializableDebuggerRecord } = debuggerRecord
  if (heavyOrSensitiveRecord.ctx)
    return console.error('ctx in second param, please put ctx only in 3rd param')

  const sessionId = calcSessionId(ctx)
  const allArgs = {...logRecord, ...heavyOrSensitiveRecord, ...debuggerRecord}
  if (severity === 'error' && !coreUtils.isNode)
    console.error(allArgs)
  const {isLocalHost} = serversByUrl(ctx)
  if (isLocalHost && !globalThis.vmId && !ctx?.vars.sessionId) return
  if (ctx?.vars.doNotWriteLogs) return

  const logEntry = { severity, sessionId, userName, timestamp: Date.now(), ...logRecord }
  if (logRecord.immediate || severity == 'error') {
    const logsToSend = [...logBuffer.splice(0), logEntry]
    batchCounter++
    return doWriteLogs(logsToSend, sessionId, ctx)
  } else {
    logBuffer.push(logEntry)
    try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(logBuffer)) } catch {}
    maybeFlush(false, ctx)
  }
}

async function doWriteLogs(logsToSend, sessionId, ctx) {
  const counter = ctx?.vars.batchCounter || batchCounter
  const today = formatDay(new Date())
  const enrichedLogs = logsToSend.map(log => ({ clientIP: ctx?.vars?.clientIP, ...log }))
  const fileName = `r${today}/${sessionId}#${counter}`
  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/logs-bucket-me-west1/o?uploadType=media&name=${encodeURIComponent(fileName)}`
  return fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(enrichedLogs, null, 2) })
      .then(x=>x.text())
      //.then(x=>console.log(x))
      .catch(e => console.log(e))
}

function maybeFlush (force = false, ctx) {
  if (!logBuffer.length) return
  const sessionId = calcSessionId(ctx)
  const oversize = JSON.stringify(logBuffer).length > MAX_BYTES
  const overtime = Date.now() - lastFlush > FLUSH_MS
  if (!force && !oversize && !overtime) return
  batchCounter++
  const logsToSend = logBuffer.splice(0)
  doWriteLogs(logsToSend, sessionId, ctx)
}

const flushOnExit = () => {
  const { isLocalHost, logServer } = serversByUrl() // to fix
  if (isLocalHost || !logBuffer.length) return
  try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(logBuffer)) } catch {}
  navigator.sendBeacon(logServer, JSON.stringify(logBuffer))
}

if (!coreUtils.isNode) {
  // const intervalId = setInterval(maybeFlush, FLUSH_MS)
  // globalThis.vmCleanup?.push(() => clearInterval(intervalId))

  window.addEventListener('pagehide', flushOnExit)
  window.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushOnExit())

  // window.addEventListener('error', e => logEvent('error', { t: e.message, msg: e.message, file: e.filename, line: e.lineno, col: e.colno, 
  //   errorName: e.error?.name, errorMessage: e.error?.message, errorStack: e.error?.stack }, {}, {}), true)
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason
    logEvent('error', { t: 'unhandledRejection', reasonType: r?.constructor?.name, errorName: r?.name, errorMessage: r?.message, errorStack: r?.stack, reason: String(r) }, {}, {} )
  })
}


export const createShortUrl = async (longUrl, alias, ctx) => {
  const baseUrl = location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://share.indivi.ai'
  const { isLocalHost } = serversByUrl(ctx)
  
  if (isLocalHost) {
    const url = new URL(longUrl)
    const hashParams = new URLSearchParams(url.hash.slice(1))
    hashParams.delete('noAuth')
    const cleanHash = hashParams.toString() ? `#${hashParams.toString()}` : ''
    longUrl = url.origin + '/wonder.html' + url.search + cleanHash
  }
  
  try {
    const response = await fetch(`${baseUrl}/create-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: longUrl, alias })
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const { shortUrl } = await response.json()
    return `${baseUrl}/s/${shortUrl}`
  } catch (error) {
    logger.error({t: 'createShortUrlFailed', error: error.stack}, {}, {ctx})
    return longUrl
  }
}
globalThis.lastShare = null

export const shareHandler = async (shareData) => {
  lastShare = shareData
  if (navigator.share) {
    return navigator.share(shareData)
  }
}

export function encode(text) {
  if (typeof Buffer !== 'undefined') return Buffer.from(text, 'utf-8')
  if (globalThis.TextEncoder) return new TextEncoder().encode(text)
  if (globalThis.builtIn?.util) return new globalThis.builtIn.util.TextEncoder().encode(text)
  throw new Error('No text encoder available')
}
