import { jb } from '@jb6/repo'
import './core-utils.js'
const { coreUtils } = jb

// browserSpy = the browser in-memory log buffer (the live log-viewer's store + search()). It is NOT the test gate. Tests read the
// logger INSTANCES in ctx.vars (ctx.vars.xxLogger.xxLog / .xxErrors, harvested via logsAndErrors). Every domain .error() tees
// into the always-on errorLogger, and the tester auto-FAILS on any errorLogger.errorErrors entry unless the test sets allowError.
// domainLogger (jb-logging.js) feeds every channel into log() here so the live viewer can render/search the same stream.

let enabled = false, spyParam, _obs, enrichers = []
const logs = []
let counters = {}, locations = {}
let includeLogs = {error: true}
const settings = {
    stackFilter: /spy|jb_spy|Object.log|rx-comps|jb-core|node_modules/i,
    MAX_LOG_SIZE: 10000
}

export const browserSpy = jb.ext.browserSpy = coreUtils.browserSpy = { logs, clear, log, setLogs, initSpy, initSpyByUrl, registerEnrichers, search, isEnabled: () => enabled }

export function initSpy({spyParam: _spyParam}) {
    if (!_spyParam) return
    spyParam = _spyParam
    enabled = true
    _obs = _obs || jb.ext.callbag?.subject()
    calcIncludeLogsFromSpyParam()
    return browserSpy
}

export function initSpyByUrl() {
    const params = globalThis.location ? Object.fromEntries([...new URLSearchParams(location.search),...new URLSearchParams(location.hash.replace(/^#/, '?'))]) : {}
    const spyParam = params.browserSpy || params.spy || params.logger || ''
    const res = initSpy({spyParam: spyParam ? 'all' : '' })
    if (res) globalThis.spy = browserSpy
    return res
}

const memoryUsage = () => globalThis.performance?.memory?.usedJSHeapSize

function setLogs(_spyParam) {
    enabled = true
    spyParam = _spyParam
    calcIncludeLogsFromSpyParam()
}

function calcIncludeLogsFromSpyParam() {
    const includeLogsFromParam = (spyParam || '').split(',').filter(x => x[0] !== '-').filter(x => x)
    const excludeLogsFromParam = (spyParam || '').split(',').filter(x => x[0] === '-').map(x => x.slice(1))
    includeLogs = includeLogsFromParam.filter(log => excludeLogsFromParam.indexOf(log) === -1).reduce((acc, log) => {
        acc[log] = true
        return acc
    }, {})
    includeLogs.error = true
}

function shouldLog(logNames, record) {
    const ctx = record && (record.ctx || record.srcCtx || record.cmp && record.cmp.ctx)
    if (ctx && ctx.vars.$disableLog || record.m?.$disableLog || record.m?.remoteRun.vars.$disableLog) return false
    if ((record.m?.routingPath||[]).find(y=>y.match(/vDebugger/))
        || (record.m?.result?.uri || '').match(/vDebugger/)) return false
    if (!logNames) debugger
    return spyParam === 'all' || typeof record == 'object' &&
        logNames.split(' ').reduce( (acc,logName)=>acc || includeLogs[logName],false)
}

export function log(logNames, _record, {takeFrom} = {}) {
    updateCounters(logNames)
    updateLocations(logNames,takeFrom)
    if (!shouldLog(logNames, _record)) return
    const now = new Date()
    const index = logs.length
    const { jbCtx: { dynamicStack, lexicalStack }} = _record?.ctx || {jbCtx:{}}
    const record = {
        logNames,
        ..._record,
        index,
        source: source(takeFrom),
        _time: `${now.getSeconds()}:${now.getMilliseconds()}`,
        mem: memoryUsage() / 1000000,
        dynamicStack, lexicalStack,
        activeElem: globalThis.document?.activeElement,
        $attsOrder: _record && Object.keys(_record),
        time: now.getTime()
    }
    if (logs.length > 0 && globalThis.document?.activeElement != logs[index-1].activeElem) {
        logs[index-1].logNames += ' focus'
        logs[index-1].activeElemAfter = record.activeElem
        logs[index-1].focusChanged = true
    }

    logs.push(record)
    if (logs.length > settings.MAX_LOG_SIZE *1.1)
        logs.splice(0, logs.length - settings.MAX_LOG_SIZE)
    _obs?.next(record)
}

function source(takeFrom) {
    if (globalThis.Error)
        globalThis.Error.stackTraceLimit = 50
    const frames = [globalThis]
    let stackTrace = frames.reverse().filter(f=>frameAccessible(f)).map(frame => new frame.Error().stack).join('\n').split(/\r|\n/).map(x => x.trim()).slice(4).
        filter(line => line !== 'Error').
        filter(line => !settings.stackFilter.test(line))
    if (takeFrom) {
        const firstIndex = stackTrace.findIndex(line => line.indexOf(takeFrom) !== -1)
        stackTrace = stackTrace.slice(firstIndex + 1)
    }
    const line = stackTrace[0] || ''
    const res = [
        line.split(/at |as /).pop().split(/ |]/)[0],
        line.split('/').pop().slice(0, -1).trim(),
        ...stackTrace
    ]
    res.location = line.split(' ').slice(-1)[0].split('(').pop().split(')')[0]
    return res

    function frameAccessible(frame) { try { return Boolean(frame.document || frame.contentDocument || frame.global) } catch(e) { return false } }
}

function updateCounters(logNames) {
    counters[logNames] = counters[logNames] || 0
    counters[logNames]++
}

function updateLocations(logNames) {
    locations[logNames] = locations[logNames] || source().location
}

function clear() {
    logs.splice(0, logs.length)
    counters = {}
}

function enrichRecord(rec) {
    if (!rec.$ext) {
        rec.$ext = { sections: [], props: {}}
        enrichers.forEach(f=> {
            const ext = f(rec)
            if (ext) {
                ext.sections && (rec.$ext.sections = [...rec.$ext.sections, ...ext.sections])
                ext.props && Object.assign(rec.$ext.props, ext.props)
            }
        })
    }
    return {log: rec.logNames, ...rec.$ext.props,
        ...Object.fromEntries(Object.keys(rec).filter(k=>!rec.$ext.props[k]).map(k=>[k,rec[k]])) }
}

function registerEnrichers(_enrichers) {
    enrichers = [...enrichers, ..._enrichers]
}

function search(query = '',{slice = -1000, enrich = true} = {}) {
    const _or = query.toLowerCase().split(/,|\|/)
    return _or.reduce((acc,exp) =>
        unify(acc, exp.split(' ').reduce((acc,logNameExp) => filter(acc,logNameExp), logs.slice(slice)))
    ,[]).map(x=>enrich ? enrichRecord(x) : x)

    function filter(set,exp) {
        return (exp[0] == '!')
            ? set.filter(rec=>rec.logNames.toLowerCase().indexOf(exp.slice(1)) == -1)
            : set.filter(rec=>rec.logNames.toLowerCase().indexOf(exp) != -1)
    }
    function unify(set1,set2) {
        let res = [...set1,...set2].sort((x,y) => x.index < y.index)
        return res.filter((r,i) => i == 0 || res[i-1].index != r.index)
    }
}
