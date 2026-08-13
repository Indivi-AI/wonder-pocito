import { jb } from '@jb6/repo'

Object.assign(jb, {
  coreUtils: {},
  proxies: {},
  ext: {},
  coreRegistry: {
    consts: {}
  },
  dsls: {
    tgp: { Const }
  },
  ns: {}, // proxies
  nsRepo: {} // actual comps
})

const isPrimitiveValue = val => ['string','boolean','number'].indexOf(typeof val) != -1

const calcValue = v => jb.dbUtils ? jb.dbUtils?.calcValue(v) : v
const asRef = v => jb.dbUtils ? jb.dbUtils.asRef(v) : logError('asRef. extension db/writable.js was not loaded',{})

const RT_types = {
    asIs: x => x,
    object(value) {
      if (Array.isArray(value))
        value = value[0]
      if (value && typeof value === 'object')
        return calcValue(value)
      return {}
    },
    string(value) {
      if (Array.isArray(value)) value = value[0]
      if (value == null) return ''
      value = calcValue(value)
      if (typeof(value) == 'undefined') return ''
      return '' + value
    },
    text(value) { // multi line
      if (Array.isArray(value)) value = value[0]
      if (value == null) return ''
      value = calcValue(value)
      if (typeof(value) == 'undefined') return ''
      return '' + value
    },
    number(value) {
      if (Array.isArray(value)) value = value[0]
      if (value == null || value == undefined) return null // 0 is not null
      const num = Number(calcValue(value),true)
      return isNaN(num) ? null : num
    },
    array(value) {
      if (typeof value == 'function' && value.profile)
        value = value()
      value = calcValue(value)
      if (Array.isArray(value)) return value
      if (value == null) return []
      return [value]
    },
    boolean(value) {
      if (Array.isArray(value)) value = value[0]
      value = calcValue(value)
      return value && value != 'false' ? true : false
    },
    single(value) {
      if (Array.isArray(value))
        value = value[0]
      return calcValue(value)
    },
    ref(value) {
      if (Array.isArray(value))
        value = value[0]
      return asRef(value)
    },
    'ref[]': function(value) {
      return asRef(value)
    },
    value(value) {
      return calcValue(value)
    }
}

const isRefType = jstype => jstype === 'ref' || jstype === 'ref[]'

function resolveFinishedPromise(val) {
    if (val && typeof val == 'object' && val._state == 1) // finished promise
      return val._result
    return val
}

const unique = (ar,f) => {
    const keys = {}, res = []
    ar.forEach(x =>{
      const key = f ? f(x) : x
      if (!keys[key]) res.push(x)
      keys[key] = true
    })
    return res
}
const isPromise = v => v && v != null && typeof v.then === 'function'

// dataContext = { data?, vars? } | Ctx | Promise<dataContext> | null
// Applies a dataContext to ctx. Stays sync when nothing inside is a promise.
function enrichCtxWithDataContext(ctx, dc) {
  if (!dc) return ctx
  if (dc instanceof jb.coreUtils.Ctx) return dc
  if (isPromise(dc))                  return dc.then(r => enrichCtxWithDataContext(ctx, r))
  if (dc.vars && isPromise(dc.vars))  return dc.vars.then(v => enrichCtxWithDataContext(ctx, { ...dc, vars: v }))

  const varEntries = dc.vars ? Object.entries(dc.vars) : []
  const dataIsPromise = isPromise(dc.data)
  const anyVarPromise = varEntries.some(([,v]) => isPromise(v))

  if (!dataIsPromise && !anyVarPromise) {
    let next = ctx
    if (dc.data !== undefined) next = next.setData(dc.data)
    if (varEntries.length)     next = next.setVars(dc.vars)
    return next
  }

  return Promise.all(varEntries.map(([k,v]) => isPromise(v) ? v.then(r => [k,r]) : [k,v]))
    .then(async resolved => {
      let next = ctx
      if (dc.data !== undefined) next = next.setData(dataIsPromise ? await dc.data : dc.data)
      if (varEntries.length)     next = next.setVars(Object.fromEntries(resolved))
      return next
    })
}

function compIdOfProfile(profile) {
  if (typeof profile.$$ == 'string') return profile.$$
  if (typeof profile.$ == 'string' && profile.$.match(/^[^<]+<[^>]+>.+/)) return profile.$
  const comp = profile.$$ || profile.$
  return `${comp.$dslType}${comp.id}`
}

const compParams = comp => comp?.params || []
const parentPath = path => path.split('~').slice(0,-1).join('~')

const asArray = v => v == null ? [] : (Array.isArray(v) ? v : [v])
const toArray = RT_types.array
const toString = RT_types.string
const toNumber = RT_types.number
const toSingle = RT_types.single
const toJstype = (val,type) => RT_types[type](val)

// pre-boot fallback: jb-logging.js overrides coreUtils.log to route errors through the always-on errorLogger.
// Until that module loads, log() is a no-op so early logError/logException calls are safe.
function log(logNames, logObj) {}

function logError(err,logObj) {
  const { ctx, url, line, col } = logObj || {}
  const { jbCtx: { dynamicStack, lexicalStack }} = ctx || { jbCtx: {} }
  const srcLink = url && globalThis.window ? `${window.location.origin}${url}:${line+1}:${col} ` : ''
  globalThis.window && globalThis.console.error(srcLink+'%c Error: ','color: red', err, logObj, dynamicStack, lexicalStack)
  const errObj = { err , ...logObj, dynamicStack, lexicalStack}
  logVsCode('error', stripData(errObj))
  log('error', {...errObj, ctx})   // -> errorLogger.error, the always-on auto-fail gate
}

function logException(e,err,logObj) {
  globalThis.window && globalThis.console.log('%c Exception: ','color: red', err, e, logObj)
  const errObj = { message: e.message, err, stack: e.stack||'', ...logObj }
  globalThis.process?.stderr?.write(`${err}\n${e}`)
  logVsCode('exception', stripData(errObj))
  log('exception error', {...errObj, error: e})   // error: e -> enrichParams extracts e.stack; routed to errorLogger.error
}

function Const(id, val) {
  const passiveSym = Symbol.for('passive')
  jb.coreRegistry.consts[id] = markAsPassive(val || {})

  function markAsPassive(obj) {
      if (obj && typeof obj == 'object') {
          obj[passiveSym] = true
          Object.values(obj).forEach(v=>markAsPassive(v))
      }
      return obj
  }    
}

function calcPath(object,_path,value) {
  if (!object) return object
  let cur = object
  if (typeof _path === 'string') _path = _path.split('.')
  _path = asArray(_path)

  if (typeof value == 'undefined') {  // get
    return _path.reduce((o,k)=>o && o[k], object)
  } else { // set
    for(let i=0;i<_path.length;i++)
      if (i == _path.length-1)
        cur[_path[i]] = value
      else
        cur = cur[_path[i]] = cur[_path[i]] || {}
    return value
  }
}

function splitDslType(dslType) {
  return dslType.match(/^([^<]+)<([^>]+)>$/).slice(1)
}

const delay = (mSec,res) => new Promise(r=>setTimeout(()=>r(res),mSec))

function isDelayed(v) {
  if (!v || v.constructor === {}.constructor || Array.isArray(v)) return
  return typeof v === 'object' ? isPromise(v) : typeof v === 'function' && isCallbag(v)
}

function waitForInnerElements(item, {passRx} = {}) { // resolve promises in array and double promise (via array), passRx - does not wait for reactive data to end, and pass it as is
  if (isPromise(item))
    return item.then(r=>waitForInnerElements(r,{passRx}))
  if (!passRx && isCallbag(item))
    return callbagToPromiseArray(item)

  if (Array.isArray(item)) {
    if (! item.find(v=> isCallbag(v) || isPromise(v))) return item
    if (passRx && ! item.find(v=>isPromise(v))) return item
    return Promise.all(item.map(x=>waitForInnerElements(x,{passRx}))).then(items=>items.flatMap(x=>x))
  }
  return item
}

const isCallbag = cb => typeof cb == 'function' && cb.toString && cb.toString().split('=>')[0].split('{')[0].replace(/\s/g,'').match(/start,sink|t,d/)
const callbagToPromiseArray = source => new Promise(resolve => {
  let talkback
  const res = []
  source(0, function toPromiseArray(t, d) {
    if (t === 0) talkback = d
    if (t === 1) res.push(d && d.vars ? d.data : d)
    if (t === 2) resolve(res)
    if (t === 1 || t === 0) talkback(1)  // Pull
  })
})

const subscribe = (source, callback) => {
  let talkback
  source(0, function subscribe(t, d) {
    if (t === 0) talkback = d
    if (t === 1) callback(d)
    if (t === 1 || t === 0) talkback(1)  // Pull
  })
}

const isObject = o => o != null && typeof o === 'object'
const isEmpty = o => Object.keys(o).length === 0

function objectDiff(newObj, orig) {
    if (orig === newObj) return {}
    if (!isObject(orig) || !isObject(newObj)) return newObj
    const deletedValues = Object.keys(orig).reduce((acc, key) =>
        newObj.hasOwnProperty(key) ? acc : { ...acc, [key]: '__undefined'}
    , {})

    return Object.keys(newObj).reduce((acc, key) => {
      if (!orig.hasOwnProperty(key)) return { ...acc, [key]: newObj[key] } // return added r key
      const difference = objectDiff(newObj[key], orig[key])
      if (isObject(difference) && isEmpty(difference)) return acc // return no diff
      return { ...acc, [key]: difference } // return updated key
    }, deletedValues)
}

function compareArrays(arr1, arr2) {
  if (arr1 === arr2)
    return true
  if (!Array.isArray(arr1) && !Array.isArray(arr2)) return arr1 === arr2
  if (!arr1 || !arr2 || arr1.length != arr2.length) return false
  for (let i = 0; i < arr1.length; i++) {
    const key1 = (arr1[i]||{}).key, key2 = (arr2[i]||{}).key
    if (key1 && key2 && key1 === key2 && arr1[i].val === arr2[i].val)
      continue
    if (arr1[i] !== arr2[i]) return false
  }
  return true
}

function sortedArraysDiff(newArr, oldArr, compareFn) {
  const inserted = [], updated  = [], deleted  = []
  let i = 0, j = 0

  while (i < oldArr.length || j < newArr.length) {
    if (i >= oldArr.length) {
      inserted.push(...newArr.slice(j))
      break
    }
    if (j >= newArr.length) {
      deleted.push(...oldArr.slice(i))
      break
    }

    const a = oldArr[i]
    const b = newArr[j]
    const cmp = compareFn(a, b)

    if (cmp < 0) {           // a < b  → present only in oldArr
      deleted.push(a)
      i++
    } else if (cmp > 0) {    // a > b  → present only in newArr
      inserted.push(b)
      j++
    } else {                 // same key
      i++
      j++
    }
  }

  return { inserted, updated, deleted }
}

function logVsCode(...args) {
  if (globalThis.jbVSCodeLog)
    globalThis.jbVSCodeLog(...args)
}

const isNode = globalThis.process?.versions?.node

const ignorePaths = ['vars.react']

function stripData(value, { MAX_OBJ_DEPTH = 100, MAX_ARRAY_LENGTH = 10000, reshowVisited } = {}) {  
  const visited = new WeakMap()
  return _strip(value, 0, '')

  function _strip(data, depth, path) {
    if (ignorePaths.some(x => path.endsWith(x))) return
    if (data == null) return data
    if (isPrimitiveValue(data))
      return data
    if (typeof data === 'function')
      return `[Function] ${data.toString && data.toString()}`
    if (depth > MAX_OBJ_DEPTH)
      return `[Max depth reached at ${path}]`
    if (!reshowVisited && typeof data === 'object') {
      if (visited.has(data)) {
        return `[jbReference: ${visited.get(data)}]`
      }
      visited.set(data, path || '<root>')
    }
    if (Array.isArray(data)) {
      const source = data[Symbol.for('bigData')]
      if (source && data.length > 10)
        return [...data.slice(0, 3).map((item, i) => _strip(item, depth + 1, path ? `${path}.${i}` : `${i}`)), {$truncated: true, total: data.length, source}]
      if (data.length > MAX_ARRAY_LENGTH)
        data = data.slice(0, MAX_ARRAY_LENGTH)
      return data.map((item, i) => _strip(item, depth + 1, path ? `${path}.${i}` : `${i}`))
    }
    if (data instanceof Error)
      return { $$: 'Error', stack: data.stack || data.message }
    if (typeof data.$stripData === 'function') return data.$stripData()
    if (typeof data === 'object' && data.constructor && data.constructor?.name !== 'Object')
      return { $$: data.constructor.name }
    if (typeof data === 'object') {
      return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, _strip(v, depth + 1, path ? `${path}.${k}` : k) ]))
    }
    return data
  }
}

function squeeze(obj, {k = 30} = {}) {
  if (typeof obj !== 'object' || obj === null) return obj
  if (Array.isArray(obj))
    return obj.length <= k*2 ? obj.map(v => squeeze(v, {k}))
      : [...obj.slice(0,k), `${obj.length - k*2} items were here`, ...obj.slice(-k)].map(v => squeeze(v, {k}))
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, squeeze(value, {k})]))
}

function resolveRefs(obj, root = obj, visited = new WeakSet()) {
  if (typeof obj === 'string') {
    const match = obj.match(/^\[jbReference: ([^\]]+)\]$/)
    if (match)
      return match[1] === '<root>' ? root : calcPath(root, match[1])
  }
  if (obj === null || typeof obj !== 'object' || visited.has(obj)) return obj
  visited.add(obj)

  if (Array.isArray(obj)) return obj.map(v => resolveRefs(v, root, visited))
  return Object.fromEntries(Object.entries(obj).map(e=>[e[0],resolveRefs(e[1], root, visited)]))
}

const estimateTokens = t => Math.ceil(((t.match(/\b\w+\b/g)||[]).length)*1.3)
function pathJoin(...segments) {
  const path = segments.filter(s => s).join('/').replace(/\/+/g, '/')
  const parts = path.split('/').filter(p => p !== '.')
  const result = []
  
  for (const part of parts) {
    if (part === '..') result.pop()
    else if (part) result.push(part)
  }
  
  const joined = result.join('/')
  return path.startsWith('/') ? '/' + joined : joined || '.'
}

function pathParent(path) {
  const i = path.replace(/\/+$/, '').lastIndexOf('/')
  return i <= 0 ? (i === 0 ? '/' : '.') : path.substring(0, i)
}

const deepMapValues = (obj, mapFunc, condition = () => true, path = '') => {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return obj
  const res = Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [ key, condition(value, key, obj,path) ? mapFunc(value, key, obj,path) 
        : typeof value === 'object' && value !== null && !Array.isArray(value) ? deepMapValues(value, mapFunc, condition, [path,key].join('~'))
        : value
    ]))

  return res
}

const omitProps = (obj, keys) => {
  const keySet = new Set(Array.isArray(keys) ? keys : [keys])
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keySet.has(key))
  )
}
const omitEmptyProps = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)))

function calcHash(str) {
  let hash = 0, i, chr;
  if (str.length === 0) return hash
  for (i = 0; i < str.length; i++) {
      chr = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
  }
  return hash
}

const SERVICE_RESULT_FILE_THRESHOLD = 40000

async function writeServiceResult(result, _httpReqId) {
  const httpReqId = _httpReqId || globalThis.httpReqId
  if (httpReqId)
    return httpRequests[httpReqId].res.json(result)   // HTTP response has no stdout-buffer limit → always inline

  const res = JSON.stringify(result, null, 2)
  if (res.length < SERVICE_RESULT_FILE_THRESHOLD) {   // small → inline on stdout, the fast path parseServiceResult reads directly
    process.stdout.write(res)
    return process.exit(0)
  }

  // big → write to /tmp and emit only a small self-describing envelope. parseServiceResult resolves+deletes the file.
  const os = await import('os'), pathMod = await import('path'), fs = await import('fs')
  const path = pathMod.join(os.tmpdir(), `jb-service-result-${process.pid}-${calcHash(res)}.json`)
  fs.writeFileSync(path, res)
  process.stdout.write(JSON.stringify({ $jbResultFile: path, description: 'large stdout saved to tmp file', fileSize: res.length }))
  process.exit(0)
}

// Decoder mirroring writeServiceResult: parse child stdout, and if it's a {$jbResultFile} envelope
// read+parse that tmp file then best-effort delete it. Node-only file access; small results parse inline.
async function parseServiceResult(out) {
  const parsed = JSON.parse(out)
  if (!parsed || typeof parsed !== 'object' || !parsed.$jbResultFile) return parsed
  const fs = await import('fs')
  const result = JSON.parse(fs.readFileSync(parsed.$jbResultFile, 'utf8'))
  // try { fs.unlinkSync(parsed.$jbResultFile) } catch {}   // TEMP: keep tmp files for inspection during testing
  return result
}

function broadcastStatus(text) {
  globalThis.process && globalThis.process.stderr.write(text)
}

const eventEmitter = {
  listeners: {},
  emit(event, data) { this.listeners[event]?.forEach(fn => fn(data)) },
  on(event, fn) { (this.listeners[event] ??= []).push(fn) },
  off(event, fn) { this.listeners[event] = this.listeners[event]?.filter(f => f !== fn) || [] }
}

Object.assign(jb.coreUtils, {
  jb, RT_types, log, logError, logException, logVsCode, isNode,
  isPromise, isPrimitiveValue, isRefType, resolveFinishedPromise, unique, asArray, toArray, toString, toNumber, toSingle, toJstype, deepMapValues, omitProps, omitEmptyProps,
  enrichCtxWithDataContext, compIdOfProfile, compParams, parentPath, calcPath, splitDslType,
  delay, isDelayed, waitForInnerElements, isCallbag, callbagToPromiseArray, subscribe, objectDiff, sortedArraysDiff, compareArrays,
  calcValue, stripData, squeeze, resolveRefs, estimateTokens, pathJoin, pathParent, calcHash, writeServiceResult, parseServiceResult, broadcastStatus, eventEmitter
})
