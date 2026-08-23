import { coreUtils, dsls, ns, jb } from '@jb6/core'
import '@jb6/rx'
import '@jb6/rx/rx-common.js'
import '@jb6/rx/rx-misc.js'
import '@jb6/testing'


const { rxUtils } = jb
const { logError, isPromise, calcPath } = coreUtils
const {
  tgp: { TgpType, 'ctx-enricher': { Var } },
  rx: { ReactiveSource,ReactiveOperator,
    'reactive-source' : { interval, subjectSource, merge, mergeConcat },
    'reactive-operator' : {}
  },
  common: { Data, Action, Boolean, 
    action: { runActions},
    data: { pipeline, filter, join, property, obj, delay, asIs, pipe, list, split }, 
    Boolean: { contains, equals, and },
    Prop: { prop }
  },
  test: { Test, 
    test: { dataTest}
  }
} = dsls
const { rx, subject } = ns

Test('rxTest.pipeWithObservable', {
  impl: dataTest(pipe(ctx => rxUtils.fromIter([1,2]), '%%a', join()), equals('1a,2a'))
})
  
Test('rxTest.mapPromise', {
  impl: dataTest(rx.pipe(rx.data(0), rx.mapPromise(({data}) => coreUtils.delay(1,data+2))), equals('2'))
})

Test('rxTest.varInRxPipe', {
  impl: dataTest(rx.pipe(Var('x', 'hello'), rx.data('%$x%')), equals('hello'))
})

Test('rxTest.doPromise', {
  impl: dataTest({
    calculate: rx.pipe(rx.data(1), rx.doPromise(delay(1, '-%%-')), rx.mapPromise(delay(1, '-%%-'))),
    expectedResult: equals('-1-')
  })
})

Test('rxTest.pipe', {
  impl: dataTest({
    calculate: pipe(rx.pipe(rx.data(list('1','2','3','4')), rx.map('-%%-')), join(',')),
    expectedResult: equals('-1-,-2-,-3-,-4-')
  })
})

Test('rxTest.toArray.empty', {
  impl: dataTest(rx.pipe(rx.data(list()), rx.toArray()), equals([]))
})

Test('rxTest.toArray', {
  impl: dataTest(rx.pipe(rx.data(list(0,1,2,3)), rx.toArray(), rx.map(join())), equals('0,1,2,3'))
})

Test('rxTest.distinctUntilChanged', {
  impl: dataTest(rx.pipe(rx.data(list(1,2,2,3,3,3)), rx.distinctUntilChanged(), rx.toArray(), rx.map(join())), equals('1,2,3'))
})

Test('rxTest.enrichWithPrevious', {
  impl: dataTest({
    calculate: rx.pipe(
      rx.data(list(1,2,3,2)),
      rx.reduce('upDown', obj(prop('count', 0), prop('dir', '')), {
        value: ({data},{upDown,prev}) => {
          const dir = prev && prev < data ? 'up' : 'down'
          return {dir, count: (upDown.dir == dir) ? upDown.count+1 : 1}
        }
      }),
      rx.skip(1),
      rx.map('%$upDown/dir%-%$upDown/count%'),
      rx.toArray(),
      rx.map(join())
    ),
    expectedResult: equals('up-1,up-2,down-1')
  })
})

Test('rxTest.toArray.active', {
  impl: dataTest(pipe(rx.pipe(interval(1), rx.take(4)), join(',')), equals('0,1,2,3'))
})

Test('rxTest.usePreviousData', {
  impl: dataTest({
    calculate: rx.pipe(rx.pipe(
      interval(1),
      rx.take(3),
      rx.resource('enrichedPrevItem', obj()),
      rx.concatMap(rx.pipe(
        rx.data('%%'),
        rx.asyncVar('enrichedDelayedItem', delay(1, '-%%-')),
        rx.var('curAndPrev', '(%$enrichedPrevItem.data% , %%)'),
        rx.map('%$curAndPrev%'),
        rx.do(({},{enrichedPrevItem, enrichedDelayedItem}) => enrichedPrevItem.data = enrichedDelayedItem),
      ))
    )),
    expectedResult: equals(['( , -0-)','(-0- , -1-)','(-1- , -2-)'])
  })
})

Test('rxTest.usePreviousBuffersData', {
  impl: dataTest({
    calculate: rx.pipe(rx.pipe(
      interval(1),
      rx.take(10),
      rx.splitToBuffers(3),
      rx.resource('enrichedPrevItem', obj()),
      rx.concatMap(rx.pipe(
        rx.data('%%'),
        rx.asyncVar('enrichedDelayedItem', delay(1, '--%buff[0]% to %buff[2]%--')),
        rx.var('curAndPrev', '(%$enrichedPrevItem.data% , %%)'),
        rx.map('%$curAndPrev%'),
        rx.do(({},{enrichedPrevItem, enrichedDelayedItem}) => enrichedPrevItem.data = enrichedDelayedItem),
      ))
    )),
    expectedResult: equals(['( , --0 to 2--)','(--0 to 2-- , --3 to 5--)','(--3 to 5-- , --6 to 8--)','(--6 to 8-- , --9 to --)'])
  })
})

Test('rxTest.splitToBuffers', {
  impl: dataTest({
    calculate: rx.pipe(rx.pipe(interval(1), rx.take(10), rx.splitToBuffers(3)), rx.map('%%')),
    expectedResult: equals([{buff: [0,1,2]}, {buff: [3,4,5]}, {buff: [6,7,8]}, {buff: [9]}])
  })
})

Test('rxTest.pipeInsidePipeWithConcatMap', {
  impl: dataTest({
    calculate: () => {
      const {pipe,fromIter, map, concatMap, toPromiseArray} = rxUtils
      return toPromiseArray(pipe(fromIter([1,2]), concatMap(x => pipe(fromIter([x]), map(x=>`-${x}-`))))) .then(ar=>ar.join(','))
    },
    expectedResult: equals('-1-,-2-')
  })
})

Test('rxTest.rawPipeInsidePipe', {
  impl: dataTest({
    calculate: () => {
      const {pipe,fromIter, map, toPromiseArray} = rxUtils
      return toPromiseArray(pipe(fromIter([1,2]), x => pipe(x, map(x=>`-${x}-`)))).then(ar=>ar.join(','))
    },
    expectedResult: equals('-1-,-2-')
  })
})

Test('rxTest.TakeWhile', {
  impl: dataTest(pipe(rx.pipe(interval(1), rx.takeWhile('%%<2'), rx.map('%%')), join(',')), equals('0,1'))
})

// Test('rxTest.ActionPulls', {
//   impl: dataTest({
//     vars: Var('out', obj()),
//     calculate: '%$out/x%',
//     expectedResult: equals('1'),
//     runBefore: rx.pipe(rx.data(1), rx.map('%%'), sink.data('%$out/x%'))
//   })
// })

Test('rxTest.TakeWhileIter', {
  impl: dataTest(pipe(rx.pipe(rx.data([0,1,2,3]), rx.takeWhile('%%<2')), join(',')), equals('0,1'))
})

Test('rxTest.mapPromise.reactive', {
  impl: dataTest({
    calculate: pipe(
      rx.pipe(interval(1), rx.take(2), rx.mapPromise(delay(1, '-%%-'))),
      join(',')
    ),
    expectedResult: equals('-0-,-1-')
  })
})

Test('rxTest.innerPipe', {
  impl: dataTest({
    calculate: pipe(
      rx.pipe(
        interval(1),
        rx.take(2),
        rx.mapPromise(delay(1, '-%%-')), rx.var('a', '-%%-'), rx.map('-%$a%-')
      ),
      join(',')
    ),
    expectedResult: equals('---0---,---1---')
  })
})

Test('rxTest.interval', {
  impl: dataTest({
    calculate: pipe(rx.pipe(interval(1), rx.take('4'), rx.map('-%%-')), join(',')),
    expectedResult: equals('-0-,-1-,-2-,-3-')
  })
})

Test('rxTest.var', {
  impl: dataTest({
    vars: [Var('a', 'hello')],
    calculate: pipe(
      rx.pipe(
        interval(1),
        rx.take('4'),
        rx.var('origin'),
        rx.map('-%%-'),
        rx.log('test 1'),
        rx.map('%$a%;%%;%$origin%'),
        rx.last()
      ),
      join(',')
    ),
    expectedResult: equals('hello;-3-;3')
  })
})

Test('rxTest.asynVar', {
  impl: dataTest({
    calculate: rx.pipe(interval(1), rx.take(3), rx.asyncVar('origin', delay(2, '%%')), rx.map('-%%-'), rx.map('%%;%$origin%')),
    expectedResult: equals(['-0-;0','-1-;1','-2-;2'])
  })
})

Test('rxTest.varAsParam', {
  params: [
    {id: 'param', defaultValue: 'hello', dynamic: true}
  ],
  impl: dataTest(rx.pipe(rx.data(1), rx.var('a', '%$param()%'), rx.map('%$a%')), equals('hello'))
})

Test('rxTest.reduceCount', {
  impl: dataTest(rx.pipe(interval(1), rx.take(4), rx.count(), rx.map('%$count%'), rx.last()), equals(4))
})

Test('rxTest.reduceMax', {
  impl: dataTest(rx.pipe(interval(1), rx.take(4), rx.max(), rx.map('%$max%'), rx.last()), equals(3))
})

Test('rxTest.reduceJoin', {
  impl: dataTest({
    calculate: rx.pipe(interval(1), rx.take(4), rx.join('res', ';'), rx.map('%$res%'), rx.last()),
    expectedResult: equals('0;1;2;3')
  })
})

// jb.component('studioHelper.jbEditor.callbag', {
//   type: 'control',
//   impl: group({
//     controls: [
//       studio.jbEditor('dataTest.rxUtils.pipe~impl')
//     ],
//     features: [
//       css('{ height: 200px; padding: 50px }'),
//       //studio.jbEditorContainer({id: 'helper', initialSelection: 'dataTest.rxUtils.pipe~impl~calculate~items~0~elems~0', circuit: 'dataTest.rxUtils.pipe'})
//     ]
//   })
// })

Test('rxTest.rawFlatMapPassivePassive', {
  impl: dataTest({
    calculate: ctx => { const {flatMap,fromIter,pipe,map,toPromiseArray} = rxUtils
      return toPromiseArray(pipe(fromIter([0]), flatMap(x=> pipe(fromIter([0]),map(x=>`-${x}-`) ) )))
    },
    expectedResult: equals('-0-')
  })
})

Test('rxTest.rawflatMapPassiveActive', {
  impl: dataTest({
    calculate: () => { const {interval, take,flatMap,fromIter,pipe,toPromiseArray} = rxUtils
      return toPromiseArray(pipe(fromIter([0]), flatMap(()=> pipe(interval(1), take(2)) ))).then(x=>x.join(','))
    },
    expectedResult: equals('0,1')
  })
})

Test('rxTest.rawConcatMapPassiveActive', {
  impl: dataTest({
    calculate: () => { const {interval, take,concatMap,fromPromise,pipe,toPromiseArray} = rxUtils
      return toPromiseArray(pipe(fromPromise(()=>coreUtils.delay(1)), concatMap(()=> pipe(interval(1), take(2)) ))).then(x=>x.join(','))
    },
    expectedResult: equals('0,1')
  })
})

Test('rxTest.rawflatMapActivePassive', {
  impl: dataTest({
    calculate: ctx => { const {interval, take,flatMap,fromIter,pipe,map,toPromiseArray} = rxUtils
      return toPromiseArray(pipe(interval(1), take(1), flatMap(x=> pipe(fromIter([0]),map(x=>`-${x}-`) ) )))
    },
    expectedResult: equals('-0-')
  })
})

Test('rxTest.rawflatMapActiveActive', {
  impl: dataTest({
    calculate: ctx => { const {interval, take,flatMap,fromIter,pipe,map,toPromiseArray} = rxUtils
      return toPromiseArray(pipe(interval(1), take(1), flatMap(x=> pipe(interval(1), take(1),map(x=>`-${x}-`) ) )))
    },
    expectedResult: equals('-0-')
  })
})

Test('rxTest.flatMapPassivePassive', {
  impl: dataTest(rx.pipe(rx.data(0), rx.flatMap(rx.pipe(rx.data(0), rx.map('-%%-')))), equals('-0-'))
})

Test('rxTest.flatMapActivePassive', {
  impl: dataTest({
    calculate: rx.pipe(interval(1), rx.take(1), rx.flatMap(rx.pipe(rx.data(0), rx.map('-%%-')))),
    expectedResult: equals('-0-')
  })
})

Test('rxTest.flatMapPassiveActive', {
  impl: dataTest({
    calculate: rx.pipe(rx.data(0), rx.flatMap(rx.pipe(interval(1), rx.take(1), rx.map('-%%-')))),
    expectedResult: equals('-0-')
  })
})

Test('rxTest.flatMapActiveActive', {
  impl: dataTest({
    calculate: rx.pipe(
      interval(1),
      rx.take(1),
      rx.flatMap(rx.pipe(interval(1), rx.take(1), rx.map('-%%-')))
    ),
    expectedResult: equals('-0-')
  })
})

Test('rxTest.mapPromiseActiveSource', {
  impl: dataTest({
    calculate: rx.pipe(interval(1), rx.take(1), rx.mapPromise(({data}) =>coreUtils.delay(1,data+2))),
    expectedResult: equals(2)
  })
})

Test('rxTest.rawMapPromiseTwice', {
  impl: dataTest({
    calculate: ctx => { 
      const {fromIter,pipe,mapPromise,toPromiseArray} = rxUtils
      return pipe(fromIter([0]), mapPromise(data =>coreUtils.delay(1,data+2)), mapPromise(data =>coreUtils.delay(1,data+2)))
    },
    expectedResult: equals(4)
  })
})

Test('rxTest.mapPromiseTwice', {
  impl: dataTest({
    calculate: rx.pipe(rx.data(0), rx.mapPromise('-%%-'), rx.mapPromise('-%%-')),
    expectedResult: equals('--0--')
  })
})

Test('rxTest.mapPromiseWithError', {
  impl: dataTest({
    calculate: rx.pipe(
      rx.data(0),
      rx.var('aa', 'aa'),
      rx.mapPromise(() => new Promise((res,rej) => { rej('error') })),
      rx.map('%$aa%-%$err%-%%')
    ),
    expectedResult: equals('aa-error-error'),
    allowError: true
  })
})

Test('rxTest.mapPromiseWithError2', {
  impl: dataTest({
    calculate: rx.pipe(
      rx.data(0),
      rx.var('aa', 'aa'),
      rx.mapPromise(async () => {throw 'error'}),
      rx.map('%$aa%-%$err%-%%')
    ),
    expectedResult: equals('aa-error-error'),
    allowError: true
  })
})

Test('rxTest.concatMapBug1', {
  impl: dataTest({
    calculate: rx.pipe(
      interval(1),
      rx.take(10),
      rx.concatMap(rx.promise(({data}) => coreUtils.delay(1,data+2))),
      rx.take(1)
    ),
    expectedResult: equals('2')
  })
})

Test('rxTest.concatMapOrderTiming', {
  impl: dataTest({
    calculate: pipe(
      rx.pipe(
        rx.data(list(1,2,3)),
        rx.var('inp'),
        rx.concatMap(rx.pipe(interval(({data}) => data), rx.take(3), rx.map('%$inp%-%%')))
      ),
      join(',')
    ),
    expectedResult: equals('1-0,1-1,1-2,2-0,2-1,2-2,3-0,3-1,3-2'),
    timeout: 500
  })
})

Test('rxTest.concatMapWithInterval', {
  impl: dataTest({
    calculate: rx.pipe(rx.data(1), rx.concatMap(rx.pipe(interval(20), rx.take(1)))),
    expectedResult: equals(0)
  })
})

Test('rxTest.concatMapCombine', {
  impl: dataTest({
    calculate: pipe(rx.pipe(rx.data([1,2]), rx.concatMap(rx.data(30), '%$input%-%%')), join(',')),
    expectedResult: equals('1-30,2-30')
  })
})

Test('rxTest.flatMapCtx', {
  impl: dataTest({
    calculate: pipe(
      rx.pipe(rx.data('a'), rx.var('inp'), rx.flatMap(rx.pipe(rx.data('%%'), rx.map('%%-%$inp%')))),
      join(',')
    ),
    expectedResult: equals('a-a')
  })
})

Test('rxTest.flatMapReturnArray', {
  impl: dataTest({
    calculate: pipe(rx.pipe(rx.data('1,2,3'), rx.flatMap(rx.data(split(',')))), join(',')),
    expectedResult: equals('1,2,3')
  })
})

Test('rxTest.flatMap.Arrays', {
  impl: dataTest(pipe(rx.pipe(rx.data(list('1,2,3')), rx.flatMapArrays(split())), join(',')), equals('1,2,3'))
})

Test('rxTest.flatMap.Vars', {
  impl: dataTest({
    calculate: rx.pipe(rx.data(1), rx.vars(obj(prop('v1', '%%'), prop('v2', '<%%%%>'))), rx.map('%$v1%;%$v2%')),
    expectedResult: equals('1;<11>')
  })
})

Test('rxTest.flatMap.timing', {
  impl: dataTest({
    calculate: pipe(
      rx.pipe(
        interval(1),
        rx.take(2),
        rx.var('inp'),
        rx.flatMap(rx.pipe(interval(14), rx.take(2), rx.map('%$inp%-%%')))
      ),
      join(',')
    ),
    expectedResult: equals('0-0,1-0,0-1,1-1')
  })
})

Test('rxTest.RawConcatMapBug1', {
  impl: dataTest({
    calculate: ctx => { const {interval,take,pipe,concatMap,fromPromise} = rxUtils
      return pipe(interval(1),take(1), concatMap(data => fromPromise(coreUtils.delay(1,data+2) )))
    },
    expectedResult: equals('2')
  })
})

Test('rxTest.RawFlatMapBug1', {
  impl: dataTest({
    calculate: ctx => { 
      const {interval,take,pipe,flatMap,fromPromise} = rxUtils
      return pipe(interval(1),take(1), 
        flatMap(data => fromPromise(coreUtils.delay(1,data+2) )), 
        flatMap(data => fromPromise(coreUtils.delay(1,data+2) )))
    },
    expectedResult: equals(4)
  })
})

Test('rxTest.doPromiseActiveSource', {
  impl: dataTest({
    calculate: rx.pipe(
      interval(1),
      rx.take(1),
      rx.doPromise(({data})=>coreUtils.delay(1,data *10)),
      rx.mapPromise(({data}) =>coreUtils.delay(1,data+2))
    ),
    expectedResult: equals('2')
  })
})

// Test('rxTest.subjectReplay', {
//   impl: dataTest({
//     vars: Var('subj', rx.subject({ replay: true })),
//     calculate: rx.pipe(subjectSource('%$subj%')),
//     expectedResult: equals('1'),
//     runBefore: runActions(subject.notify('%$subj%', '1'), subject.complete('%$subj%'))
//   })
// })

// Test('rxTest.subjectReplay', {
//   impl: dataTest({
//     vars: Var('subj', rx.subject({ replay: true })),
//     calculate: rx.pipe(subjectSource('%$subj%')),
//     expectedResult: equals('1'),
//     runBefore: runActions(subject.notify('%$subj%', '1'), subject.complete('%$subj%'))
//   })
// })

Test('rxTest.throwPromiseRejection', {
  impl: dataTest({
    calculate: rx.pipe(rx.promise(() => new Promise((res,rej) => coreUtils.delay(1,rej('err')))), rx.catchError(), rx.map('%%1')),
    expectedResult: equals('err1')
  })
})

Test('rxTest.throwPromiseRejectionInDoPromise', {
  impl: dataTest({
    calculate: rx.pipe(
      rx.data(1),
      rx.doPromise(() => new Promise((res,rej) => coreUtils.delay(1,rej('err')))),
      rx.catchError(),
      rx.map('%%1')
    ),
    expectedResult: equals('err1')
  })
})

Test('rxTest.throwInMapPromise', {
  impl: dataTest({
    calculate: rx.pipe(
      rx.data(2),
      rx.mapPromise(() => coreUtils.delay(1).then(() => { throw 'err' })),
      rx.catchError(),
      rx.map('%%1')
    ),
    expectedResult: equals('err1')
  })
})

Test('rxTest.throwInMapPromise2', {
  impl: dataTest({
    vars: [
      Var('$throw', true)
    ],
    calculate: rx.pipe(rx.data(2), rx.mapPromise(() => { throw 'err'}), rx.catchError(), rx.map('%%1')),
    expectedResult: equals('err1')
  })
})

Test('rxTest.rx.throwError', {
  impl: dataTest({
    calculate: pipe(rx.pipe(rx.data([1,2,3,4]), rx.throwError('%%==3', 'error'), rx.catchError()), join(',')),
    expectedResult: equals('1,2,error')
  })
})

Test('rxTest.throwErrorInterval', {
  impl: dataTest({
    calculate: pipe(rx.pipe(interval(1), rx.take(10), rx.throwError('%%==3', 'error'), rx.catchError()), join(',')),
    expectedResult: equals('0,1,2,error')
  })
})


Test('rxTest.emptyVar', {
  impl: dataTest(rx.pipe(rx.data(1), rx.var('')), '%%==1')
})

const paramedRxPipe = ReactiveSource({
  params: [
    {id: 'source', type: 'reactive-source'},
    {id: 'op', type: 'reactive-operator'}
  ],
  impl: rx.pipe('%$source%','%$op%')
})

Test('rxTest.dynamicParam', {
  impl: dataTest(rx.pipe(paramedRxPipe(rx.data(1), rx.map('a%%'))), '%%==a1')
})

// Test('rxTest.snifferBug', {
//   impl: dataTest({
//     vars: [
//       Var('a', () => ({ val: 1}))
//     ],
//     calculate: '%$a/val%',
//     expectedResult: '%%==2',
//     runBefore: rx.pipe(rx.data(1), rx.map('2'), sink.data('%$a/val%'))
//   })
// })

Test('rxTest.race', {
  impl: dataTest(rx.pipe(merge(rx.pipe(rx.data('a'), rx.delay(1)), rx.data('b')), rx.take(1)), '%%==b')
})

Test('rxTest.mergeConcat', {
  impl: dataTest({
    calculate: pipe(rx.pipe(mergeConcat(rx.pipe(rx.data('a'), rx.delay(1)), rx.data('b')), rx.take(2)), join(',')),
    expectedResult: '%%==a,b'
  })
})

Test('rxTest.delay', {
  impl: dataTest(pipe(rx.pipe(rx.data([1,2,3]), rx.delay(1), rx.log('test')), join(',')), '%%==1,2,3')
})

Test('rxTest.timeoutLimit', {
  impl: dataTest({
    calculate: rx.pipe(rx.data(1), rx.delay(1), rx.timeoutLimit(1, 'timeout error'), rx.catchError()),
    expectedResult: '%%==timeout error'
  })
})

Test('rxTest.timeoutLimit.notActivated', {
  impl: dataTest(rx.pipe(rx.data(1), rx.delay(1), rx.timeoutLimit(100, 'timeout error'), rx.catchError()), '%%==1')
})

// Test('rxTest.fork', {
//   impl: dataTest({
//     vars: [Var('a', obj())],
//     calculate: pipe(
//       rx.pipe(
//         rx.data(list(1,2,3,4)),
//         rx.fork(rx.take(1), sink.data('%$a/fork%')),
//         rx.skip(1),
//         rx.take(1)
//       ),
//       join(',')
//     ),
//     expectedResult: equals('%%,%$a/fork%', '2,1')
//   })
// })

Test('rxTest.resource', {
  impl: dataTest({
    calculate: pipe(
      rx.pipe(
        rx.data(list(1,2,3)),
        rx.resource('acc', obj(prop('sum', 0))),
        rx.do(({data},{acc}) => acc.sum += data),
        rx.map('%%-%$acc/sum%')
      ),
      join(',')
    ),
    expectedResult: equals('1-1,2-3,3-6')
  })
})
