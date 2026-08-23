import '@jb6/lang-service'
import './lang-service-testers.js'
import { dsls, coreUtils } from '@jb6/core'
const { prettyPrint, prettyPrintComp, asJbComp } = coreUtils

const { 
  tgp: { Const, TgpType, 
    'ctx-enricher': { Var } 
  },
  ui: { Control,
    control: { group, text, html }
  },
  common: { Data, Action, Boolean,
    data: { pipeline, list, split }, 
    boolean: { equals, contains, notContains, and, not },
    prop: { prop },
  },
  test: { Test,
    test: { dataTest, actionMapTest, prettyPrintTest }
  }
} = dsls

Test('actionMapTest.simple', {
  impl: actionMapTest(() => split(',' , {text: '%%', part: 'first'}), 'data<common>', 'propInfo!~part', '29,35')
})

Test('actionMapTest.varsPath', {
  impl: actionMapTest(() => split({vars: [Var('a', 100), Var('b', 'txt')]}), 'data<common>', 'edit!~vars~0~val', '26,26')
})

Test('actionMapTest.varsPathSingleVar', {
  impl: actionMapTest(() => split({vars: Var('a', 'b')}), 'data<common>', 'edit!~vars~val', '26,26')
})

Test('actionMapTest.varsPathInPipeline', {
  impl: actionMapTest(() => pipeline(Var('a', 'b'),'hello'), 'data<common>', 'edit!~vars~0~val', '19,19')
})

Test('actionMapTest.singleParamByName', {
  impl: actionMapTest('pipeline(singleParamByNameComp({p1: true}))', 'data<common>', 'begin!~source~p1', '36,36')
})

Test('actionMapTest.secondParamAsArray', {
  impl: actionMapTest(() => pipeline(list(1,2), '%%'), 'data<common>', 'begin!~operators~0', '20,20')
})

Test('actionMapTest.secondParamAsArrayWithVars', {
  impl: actionMapTest(() => pipeline(Var('a', 3), '%%', 'aa'), 'data<common>', 'begin!~operators~0', '28,28')
})

Test('actionMapTest.secondParamAsArrayWithLongVars', {
  impl: actionMapTest({
    profile: () => pipeline(Var('a', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), '%%', 'aaaaaaaaaaaaaaaaaaaaaadasdaaaaaaaaaaaaaaaaaaaaa'),
    expectedType: 'data<common>',
    path: 'begin!~operators~0',
    expectedPos: '82,82'
  })
})

Test('actionMapTest.prependInGroup', {
  impl: actionMapTest(() => group(text(''), text('')), 'control<ui>', 'prependPT!~controls', '6,6')
})

Test('actionMapTest.prependSingleInArrayPath', {
  impl: actionMapTest(() => group(text('')), 'control<ui>', 'prependPT!~controls', '6,6')
})

Test('actionMapTest.singleInArrayPath', {
  impl: actionMapTest(() => group(text('')), 'control<ui>', 'begin!~controls~text', '11,11')
})

const multiLineExample = `Control('multiLineExample', {
  params: [
    {id: 'param1'}
  ],
  impl: group(
    text('hello'),
    group(text('-1-'), controlWithCondition('1==2', text('-1.5-')), text('-2-')),
    text('world')
  )
})`

Test('actionMapTest.multiLine.prepend', {
  impl: actionMapTest(multiLineExample, 'comp<tgp>', 'prependPT!control<ui>multiLineExample~impl~controls', '80,85')
})

Test('actionMapTest.param', {
  impl: actionMapTest(multiLineExample, 'comp<tgp>', 'begin!control<ui>multiLineExample~params~0', '46,46')
})

Test('actionMapTest.multiLine.implBegin', {
  impl: actionMapTest(multiLineExample, 'comp<tgp>', 'begin!control<ui>multiLineExample~impl', '74,74')
})

Test('actionMapTest.multiLine.implEnd', {
  impl: actionMapTest(multiLineExample, 'comp<tgp>', 'end!control<ui>multiLineExample~impl', '203,203')
})

Test('prettyPrintTest.ns', {
  impl: prettyPrintTest('group.count()', 'group-prop<common>', equals('group.count()'))
})

Test('actionMapTest.newLinesInCode', {
  impl: dataTest({
    calculate: () => {
      const profile = html(`<div>\n</div>`)
      return prettyPrint(profile, {tgpModel : {dsls: jb.dsls}, type: 'control<ui>'})
    },
    expectedResult: equals('html(`<div>\n</div>`)')
  })
})

/*
Data('actionMapTest.dslNameOverideExample', {
  type: 'settlement<location>',
  impl: pipeline({ state: israel() })
})

Test('actionMapTest.dslNameOveride', {
  impl: actionMapTest(() => jb.comps['settlement<location>actionMapTest.dslNameOverideExample'], 'settlement<location>', 'addProp!~impl~state', '113,113')
})

Test('actionMapTest.remark.pipeline', {
  impl: dataTest({
    calculate: pipeline(
      () => prettyPrintWithPositions(pipeline(Var('x',1), 'a' , {'//': 'hello'}),{type: 'data<common>', singleLine: true}),
      log('test'),
      '%text%'
    ),
    expectedResult: equals(`pipeline(Var('x', 1), 'a', { '//': 'hello' })`)
  })
})


Test('actionMapTest.Positions.closeArray', {
  impl: actionMapTest({
    profile: () => text('hey', { features: [css.color('green'), css.color('green')] }), 
    expectedType: 'control<ui>',
    path: 'end!~features',
    expectedPos: '65,65'
  })
})

Data('test.foldFunction', {
  impl: pipeline({
    source: () => prettyPrintWithPositions(frontEnd.var('itemPropsProfile', ({ }, { $model }) => 
      $model.itemProps.profile) , {type: 'feature<>', }),
    operators: ['%text%']
  })
})

Test('actionMapTest.posOfFoldFunctionBug', {
  impl: dataTest(() => getPosOfPath('data<common>test.foldFunction~impl~operators~0'), equals('%line%', 4))
})

Test('actionMapTest.singleFunc', {
  impl: actionMapTest(() => frontEnd.init(({ }, { }) => 5), 'feature<>', 'function!~action', '14,29')
})

Test('actionMapTest.byValue.cutTailingUndefinedArgs', {
  impl: dataTest(() => prettyPrint(css.boxShadow({ inset: false }), {type: 'feature<>'}), notContains('undefined'))
})

*/

Test('actionMapTest.packedPrimitiveArray', {
  impl: actionMapTest(() => list(1, 2, 3, 4), 'data<common>', 'end!', '13,13')
})

Test('actionMapTest.async', {
  impl: dataTest(() => prettyPrint({ async a() { 3 } }), and(not(contains('a:')), contains('async a() { 3 }')))
})

Test('actionMapTest.asyncInProfile', {
  impl: dataTest({
    calculate: () => prettyPrint(dataTest(async () => { 5 }), {type: 'test<test>'}),
    expectedResult: and(not(contains('a:')), contains('async () => { 5 }'))
  })
})

Test('actionMapTest.funcDefaults', {
  impl: dataTest({
    calculate: () => prettyPrint({ aB(c, { b } = {}) { 3 } }),
    expectedResult: and(not(contains('aB:')), contains('aB(c, { b } = {}) { 3 }')),
  })
})

Test('importJb6FileTest.twoTests', {
  impl: dataTest({
    vars: Var('fileContent' , `Test('aa1', {
  impl: dataTest(pipeline('a'), equals('a'))
})

Test('aa2', {
  impl: dataTest(pipeline('a'), equals('a'))
})
`),
    calculate: (ctx,{fileContent}) => {
      jb.langServiceUtils.importJb6File(fileContent, {filePath: '/myPath'}) 
      return jb.dsls.test.test.aa2.impl.calculate.$
    },
    expectedResult: equals('pipeline'),
  })
})

// Test('prettyPrintTest.forward', {
//   impl: dataTest({
//     calculate: () => prettyPrintComp(Data.forward('forward2')[asJbComp],{tgpModel: { dsls: jb.dsls }}),
//     expectedResult: contains("id: 'inp', as: 'string'"),
//   })
// })

// Data('forward2', {
//   params: [
//     {id: 'inp', as: 'string'}
//   ],
//   impl: '%$inp%'
// })

/*

Test('actionMapTest.asIs', {
  impl: dataTest(() => prettyPrint(asIs({remoteRun: { $: 'runCtx' }})), contains('$:'))
})

/*

Test('actionMapTest.asIsLarge', {
  impl: dataTest({
    calculate: () => prettyPrint(equals(asIs({ edit: { range: {start: {line: 3, col: 0}, end: {line: 3, col: 0}},
    newText: `Test('dataTest.test.tst1', {\n  impl: dataTest(test.tst1(), equals(''))\n})` }, cursorPos: {line: 4, col: 0} })
  ), {type: 'data<common>'}),
    expectedResult: equals(`equals(asIs({\n    edit: {\n      range: {start: {line: 3, col: 0}, end: {line: 3, col: 0}},\n      newText: \`Test('dataTest.test.tst1', {\\n  impl: dataTest(test.tst1(), equals(''))\\n})\`\n    },\n    cursorPos: {line: 4, col: 0}\n}))`)
  })
})

// Test('actionMapTest.tooLong', {
//   impl: dataTest({
//     calculate: () => prettyPrintComp('UiTreeTest.treeDD.sameArray',jb.comps['test<test>UiTreeTest.treeDD.sameArray']),
//     expectedResult: contains('\n')
//   })
// })

Test('actionMapTest.typeAdapter.from', {
  impl: dataTest({
    calculate: prettyPrint(() => typeAdapter('state<location>', israel()), true),
    expectedResult: equals(`typeAdapter('state<location>', israel())`)
  })
})

Test('actionMapTest.asIs', {
  impl: dataTest({
    calculate: prettyPrint(() => equals('hello', asIs({ line: 1, col: 47 })), {
      type: 'boolean<common>'
    }),
    expectedResult: equals(`equals('hello', asIs({line: 1, col: 47}))`)
  })
})

Test('actionMapTest.typeAdapter.to', {
  impl: dataTest(pipeline(typeAdapter('state<location>', israel()), '%capital/name%'), equals('Jerusalem'))
})

*/