import { coreUtils, dsls, ns } from '@jb6/core'

const { toArray, jb, logError, isPromise, isCallbag, ensureLoggers } = coreUtils
const {
  tgp: { TgpType, any: { If }, Component },
  rx: { ReactiveOperator, ReactiveSource },
} = dsls

const { detailedRxLogger } = ensureLoggers('detailedRxLogger').vars   // callbag internals have no ctx; module-level sink for hot-path diagnostics

const ReactiveFlow = TgpType('reactive-flow', 'rx')

Component('rx.flow', {
  type: 'reactive-flow<rx>',
  moreTypes: 'action<common>',
  description: 'pipline with sink action',
  params: [
    {id: 'source', type: 'reactive-source', dynamic: true, mandatory: true, templateValue: '', composite: true},
    {id: 'sink', type: 'action', dynamic: true, mandatory: true},
    {id: 'onError', type: 'action', dynamic: true},
    {id: 'onComplete', type: 'action', dynamic: true}
  ],
  impl: (ctx, {}, {source, sink, onError, onComplete}) => source(jb.rxUtils.subscribe(ctx2 => sink(ctx2), ctx2 => onError(ctx2), ctx2 => onComplete(ctx2)))
})
const { rx } = ns


Component('rx.pipe', {
  type: 'reactive-source<rx>',
  moreTypes: 'data<common>',
  description: 'pipeline of reactive observables with source',
  params: [
    {id: 'source', type: 'reactive-source', dynamic: true, mandatory: true, templateValue: '', composite: true},
    {id: 'elems', type: 'reactive-operator[]', dynamic: true, mandatory: true, secondParamAsArray: true, description: 'chain/map data functions'}
  ],
  impl: (ctx, {}, {source, elems}) => {
      const cbs = [source(ctx), ...elems(ctx).filter(x=>x)]
      if (!cbs[0])
        logError('rx.pipe, no reactive source for pipe',{source, ctx})
      return cbs.slice(1).reduce((res,cb) => {
        const pipe = cb(res)
        if (!pipe) debugger
        pipe.ctx = cb.ctx
        Object.defineProperty(pipe, 'name',{value: 'register ' + cb.name})
        return pipe
      }, cbs[0])
    }
})

ReactiveSource('rx.data', {
  params: [
    {id: 'Data', mandatory: true}
  ],
  impl: (ctx, {}, {Data}) => jb.rxUtils.map(x => ctx.dataObj(x))(jb.rxUtils.fromIter(toArray(Data)))
})

ReactiveSource('merge', {
  description: 'merge callbags sources (or any)',
  params: [
    {id: 'sources', type: 'reactive-source[]', as: 'array', mandatory: true, dynamic: true, templateValue: [], composite: true}
  ],
  impl: (ctx, {}, {sources}) => jb.rxUtils.merge(...sources(ctx))
})

ReactiveSource('rx.promise', {
  params: [
    {id: 'promise', mandatory: true}
  ],
  impl: (ctx, {}, {promise}) => (start, sink) => {
    let sinkDone
    if (start !== 0) return
    Promise.resolve(promise).then(d => { 
      if (!sinkDone && d != null) { // Only emit non-null values
        sink(1, ctx.dataObj(d))
        sink(2) 
      } else if (!sinkDone) {
        sink(2) // Complete without emitting anything for null values
      }
    }).catch(err => !sinkDone && sink(2, err))

    sink(0, function promiseTB(t, d) {
      if (t == 2) sinkDone = true
    })
  }
})

// ReactiveSource('rx.promise', {
//   params: [
//     {id: 'promise', mandatory: true}
//   ],
//   impl: (ctx, {}, {promise}) => jb.rxUtils.map(x => ctx.dataObj(x))(jb.rxUtils.fromPromise(promise))
// })

ReactiveOperator('rx.do',{
  params: [
    {id: 'action', type: 'action', dynamic: true, mandatory: true}
  ],
  impl: (ctx, {}, {action}) => jb.rxUtils.Do(ctx2 => action(ctx2))
})

ReactiveOperator('rx.doPromise',{
  params: [
    {id: 'action', type: 'action', dynamic: true, mandatory: true}
  ],
  impl: (ctx, {}, {action}) => jb.rxUtils.doPromise(ctx2 => action(ctx2))
})

ReactiveOperator('rx.map',{
  params: [
    {id: 'func', dynamic: true, mandatory: true}
  ],
  impl: (ctx, {}, {func}) => jb.rxUtils.map(addDebugInfo(ctx2 => ctx.dataObj(func(ctx2), ctx2.vars || {}, ctx2.data), ctx))
})

ReactiveOperator('rx.mapPromise',{
  params: [
    {id: 'func', type: 'data', moreTypes: 'action<common>', dynamic: true, mandatory: true}
  ],
  impl: (ctx, {}, {func}) => jb.rxUtils.mapPromise(ctx2 => Promise.resolve(func(ctx2)).then(data => ctx.dataObj(data, ctx2.vars || {}, ctx2.data))
    .catch(err => ({vars: {...ctx2.vars, err}, data: err})))
})

ReactiveOperator('rx.filter',{
  category: 'filter',
  params: [
    {id: 'filter', type: 'boolean', dynamic: true, mandatory: true}
  ],
  impl: (ctx, {}, {filter}) => jb.rxUtils.filter(addDebugInfo(ctx2 => filter(ctx2), ctx))
})

ReactiveOperator('rx.flatMap',{
  description: 'match inputs the callbags or promises',
  params: [
    {id: 'source', type: 'reactive-source', dynamic: true, mandatory: true, description: 'map each input to source callbag'},
    {id: 'onInputBegin', type: 'action', dynamic: true, byName: true},
    {id: 'onInputEnd', type: 'action', dynamic: true},
    {id: 'onItem', type: 'action', dynamic: true}
  ],
  impl: (ctx, {}, {source: sourceGenerator, onInputBegin, onInputEnd, onItem}) => source => (start, sink) => {
    if (start !== 0) return
    let sourceTalkback, innerSources = [], sourceEnded

    source(0, function flatMap(t, d) {
      if (t === 0)
        sourceTalkback = d
      if (t === 1 && d != null)
        createInnerSrc(d)
      if (t === 2) {
        sourceEnded = true
        stopOrContinue(d)
      }
    })

    sink(0, function flatMap(t, d) {
      if (t == 1 && d == null || t == 2) {
        sourceTalkback && sourceTalkback(t, d)
        innerSources.forEach(src => src.talkback && src.talkback(t, d))
      }
    })

    function createInnerSrc(d) {
      const ctxToUse = ctx.setData(d.data).setVars(d.vars)
      const newSrc = sourceGenerator(ctxToUse)
      innerSources.push(newSrc)
      onInputBegin.profile && onInputBegin(ctxToUse)
      newSrc(0, function flatMap(t, d) {
        if (t == 0) newSrc.talkback = d
        if (t == 1) {
          if (d && onItem.profile) onItem(ctxToUse.setData(d))
          sink(t, d)
        }
        if (t != 2 && newSrc.talkback) newSrc.talkback(1)
        if (t == 2) {
          onInputEnd.profile && onInputEnd(ctxToUse)
          innerSources.splice(innerSources.indexOf(newSrc), 1)
          stopOrContinue(d)
        }
      })
    }

    function stopOrContinue(d) {
      if (sourceEnded && innerSources.length == 0)
        sink(2, d)
    }
  }
})

ReactiveSource('rx.renewable', {
  description: 'renewable source from function returning promise, calls function on each pull',
  params: [
    {id: 'promiseFunc', type: 'data', dynamic: true, mandatory: true, description: 'Function that returns a promise'}
  ],
  impl: (ctx, {}, {promiseFunc}) => (start, sink) => {
    if (start !== 0) return
    
    let active = true
    
    const callFunction = () => {
      if (!active) return
      
      try {
        const promise = promiseFunc(ctx)
        Promise.resolve(promise)
          .then(result => {
            if (active) sink(1, ctx.dataObj(result))
          })
          .catch(err => {
            if (active) sink(2, err)
          })
      } catch (err) {
        if (active) sink(2, err)
      }
    }
    
    sink(0, function talkback(t, d) {
      if (t === 1) {
        callFunction()
      } else if (t === 2) {
        active = false
      }
    })
    
    callFunction()
  }
})

ReactiveOperator('rx.concatMap', {
  category: 'operator,combine',
  params: [
    {id: 'source', type: 'reactive-source', dynamic: true, mandatory: true, description: 'keeps the order of the results, can return array, promise or callbag'},
    {id: 'combineResultWithInput', dynamic: true, description: 'combines %$input% with the inner result %%'}
  ],
  impl: (ctx, {}, {source, combineResultWithInput: combine}) => combine.profile
    ? jb.rxUtils.concatMap(ctx2 => source(ctx2), (input, {data}) => combine({data, vars: {...input.vars, input: input.data}}))
    : jb.rxUtils.concatMap(ctx2 => source(ctx2))
})

ReactiveOperator('rx.flatMapArrays', {
  description: 'match inputs to data arrays',
  params: [
    {id: 'func', dynamic: true, defaultValue: '%%', description: 'should return array, items will be passed one by one'}
  ],
  impl: rx.flatMap(rx.data('%$func()%'))
})

ReactiveOperator('rx.takeUntil',{
  description: 'closes the stream when events comes from notifier',
  category: 'terminate',
  params: [
    {id: 'notifier', type: 'reactive-source', description: 'can be also promise or any other'}
  ],
  impl: (ctx, {}, {notifier}) => jb.rxUtils.takeUntil({notifier})
})

ReactiveOperator('rx.take',{
  description: 'closes the stream after taking some items',
  category: 'terminate',
  params: [
    {id: 'count', as: 'number', dynamic: true, mandatory: true}
  ],
  impl: (ctx, {}, {count}) => jb.rxUtils.take(count(), ctx)
})

ReactiveOperator('rx.splitToBuffers',{
  params: [
    {id: 'count', as: 'number', dynamic: true, mandatory: true}
  ],
  impl: (ctx, {}, {count: countF}) => source => (start, sink) => {
    const count = countF(ctx)
    if (start !== 0) return
    let sourceTalkback, buffer = []
    function talkback(t, d) {
      if (t === 2)
        sourceTalkback(t, d)
    }
    source(0, function take(t, d) {
      if (t === 0) {
        sourceTalkback = d
        sink(0, talkback) // sink will talkback directly to our source
      } else if (t === 1 && d) {
          buffer.push(d)
          if (buffer.length >= count) {
            sink(t, ctx.dataObj({buff: buffer.map(x=>x.data)}, buffer.pop().vars))
            buffer = []
          }
      } else if (t === 2) {
        if (buffer.length) {
          sink(1, ctx.dataObj({buff: buffer.map(x=>x.data)}, buffer.pop().vars))
          buffer = []
        }       
        sink(t, d)
      }
    })
  }
})

ReactiveOperator('rx.last', {
  category: 'filter',
  impl: ({}, {}) => jb.rxUtils.last()
})

ReactiveOperator('rx.var',{
  description: 'define an immutable variable that can be used later in the pipe',
  params: [
    {id: 'name', as: 'string', dynamic: true, mandatory: true, description: 'if empty, does nothing'},
    {id: 'value', dynamic: true, defaultValue: '%%', mandatory: true}
  ],
  impl: If('%$name%', (ctx, {}, {name, value}) => source => (start, sink) => {
    if (start != 0) return
    return source(0, function Var(t, d) {
      sink(t, t === 1 ? d && {data: d.data, vars: {...d.vars, [name()]: value(d)}} : d)
    })
  })
})

ReactiveOperator('rx.asyncVar',{
  description: 'define an immutable variable that can be used later in the pipe',
  params: [
    {id: 'name', as: 'string', dynamic: true, mandatory: true, description: 'if empty, does nothing'},
    {id: 'value', dynamic: true, defaultValue: '%%', mandatory: true}
  ],
  impl: rx.innerPipe(rx.mapPromise('%$value()%'), rx.var('%$name()%'))
})

ReactiveOperator('rx.log',{
  description: 'log flow data, used for debug',
  params: [
    {id: 'name', as: 'string', dynamic: true, description: 'log names'},
    {id: 'extra', as: 'single', dynamic: true, description: 'object. more properties to log'}
  ],
  impl: rx.do((ctx, vars, {name, extra}) => ctx.vars.rxLogger?.info?.({t: name(ctx), data: ctx.data, vars, ...extra(ctx)}, {}, {ctx: ctx.cmpCtx}))
})

ReactiveOperator('rx.consoleLog',{
  description: 'console.log flow data, used for debug',
  params: [
    {id: 'name', as: 'string'}
  ],
  impl: rx.do((x, {}, {name}) => console.log(name, x))
})

jb.rxUtils = {
  pipe(...cbs) {
    if (!cbs[0])
      logError('rx.pipe, no reactive source for pipe',{source: cbs[0]})
    return cbs.slice(1).reduce((res,cb) => {
      const pipe = cb(res)
      if (!pipe) debugger
      pipe.ctx = cb.ctx
      Object.defineProperty(pipe, 'name',{value: 'register ' + cb.name})
      return pipe
    }, cbs[0])
  },
  fromIter: iter => (start, sink) => {
      if (start !== 0) return
      const iterator = typeof Symbol !== 'undefined' && iter[Symbol.iterator] ? iter[Symbol.iterator]() : iter
      let inloop = false, got1 = false, res
      function loop() {
          inloop = true
          while (got1) {
              got1 = false
              res = iterator.next()
              if (res.done) 
                sink(2)
              else 
                sink(1, res.value)
          }
          inloop = false
      }
      sink(0, function fromIter(t, d) {
          if (t === 1) {
              got1 = true
              if (!inloop && !(res && res.done)) loop()
          }
      })
  },
  Do: f => source => (start, sink) => {
    if (start !== 0) return
    source(0, function Do(t, d) {
        if (t == 1) f(d)
        sink(t, d)
    })
  },
  filter: condition => source => (start, sink) => {
      if (start !== 0) return
      let talkback
      source(0, function filter(t, d) {
        if (t === 0) {
          talkback = d
          sink(t, d)
        } else if (t === 1) {
          if (condition(d)) sink(t, d)
          else talkback(1) // get next
        }
        else sink(t, d)
      })
  },
  map: f => source => (start, sink) => {
      if (start !== 0) return
      source(0, function map(t, d) {
        if (t == 1 && d != null) 
          sink(1,f(d))
        else
          sink(t, d)
      })
  },
  takeUntil(notifier) {
      if (isPromise(notifier))
          notifier = jb.rxUtils.fromPromise(notifier)
      const UNIQUE = {}
      return source => (start, sink) => {
          if (start !== 0) return
          let sourceTalkback, notifierTalkback, inited = false, done = UNIQUE

          source(0, function takeUntil(t, d) {
              if (t === 0) {
                  sourceTalkback = d

                  notifier(0, function takeUntilNotifier(t, d) {
                      if (t === 0) {
                          notifierTalkback = d
                          notifierTalkback(1)
                          return
                      }
                      if (t === 1) {
                          done = void 0
                          notifierTalkback(2)
                          sourceTalkback(2)
                          if (inited) sink(2)
                          return
                      }
                      if (t === 2) {
                          //notifierTalkback = null
                          done = d
                          if (d != null) {
                              sourceTalkback(2)
                              if (inited) sink(t, d)
                          }
                      }
                  })
                  inited = true

                  sink(0, function takeUntilSink(t, d) {
                      if (done !== UNIQUE) return
                      if (t === 2 && notifierTalkback) notifierTalkback(2)
                      sourceTalkback(t, d)
                  })

                  if (done !== UNIQUE) sink(2, done)
                  return
              }
              if (t === 2) notifierTalkback(2)
              if (done === UNIQUE) sink(t, d)
          })
      }
  },
  concatMap(_makeSource,combineResults) {
    const makeSource = (...args) => jb.rxUtils.fromAny(_makeSource(...args))
    if (!combineResults) combineResults = (input, inner) => inner
    return source => (start, sink) => {
        if (start !== 0) return
        let queue = [], activeCb, sourceEnded, allEnded, sourceTalkback, activecbTalkBack, waitingForNext = false
        source(0, function concatMap(t,d) {
          if (t == 0)
            sourceTalkback = d
          else if (t == 1)
            queue.push(d)
          else if (t ==2)
            sourceEnded = true
          tick()
        })
        sink(0, function concatMap(t,d) {
          if (t == 1) {
            waitingForNext = true
            tick()
          } else if (t == 2) {
            allEnded = true
            queue = []
            sourceTalkback && sourceTalkback(2)
          }
        })
        
        function tick() {
          if (allEnded) return
          if (!activeCb && queue.length) {
            const input = queue.shift()
            activeCb = makeSource(input)
            activeCb(0, function concatMap(t,d) {
              if (t == 0) {
                activecbTalkBack = d
                tick()
                //waitingForNext && activecbTalkBack && activecbTalkBack(1)
              } else if (t == 1) {
                waitingForNext = false
                sink(1, combineResults(input,d))
                //activecbTalkBack && activecbTalkBack(1)
              } else if (t == 2 && d) {
                allEnded = true
                queue = []
                sink(2,d)
                sourceTalkback && sourceTalkback(2)
              } else if (t == 2) {
                waitingForNext = true
                activecbTalkBack = activeCb = null
                tick()
              }
            })
          }
          if (sourceEnded && !activeCb && !queue.length) {
            allEnded = true
            sink(2)
          }
          if (waitingForNext) {
            if (activecbTalkBack) activecbTalkBack(1);
            if (!activeCb) sourceTalkback && sourceTalkback(1)
          }
        }
    }
  },
  flatMap: (_makeSource, combineResults) => source => (start, sink) => {
      if (start !== 0) return
      const makeSource = (...args) => jb.rxUtils.fromAny(_makeSource(...args))
      if (!combineResults) combineResults = (input, inner) => inner

      let index = 0
      const talkbacks = {}
      let sourceEnded = false
      let inputSourceTalkback = null

      source(0, function flatMap(t, d) {
        if (t === 0) {
            inputSourceTalkback = d
            sink(0, pullHandle)
        }
        if (t === 1) {
            makeSource(d)(0, makeSink(index++, d))
        }
        if (t === 2) {
            sourceEnded = true
            stopOrContinue(d)
        }
      })

      function makeSink(i, input) { 
        return (t, d) => {
          if (t === 0) {talkbacks[i] = d; talkbacks[i](1)}
          if (t === 1)
            sink(1, d == null ? null : combineResults(input, d))
          if (t === 2) {
              delete talkbacks[i]
              stopOrContinue(d)
          }
      }}

      function stopOrContinue(d) {
        if (sourceEnded && Object.keys(talkbacks).length === 0) 
          sink(2, d)
        else 
          !sourceEnded && inputSourceTalkback && inputSourceTalkback(1)
      }

      function pullHandle(t, d) {
        const currTalkback = Object.values(talkbacks).pop()
        if (t === 1) {
          currTalkback && currTalkback(1)
          if (!sourceEnded) inputSourceTalkback(1)
        }
        if (t === 2) {
          stopOrContinue(d)
        }
      }
  },
  merge(..._sources) {
      const sources = _sources.filter(x=>x).filter(x=>jb.rxUtils.fromAny(x))
      return function merge(start, sink) {
        if (start !== 0) return
        const n = sources.length
        const sourceTalkbacks = new Array(n)
        let startCount = 0
        let endCount = 0
        let ended = false
        const talkback = (t, d) => {
          if (t === 2) ended = true
          for (let i = 0; i < n; i++) sourceTalkbacks[i] && sourceTalkbacks[i](t, d)
        }
        for (let i = 0; i < n; i++) {
          if (ended) return
          sources[i](0, (t, d) => {
            if (t === 0) {
              sourceTalkbacks[i] = d
              sink(0, talkback) // if (++startCount === 1) 
            } else if (t === 2 && d) {
              ended = true
              for (let j = 0; j < n; j++) if (j !== i && sourceTalkbacks[j]) sourceTalkbacks[j](2)
              sink(2, d)
            } else if (t === 2) {
              sourceTalkbacks[i] = void 0
              if (++endCount === n) sink(2)
            } else sink(t, d)
          })
        }
      }
  },
  take: (max,ctx) => source => (start, sink) => {
      if (start !== 0) return
      let taken = 0, sourceTalkback, end
      function talkback(t, d) {
        if (t === 2) end = true
        sourceTalkback(t, d)
      }
      source(0, function take(t, d) {
        if (t === 0) {
          sourceTalkback = d
          sink(0, talkback)
        } else if (t === 1) {
          if (taken < max) {
            taken++
            sink(t, d)
            ctx && ctx.dataObj(d)
            if (taken === max && !end) {
              end = true
              sourceTalkback(2)
              sink(2)
            }
          }
        } else {
          sink(t, d)
        }
      })
  },
  last: () => source => (start, sink) => {
    if (start !== 0) return
    let talkback, lastVal, matched = false
    source(0, function last(t, d) {
      if (t === 0) {
        talkback = d
        sink(t, d)
      } else if (t === 1) {
        lastVal = d
        matched = true
        talkback(1)
      } else if (t === 2) {
        if (matched) sink(1, lastVal)
        sink(2)
      }
    })
},

  subscribe: (listener = {}) => source => {
      if (typeof listener === "function") listener = { next: listener }
      let { next, error, complete } = listener
      let talkback, done
      source(0, function subscribe(t, d) {
        if (t === 0) talkback = d
        if (t === 1 && next) next(d)
        if (t === 1 || t === 0) talkback(1)  // Pull
        if (t === 2) done = true
        if (t === 2 && !d && complete) complete()
        if (t === 2 && !!d && error) error( d )
        if (t === 2 && listener.finally) listener.finally( d )
      })
      return {
        dispose: () => talkback && !done && talkback(2),
        isDone: () => done,
        isActive: () => talkback && !done
      }
  },
  fromPromise: pr => (start, sink) => {
    let sinkDone
    if (start !== 0) return
    Promise.resolve(pr).then(d =>{
      detailedRxLogger?.info?.({t: 'callbag promise resolved', d, sinkDone})
      if (!sinkDone) {
        sink(1,d)
        sink(2)
      }
    }).catch(err => sink(2,err))

    sink(0, function mapPromiseTB(t,d) {
      detailedRxLogger?.info?.({t: 'callbag promise talkback', cbT: t, d})
      if (t == 2) sinkDone = true
    })
  },
  fromAny: (source, name, options) => {
    const f = source && 'from' + (isPromise(source) ? 'Promise'
        : source.addEventListener ? 'Event'
        : typeof source[Symbol.iterator] === 'function' ? 'Iter'
        : '')
    if (jb.rxUtils[f]) 
        return jb.rxUtils[f](source, name, options)
    else if (isCallbag(source))
        return source
    else
        return jb.rxUtils.fromIter([source])
  },
  mapPromise: promiseF => jb.rxUtils.concatMap(d => jb.rxUtils.fromPromise(Promise.resolve().then(()=>promiseF(d)))),
  doPromise: promiseF => jb.rxUtils.concatMap(d => jb.rxUtils.fromPromise(Promise.resolve().then(()=>promiseF(d)).then(()=>d))),
}

function addDebugInfo(f,ctx) { f.ctx = ctx; return f}
