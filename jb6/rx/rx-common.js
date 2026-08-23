import { coreUtils, dsls, ns, jb } from '@jb6/core'

const { toArray, logError, ensureLoggers } = coreUtils
const {
  tgp: { TgpType, Component },
  rx: { ReactiveOperator, ReactiveSource },
  common: { Data, Action, Boolean,
  },
} = dsls

const { detailedRxLogger } = ensureLoggers('detailedRxLogger').vars   // subject callbag internals have no ctx; module-level sink for hot-path diagnostics

const Subject = TgpType('subject', 'rx')


ReactiveSource('interval', {
  params: [
    {id: 'interval', as: 'number', templateValue: '1000', description: 'time in mSec'}
  ],
  impl: (ctx, {}, {interval}) => jb.rxUtils.map(x => ctx.dataObj(x))(jb.rxUtils.interval(interval))
})

// ********** subject 
Subject('topic', {
  description: 'callbag "variable" that you can write or listen to',
  category: 'variable',
  params: [
    {id: 'id', as: 'string', description: 'can be used for logging'},
    {id: 'replay', as: 'boolean', description: 'keep pushed items for late subscription', type: 'boolean'},
    {id: 'itemsToKeep', as: 'number', description: 'relevant for replay, empty for unlimited'}
  ],
  impl: (ctx, {}, {id, replay,itemsToKeep}) => {
      const trigger = jb.rxUtils.subject(id)
      const source = replay ? jb.rxUtils.replay(itemsToKeep)(trigger): trigger
      source.ctx = trigger.ctx = ctx
      return { trigger, source } 
    }
})

ReactiveSource('subjectSource', {
  params: [
    {id: 'subject', type: 'subject', mandatory: true}
  ],
  impl: (ctx, {}, {subject}) => subject.source
})

Action('subject.notify', {
  params: [
    {id: 'subject', type: 'subject<rx>', mandatory: true},
    {id: 'Data', dynamic: true, defaultValue: '%%'}
  ],
  impl: (ctx, {}, {subject,Data}) => subject.trigger.next(ctx.dataObj(Data(ctx)))
})

Action('subject.complete', {
  params: [
    {id: 'subject', type: 'subject<rx>', mandatory: true}
  ],
  impl: (ctx, {}, {subject}) => subject.trigger.complete()
})

Action('subject.sendError', {
  params: [
    {id: 'subject', type: 'subject<rx>', mandatory: true},
    {id: 'error', dynamic: true, mandatory: true}
  ],
  impl: (ctx, {}, {subject,error}) => subject.trigger.error(error())
})

ReactiveOperator('rx.distinctUntilChanged',{
  description: 'filters adjacent items in stream',
  category: 'filter',
  params: [
    {id: 'equalsFunc', dynamic: true, mandatory: true, defaultValue: ({data}, {prev}) => data === prev, description: 'e.g. %% == %$prev%'}
  ],
  impl: (ctx, {}, {equalsFunc}) => jb.rxUtils.distinctUntilChanged((prev, cur) => equalsFunc(ctx.setData(cur.data).setVars({prev:prev.data})), ctx)
})

Component('rx.debounceTime', {
  type: 'reactive-operator<rx>',
  description: 'waits for a cooldown period, them emits the last arrived',
  params: [
    {id: 'cooldownPeriod', dynamic: true, description: 'can be dynamic', mandatory: {$: 'mandatory'}, byName: true},
    {id: 'immediate', as: 'boolean', description: 'emits the first event immediately, default is true'}
  ],
  impl: (ctx, {}, {cooldownPeriod, immediate}) => jb.rxUtils.debounceTime(cooldownPeriod, immediate)
})

ReactiveOperator('rx.throttleTime',{
  description: 'enforces a cooldown period. Any data that arrives during the showOnly time is ignored',
  params: [
    {id: 'cooldownPeriod', dynamic: true, description: 'can be dynamic'},
    {id: 'emitLast', as: 'boolean', description: 'emits the last event arrived at the end of the cooldown, default is true', defaultValue: true}
  ],
  impl: (ctx, {}, {cooldownPeriod, emitLast}) => jb.rxUtils.throttleTime(cooldownPeriod, emitLast)
})

ReactiveOperator('rx.takeWhile',{
  description: 'closes the stream on condition',
  category: 'terminate',
  params: [
    {id: 'whileCondition', as: 'boolean', dynamic: true, mandatory: true},
    {id: 'passLastEvent', as: 'boolean', byName: true}
  ],
  impl: (ctx, {}, {whileCondition, passLastEvent}) => jb.rxUtils.takeWhile(ctx => whileCondition(ctx), passLastEvent)
})

ReactiveOperator('rx.toArray',{
  description: 'wait for all and returns next item as array',
  impl: ctx => source => jb.rxUtils.pipe(source, jb.rxUtils.toArray(), jb.rxUtils.map(arr => ctx.dataObj(arr.map(x => x.data))))
})

ReactiveOperator('rx.startWith',{
  description: 'startWith callbags sources (or any)',
  params: [
    {id: 'sources', type: 'source[]', as: 'array'}
  ],
  impl: (ctx, {}, {sources}) => jb.rxUtils.startWith(...sources)
})

ReactiveOperator('rx.delay',{
  params: [
    {id: 'time', dynamic: true, description: 'can be dynamic'}
  ],
  impl: (ctx, {}, {time}) => jb.rxUtils.delay(time)
})

ReactiveOperator('rx.skip',{
  category: 'filter',
  params: [
    {id: 'count', as: 'number', dynamic: true}
  ],
  impl: (ctx, {}, {count}) => jb.rxUtils.skip(count())
})


Object.assign(jb.rxUtils, {
  distinctUntilChanged: (compare,ctx) => source => (start, sink) => {
      compare = compare || ((prev, cur) => prev === cur)
      if (start !== 0) return
      let inited = false, prev, talkback
      source(0, function distinctUntilChanged(t,d) {
          if (t === 0) {
            talkback = d
            sink(t, d)
          } else if (t == 1) {
            if (inited && compare(prev, d)) {
                talkback(1)
                ctx && ctx.dataObj('same as prev',null,d)
                return
            }
            inited = true
            prev = d
            ctx && ctx.dataObj(d,null,d)
            sink(1, d)
          } else {
              sink(t, d)
              return
          }
      })
  },  
    subject(id) {
      let sinks = []
      function subj(t, d, transactive) {
          if (t === 0) {
              const sink = d
              id && detailedRxLogger?.info?.({t: `${id} subject sink registered`, sink})
              sinks.push(sink)
              sink(0, function subject(t,d) {
                  if (t === 2) {
                      const i = sinks.indexOf(sink)
                      if (i > -1) {
                        const sink = sinks.splice(i, 1)
                        id && detailedRxLogger?.info?.({t: `${id} subject sink unregistered`, sink})
                      }
                  }
              })
          } else {
            id && t == 1 && detailedRxLogger?.info?.({t: `${id} subject next`, d, sinks: sinks.slice(0)})
            id && t == 2 && detailedRxLogger?.info?.({t: `${id} subject complete`, d, sinks: sinks.slice(0)})
            sinks.slice(0).forEach(sink=> {
              const td = transactive ? jb.rxUtils.childTxInData(d,sinks.length) : d
              sinks.indexOf(sink) > -1 && sink(t, td)
            })
          }
      }
      subj.next = (data,transactive) => subj(1,data,transactive)
      subj.complete = () => subj(2)
      subj.error = err => subj(2,err)
      subj.sinks = sinks
      return subj
  },
  debounceTime: (duration,immediate = true) => source => (start, sink) => {
    if (start !== 0) return
    let timeout
    source(0, function debounceTime(t, d) {
      let immediateEventSent = false
      if (!timeout && immediate) { sink(t,d); immediateEventSent = true }
      if (timeout) clearTimeout(timeout)
      if (t === 1) timeout = setTimeout(() => { 
        timeout = null; 
        if (!immediateEventSent) sink(1, d)
      }, typeof duration == 'function' ? duration() : duration)
      else sink(t, d)
    })
},
throttleTime: (duration,emitLast) => source => (start, sink) => {
  if (start !== 0) return
  let talkbackToSource, sourceTerminated = false, sinkTerminated = false, last, timeout
  sink(0, function throttle(t, d) {
    if (t === 2) sinkTerminated = true
  })
  source(0, function throttle(t, d) {
    if (t === 0) {
      talkbackToSource = d
      talkbackToSource(1)
    } else if (sinkTerminated) {
      return
    } else if (t === 1) {
      if (!timeout) {
        sink(t, d)
        last = null
        timeout = setTimeout(() => {
          timeout = null
          if (!sourceTerminated) talkbackToSource(1)
          if ((emitLast === undefined || emitLast) && last != null)
            sink(t,d)
        }, typeof duration == 'function' ? duration() : duration)
      } else {
        last = d
      }
    } else if (t === 2) {
      sourceTerminated = true
      sink(t, d)
    }
  })
},      
takeWhile: (predicate,passLastEvent) => source => (start, sink) => {
    if (start !== 0) return
    let talkback
    source(0, function takeWhile(t,d) {
      if (t === 0) talkback = d
      if (t === 1 && !predicate(d)) {
        if (passLastEvent) sink(t,d)
        talkback(2)
        sink(2)
      } else {
        sink(t, d)
      }
    })
},
toArray: () => source => (start, sink) => {
  if (start !== 0) return
  let talkback, res = [], ended
  source(0, function toArray(t, d) {
    if (t === 0) {
      talkback = d
      sink(t, (t,d) => {
        if (t == 2) end()
        talkback(t,d)
      })
    } else if (t === 1) {
      res.push(d)
      talkback && talkback(1)
    } else if (t === 2) {
      if (!d) end()
      sink(2,d)
    }
  })
  function end() {
    if (!ended && res.length) sink(1, res)
    ended = true
  }
},
interval: period => (start, sink) => {
  if (start !== 0) return
  let i = 0
  const id = setInterval(function set_interval() {
    sink(1, i++)
  }, period)
  sink(0, t => t === 2 && clearInterval(id))
},
startWith: (...xs) => source => (start, sink) => {
    if (start !== 0) return
    let disposed = false
    let inputTalkback
    let trackPull = false
    let lastPull
  
    sink(0, function startWith(t, d) {
      if (trackPull && t === 1) {
        lastPull = [1, d]
      }
  
      if (t === 2) {
        disposed = true
        xs.length = 0
      }
  
      if (!inputTalkback) return
      inputTalkback(t, d)
    })
  
    while (xs.length !== 0) {
      if (xs.length === 1) {
        trackPull = true
      }
      sink(1, xs.shift())
    }
  
    if (disposed) return
  
    source(0, function startWith(t, d) {
      if (t === 0) {
        inputTalkback = d
        trackPull = false
  
        if (lastPull) {
          inputTalkback(...lastPull)
          lastPull = null
        }
        return
      }
      sink(t, d)
    })
},
delay: duration => source => (start, sink) => {
    if (start !== 0) return
    let working = false, talkback
    const queue = []
    source(0, function delay(t,d) {
      if (t === 0) talkback = d
      if (t > 0) {
        queue.push({t,d})
        workOnQueue()
      }
    })
    sink(0, function delay(t,d) {
      if (t == 1 && !d && talkback)
        talkback(1)
      if (t == 2) {
        queue.splice(0,queue.length)
        talkback && talkback(t,d)
      }
    })

    function workOnQueue() {
      if (!working && queue.length > 0)
        workOnInput(queue.splice(0,1)[0])
    }

    function workOnInput({t,d}) {
      const id = setTimeout(()=> {
        clearTimeout(id)
        sink(t,d)
        working = false
        workOnQueue()
      }, jb.rxUtils.valueFromfunctionOrConstant(duration,d))
      working = true
    }
},
skip: max => source => (start, sink) => {
    if (start !== 0) return
    let skipped = 0, talkback
    source(0, function skip(t, d) {
      if (t === 0) talkback = d
      if (t === 1 && skipped < max) {
          skipped++
          talkback(1)
          return
      }
      sink(t, d)
    })
},

  toPromiseArray: source => {
      const res = []
      let talkback
      return new Promise((resolve, reject) => {
              source(0, function toPromiseArray(t, d) {
                  if (t === 0) talkback = d
                  if (t === 1) res.push(d)
                  if (t === 1 || t === 0) talkback && talkback(1)  // Pull
                  if (t === 2 && !d) resolve(res)
                  if (t === 2 && !!d) reject( d )
          })
      })
  },
})