import { coreUtils, dsls, ns, jb } from '@jb6/core'

const { logError, isPromise, calcPath, ensureLoggers } = coreUtils
const {
  tgp: { TgpType, any: {If } },
  rx: { ReactiveOperator, ReactiveSource,
  },
} = dsls
const { rx } = ns

const { detailedRxLogger } = ensureLoggers('detailedRxLogger').vars   // jbLog helper runs inside callbags without ctx

const ReactiveSink = TgpType('reactive-sink', 'rx')

ReactiveOperator('rx.innerPipe',{
  description: 'composite operator, inner reactive pipeline without source',
  params: [
    {id: 'elems', type: 'reactive-operator[]', as: 'array', mandatory: true, templateValue: []}
  ],
  impl: (ctx, {}, {elems}) => source => jb.rxUtils.pipe(source, ...elems)
})

ReactiveOperator('rx.fork',{
  description: 'separate operator with same source data',
  params: [
    {id: 'elems', type: 'reactive-operator[]', as: 'array', mandatory: true, templateValue: []}
  ],
  impl: (ctx, {}, {elems}) => jb.rxUtils.fork(...elems)
})

ReactiveOperator('rx.vars', {
  description: 'define an immutable variables that can be used later in the pipe',
  params: [
    {id: 'Vars', dynamic: true}
  ],
  impl: (ctx, {}, {Vars}) => source => (start, sink) => {
    if (start != 0) return
    return source(0, function VarsFunc(t, d) {
      sink(t, t === 1 ? d && {data: d.data, vars: {...d.vars, ...Vars(d)}} : d)
    })
  }
})

ReactiveOperator('rx.resource', {
  description: 'define a static mutable variable that can be used later in the pipe',
  params: [
    {id: 'name', as: 'string', dynamic: true, mandatory: true, description: 'if empty, does nothing'},
    {id: 'value', dynamic: true, mandatory: true}
  ],
  impl: If('%$name%', (ctx, {}, {name, value}) => source => (start, sink) => {
    if (start != 0) return
    let val, calculated
    return source(0, function Var(t, d) {
      val = calculated ? val : value()
      calculated = true
      sink(t, t === 1 ? d && {data: d.data, vars: {...d.vars, [name()]: val}} : d)
    })
  })
})

ReactiveOperator('rx.reduce',{
  description: 'scan. incrementally aggregates/accumulates data in a variable, e.g. count, concat, max, etc',
  params: [
    {id: 'varName', as: 'string', mandatory: true, description: 'the result is accumulated in this var', templateValue: 'acc'},
    {id: 'initialValue', dynamic: true, description: 'receives first value as input', mandatory: true},
    {id: 'value', dynamic: true, defaultValue: '%%', description: 'the accumulated value use %$acc%,%% %$prev%', mandatory: true},
    {id: 'avoidFirst', as: 'boolean', description: 'used for join with separators, initialValue uses the first value without adding the separtor'}
  ],
  impl: (ctx, {}, {varName, initialValue, value, avoidFirst}) => source => (start, sink) => {
    if (start !== 0) return
    let acc, prev, first = true
    source(0, function reduce(t, d) {
      if (t == 1) {
        if (first) {
          acc = initialValue(d)
          first = false
          if (!avoidFirst)
            acc = value({data: d.data, vars: {...d.vars, [varName]: acc}})
        } else {
          acc = value({data: d.data, vars: {...d.vars, prev, [varName]: acc}})
        }
        sink(t, acc == null ? d : {data: d.data, vars: {...d.vars, [varName]: acc}})
        prev = d.data
      } else {
        sink(t, d)
      }
    })
  }
})

ReactiveOperator('rx.count',{
  params: [
    {id: 'varName', as: 'string', mandatory: true, defaultValue: 'count'}
  ],
  impl: rx.reduce('%$varName%', 0, {value: (ctx, {}, {varName}) => ctx.vars[varName] + 1})
})

ReactiveOperator('rx.join',{
  params: [
    {id: 'varName', as: 'string', mandatory: true, defaultValue: 'join'},
    {id: 'separator', as: 'string', defaultValue: ','}
  ],
  impl: rx.reduce('%$varName%', '%%', {
    value: (ctx, {}, {varName, separator}) => [ctx.vars[varName], ctx.data].join(separator),
    avoidFirst: true
  })
})

ReactiveOperator('rx.max', {
  params: [
    {id: 'varName', as: 'string', mandatory: true, defaultValue: 'max'},
    {id: 'value', dynamic: true, defaultValue: '%%'}
  ],
  impl: rx.reduce('%$varName%', -Infinity, {
    value: (ctx, {}, {varName, value}) => Math.max(ctx.vars[varName], value(ctx))
  })
})

ReactiveOperator('rx.distinct',{
  description: 'filters unique values',
  category: 'filter',
  params: [
    {id: 'key', as: 'string', dynamic: true, defaultValue: '%%'}
  ],
  impl: (ctx, {}, {key}) => jb.rxUtils.distinct(addDebugInfo(ctx2 => key(ctx2), ctx))
})

ReactiveOperator('rx.catchError',{
  category: 'error',
  impl: ctx => jb.rxUtils.catchError(err => ctx.dataObj(err))
})

ReactiveOperator('rx.timeoutLimit', {
  category: 'error',
  params: [
    {id: 'timeout', dynamic: true, defaultValue: '3000', description: 'can be dynamic'},
    {id: 'error', dynamic: true, defaultValue: 'timeout'}
  ],
  impl: (ctx, {}, {timeout, error}) => jb.rxUtils.timeoutLimit(timeout, error)
})

ReactiveOperator('rx.throwError', {
  category: 'error',
  params: [
    {id: 'condition', as: 'boolean', dynamic: true, mandatory: true},
    {id: 'error', mandatory: true}
  ],
  impl: (ctx, {}, {condition, error}) => jb.rxUtils.throwError(ctx2 => condition(ctx2), error)
})

ReactiveOperator('rx.replay',{
  description: 'stores messages and replay them for later subscription',
  params: [
    {id: 'itemsToKeep', as: 'number', description: 'empty for unlimited'}
  ],
  impl: (ctx, {}, {itemsToKeep}) => jb.rxUtils.replay(itemsToKeep)
})


const QueueHandler = TgpType('queue-handler', 'rx')
const QueueSystemImpl = TgpType('queue-system-impl', 'rx')

ReactiveOperator('linearQueueSystem',{
  params: [
    {id: 'inputQueue', type: 'queue-handler' },
    {id: 'innerQueueHandlers', type: 'queue-handler[]' },
    {id: 'talkBackQueue', type: 'queue-handler' },
    {id: 'outputQueue', type: 'subject' },
    {id: 'queueSystemImpl', type: 'queue-system-impl' },
  ],
})

QueueHandler('queueHandler', {
  params: [
    {id: 'inputQueue', type: 'subject' },
    {id: 'operator', type: 'reactive-operator' },
  ],
})

function addDebugInfo(f,ctx) { f.ctx = ctx; return f}

ReactiveSource('callbag', {
  params: [
    {id: 'callbagSrc', mandatory: true, description: 'callbag source function'}
  ],
  impl: (ctx, {}, {callbagSrc}) => jb.rxUtils.map(x=>ctx.dataObj(x))(callbagSrc || jb.rxUtils.fromIter([]))
})

const callbackLoop = ReactiveSource('callbackLoop',{
  params: [
    {id: 'registerFunc', mandatory: true, description: 'receive callback function. needs to be recalled for next event'},
  ],
  impl: (ctx, {}, {registerFunc}) => jb.rxUtils.map(x=>ctx.dataObj(x))(jb.rxUtils.fromCallbackLoop(registerFunc))
})

ReactiveSource('animationFrame',{
  impl: callbackLoop(({},{uiTest}) => (uiTest ? jb.ext.test : globalThis).requestAnimationFrame || (() => {}))
})

ReactiveSource('producer',  {
  description: `producer interface: obs => { bind('myBind', handler), return () => unbind('myBind',handler),  function handler(x) { obs(x) }`,
  params: [
    {id: 'producer', dynamic: true, mandatory: true, description: 'producer function'},
  ],
  impl: (ctx, {}, {producer}) => jb.rxUtils.map(x => ctx.dataObj(x))(jb.rxUtils.fromProducer(producer))
})

ReactiveSource('event', {
  params: [
    {id: 'event', as: 'string', mandatory: true, options: 'load,blur,change,focus,keydown,keypress,keyup,click,dblclick,mousedown,mousemove,mouseup,mouseout,mouseover,scroll,resize'},
    {id: 'elem', description: 'html element', defaultValue: () => globalThis.document},
    {id: 'options', description: 'addEventListener options, https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener'},
    {id: 'selector', as: 'string', description: 'optional, including the elem', byName: true}
  ],
  impl: (ctx, {}, {event, elem: _elem, options, selector}) => {
    const elem = selector ? jb.ext.ui?.findIncludeSelf(_elem, selector)[0] : _elem
    return elem && jb.rxUtils.map(sourceEvent => ctx.setVars({sourceEvent, elem}).dataObj(sourceEvent))(jb.rxUtils.fromEvent(event, elem, options))
  }
})

ReactiveSource('any', {
  params: [
    {id: 'source', mandatory: true, description: 'the source is detected by its type: promise, iterable, single, callbag element, etc..'}
  ],
  impl: (ctx, {}, {source}) => jb.rxUtils.map(x => ctx.dataObj(x))(jb.rxUtils.fromAny(source || []))
})

ReactiveSource('mergeConcat', {
  description: 'merge sources while keeping the order of sources',
  params: [
    {id: 'sources', type: 'source[]', as: 'array', mandatory: true, dynamic: true, templateValue: [], composite: true}
  ],
  impl: rx.pipe(
    rx.data(({},{},{sources}) => sources.profile),
    rx.concatMap(ctx => ctx.run(ctx.data))
  )
})

ReactiveSink('sink.notifySubject', {
  params: [
    {id: 'subject', type: 'subject', mandatory: true}
  ],
  impl: (ctx, {}, {subject}) => jb.rxUtils.subscribe(e => subject.trigger.next(e))
})

ReactiveSink('sink.subscribe', {
  description: 'forEach action for all items',
  params: [
    {id: 'next', type: 'action', dynamic: true, mandatory: true},
    {id: 'error', type: 'action', dynamic: true},
    {id: 'complete', type: 'action', dynamic: true}
  ],
  impl: (ctx, {}, {next, error, complete}) => jb.rxUtils.subscribe(ctx2 => next(ctx2), ctx2 => error(ctx2), () => complete())
})
const { sink } = ns

ReactiveSink('sink.action', {
  description: 'subscribe',
  params: [
    {id: 'action', type: 'action', dynamic: true, mandatory: true}
  ],
  impl: (ctx, {}, {action}) => jb.rxUtils.subscribe(ctx2 => { ctx; return action(ctx2) })
})

// ReactiveSink('sink.data', {
//   params: [
//     {id: 'Data', as: 'ref', dynamic: true, mandatory: true}
//   ],
//   impl: sink.action(writeValue('%$Data()%', '%%'))
// })

Object.assign(jb.rxUtils, {
  pipe(..._cbs) {
    const cbs = _cbs.filter(x=>x)
    if (!cbs[0]) return
    let res = cbs[0]
    for (let i = 1, n = cbs.length; i < n; i++) {
      const newRes = cbs[i](res)
      if (!newRes) debugger
      newRes.ctx = cbs[i].ctx
      Object.defineProperty(newRes, 'name',{value: 'register ' + cbs[i].name})
      res = newRes
    }
    return res
  },
  throwError: (condition,err) => source => (start, sink) => {
    let talkback
    if (start !== 0) return
    source(0, function throwError(t, d) {
      if (t === 0) talkback = d
      if (t == 1 && condition(d)) {
        talkback && talkback(2)
        sink(2,err)
      } else {
        sink(t, d)
      }
    })
  },
  distinct: keyFunc => source => (start, sink) => {
    if (start !== 0) return
    let prev = {}, talkback
    source(0, function distinct(t,d) {
        if (t === 0) talkback = d
        if (t == 1) {
          const key = keyFunc(d)
          if (typeof key == 'string') {
            if (prev[key]) {
                talkback && talkback(1)
                return
            }
            prev[key] = true
          }
        }
        sink(t, d)
    })
  },  
  fork: (...cbs) => source => (start, sink) => {
    if (start != 0) return
    let sinks = []
    let talkback = null

    registerSink(sink)
    jb.rxUtils.pipe(forkSource, ...cbs)

    source(0, function mainForkSource(t, d) {
      if (t == 0) {
        talkback = d
        talkback(1)
      } else {
        const zinkz = sinks.slice(0)
        for (let i = 0, n = zinkz.length, sink; i < n; i++) {
            sink = zinkz[i]
            if (sinks.indexOf(sink) > -1) sink(t, d)
        }
      }
    })

    function forkSource(start, forkSink) {
      if (start == 0) registerSink(forkSink)
    }

    function registerSink(sink) {
      sinks.push(sink)
      sink(0, function fork(t,d) {
          if (t === 2) {
              const i = sinks.indexOf(sink)
              if (i > -1) sinks.splice(i, 1)
              if (!sinks.length)
                talkback && talkback(2)
          }
          if (t == 1 && !d) // talkback
            talkback && talkback(1)
      })
    }
  },
  race(..._sources) { // take only the first result including errors and complete
    const sources = _sources.filter(x=>x).filter(x=>jb.rxUtils.fromAny(x))
    return function race(start, sink) {
      if (start !== 0) return
      const n = sources.length
      const sourceTalkbacks = new Array(n)
      let ended = false
      const talkback = (t, d) => {
        if (t === 2) ended = true
        for (let i = 0; i < n; i++) sourceTalkbacks[i] && sourceTalkbacks[i](t, d)
      }
      for (let i = 0; i < n; i++) {
        if (ended) return
        sources[i](0, function race(t, d) {
          if (t === 0) {
            sourceTalkbacks[i] = d
            sink(0, talkback)
          } else {
            ended = true
            for (let j = 0; j < n; j++) 
              if (j !== i && sourceTalkbacks[j]) sourceTalkbacks[j](2)
            sink(1,d)
            sink(2)
          }
        })
      }
  }},
  fromEvent: (event, elem, options) => (start, sink) => {
      if (!elem || !elem.addEventListener) return
      if (start !== 0) return
      let disposed = false
      const handler = ev => sink(1, ev)
    
      sink(0, function fromEvent(t, d) {
        if (t !== 2) {
          return
        }
        disposed = true
        if (elem.removeEventListener) elem.removeEventListener(event, handler, options)
        else if (elem.removeListener) elem.removeListener(event, handler, options)
        else throw new Error('cannot remove listener from elem. No method found.')
      })
    
      if (disposed) return
    
      if (elem.addEventListener) elem.addEventListener(event, handler, options)
      else if (elem.addListener) elem.addListener(event, handler, options)
      else throw new Error('cannot add listener to elem. No method found.')
  },
  fromCallbackLoop: register => (start, sink) => {
    if (start !== 0) return
    let sinkDone
    let handler = register(callbackLoop)
    function callbackLoop(d) { 
      if (sinkDone) return
      sink(1,d || 0)
      handler = register(callbackLoop)
    }
  
    sink(0, t => sinkDone = t == 2 )
  },
  fromProducer: producer => (start, sink) => {
    if (start !== 0) return
    if (typeof producer !== 'function') {
      logError('producer must be a function',{producer})
      sink(2,'non function producer')
      return
    }
    let sinkDone
    const cleanFunc = producer(function fromProducer(d) { return !sinkDone && sink(1,d) })
    sink(0, (t,d) => {
      if (!sinkDone) {
        sinkDone = t == 2
        if (sinkDone && typeof cleanFunc === 'function') cleanFunc()
      }
    })
  },
  replay: keep => source => {
    keep = keep || 0
    let store = [], sinks = [], talkback, done = false
  
    const sliceNum = keep > 0 ? -1 * keep : 0;
  
    source(0, function replay(t, d) {
      if (t == 0) {
        talkback = d
        return
      }
      if (t == 1) {
        store.push(d)
        store = store.slice(sliceNum)
        sinks.forEach(sink => sink(1, d))
      }
      if (t == 2) {
        done = true
        sinks.forEach(sink => sink(2))
        sinks = []
      }
    })

    replay.sinks = sinks
    return replay
  
    function replay(start, sink) {
      if (start !== 0) return
      sinks.push(sink)
      sink(0, function replay(t, d) {
        if (t == 0) return
        if (t == 1) {
          talkback(1)
          return
        }
        if (t == 2)
          sinks = sinks.filter(s => s !== sink)
      })
  
      store.forEach(entry => sink(1, entry))
  
      if (done) sink(2)
    }
  },
  catchError: fn => source => (start, sink) => {
      if (start !== 0) return
      let done
      source(0, function catchError(t, d) {
        if (done) return
        if (t === 2 && d !== undefined) { done= true; sink(1, fn(d)); sink(2) } 
        else sink(t, d) 
      }
    )
  },
  // swallow events. When new event arrives wait for a duration to spit it, if another event arrived when waiting, the original event is 'deleted'
  // 'immediate' means that the first event is spitted immediately
  forEach: operation => source => {
    let talkback
    source(0, function forEach(t, d) {
        if (t === 0) talkback = d
        if (t === 1) operation(d)
        if (t === 1 || t === 0) talkback(1)
    })
  },
  // toPromise: source => {
  //     return new Promise((resolve, reject) => {
  //       jb.rxUtils.subscribe({
  //         next: resolve,
  //         error: reject,
  //         complete: () => {
  //           const err = new Error('No elements in sequence.')
  //           err.code = 'NO_ELEMENTS'
  //           reject(err)
  //         },
  //       })(jb.rxUtils.last(source))
  //     })
  // },
  sniffer: (source, snifferSubject) => (start, sink) => {
    if (start !== 0) return
    let talkback
    const talkbackWrapper = (t,d) => { report('talkback',t,d); talkback(t,d) }
    const sniffer = (t,d) => {
      report('out',t,d)
      if (t == 0) {
        talkback = d
        Object.defineProperty(talkbackWrapper, 'name', { value: talkback.name + '-sniffer' })
        sink(0, talkbackWrapper)
        return
      }
      sink(t,d)
    }
    sniffer.ctx = source.ctx    
    Object.defineProperty(sniffer, 'name', { value: source.name + '-sniffer' })
    sniffer.dispose = () => { console.log('dispose', sink,talkback); debugger }

    source(0,sniffer)
    
    function report(dir,t,d) {
      const now = new Date()
      const time = `${now.getSeconds()}:${now.getMilliseconds()}`
      snifferSubject.next({dir, t, d, time})
      if (t == 2)
        snifferSubject.complete && snifferSubject.complete(d)
    }
  },
  timeoutLimit: (timeout,err) => source => (start, sink) => {
    if (start !== 0) return
    let talkback
    let timeoutId = setTimeout(()=> {
      talkback && talkback(2)
      sink(2, typeof err == 'function' ? err() : err || 'timeout')
    }, typeof timeout == 'function' ? timeout() : timeout)

    source(0, function timeoutLimit(t, d) {
      if (t === 2) clearTimeout(timeoutId)
      if (t === 0) talkback = d
      sink(t, d)
    })        
  },
  fromCallBag: source => source,
  isCallbag: cb => typeof cb == 'function' && cb.toString && cb.toString().split('=>')[0].split('{')[0].replace(/\s/g,'').match(/start,sink|t,d/),
  isCallbagOperator: cb => typeof cb == 'function' && cb.toString && cb.toString().match(/^\s*source\s*=>/),
  injectSniffers(cbs,ctx) {
    return cbs
  },  
  log: name => jb.rxUtils.Do(x=>console.log(name,x)),
  jbLog: (name,...params) => jb.rxUtils.Do(data => detailedRxLogger?.info?.({t: name, data, ...params})),
  valueFromfunctionOrConstant(val,data) {
    return typeof val == 'function' ? val(val.runCtx && val.runCtx.setData(data)) : val
  },
  childTxInCtx(ctx,noOfChildren) {
    const tx = calcPath(ctx,'vars.tx')
    if (noOfChildren < 2 || !tx) return ctx
    return ctx.setVars({tx: jb.rxUtils.transaction(tx)})
  },
  childTxInData(data,noOfChildren) {
    const ctx = calcPath(data,'srcCtx')
    const ctxWithRx = ctx && jb.rxUtils.childTxInCtx(ctx,noOfChildren)
    return (!ctxWithRx || ctxWithRx == ctx) ? data : { ...data, srcCtx: ctxWithRx}
  },
  transaction(parent) { 
    const tx = {
      parent,
      children: [],
      isComplete() { 
        return this.done = this.done || this.children.reduce((acc,t) => acc && t.isDone() , true)
      },
      next(d) { this.cb.next(d) },
      complete() { 
        this.done = true
        this.cb.complete()
      },
      addChild(childTx) {
        this.children.push(childTx)
        childTx.cb(0, function tx(t,d) { 
          if (t == 1) this.cb(1,d)
          if (t == 2) this.isComplete() && this.cb(2)
        })
      },
      cb: jb.rxUtils.subject()
    }
    parent && parent.addChild(tx)
    return tx
  }
})
