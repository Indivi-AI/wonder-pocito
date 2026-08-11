import { dsls, ns, coreUtils } from '@jb6/core'
import './mcp-testers.js'

const {
  tgp: { Const},
  test: { Test,
    test: { dataTest, mcpToolTest, mcpHttpTest, mcpUiResourceTest, mcpReactTest }
  },
  common: { Data, Action, Boolean,
    data: { pipe, pipeline, asIs, tgpModel, keys, join, filter }, 
    boolean: { equals, contains, notContains, and, not },
    prop: { prop },
  },
  mcp: { tool: { formatComp } },
} = dsls
const { json } = ns

Test('mcpTest.scrambleText', {
  HeavyTest: true,
  impl: mcpHttpTest('scrambleText', asIs({texts: 'hello world##test text'}), {
    expectedResult: equals('=QGby92dg8GbsVGa##\n0hXZ0BCdzVGd')
  })
})

// Test('mcpTest.compileTailwindCSS', {
//   HeavyTest: true,
//   impl: mcpToolTest('compileTailwindCSS', asIs({html: '<div class="p-6"></div>'}), {
//     expectedResult: contains('padding: calc(var(--spacing) * 6')
//   })
// })

// Test('mcpTest.compileTailwindCSSChart', {
//   HeavyTest: true,
//   impl: mcpToolTest('compileTailwindCSS', asIs({html: `<div class="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6">
//   <h2 class="text-2xl font-bold text-center mb-6">TITLE HERE</h2>
//   <div class="space-y-4">
//     <!-- Bars go here -->
//   </div>
// </div>`}), {
//     expectedResult: contains('padding: calc(var(--spacing) * 6')
//   })
// })

Test('genieMcpTest.wonderWorkflow', {
  HeavyTest: true,
  doNotRunInTests: true,
  impl: mcpToolTest('wonderWorkflow', asIs({userMessage: 'say hello'}), {
    repoRoot: '/home/shaiby/projects/Genie',
    jb6PackagesRoot: '/home/shaiby/projects/Genie/public/3rd-party/@jb6',
    importMapsInCli: './public/core/nodejs-importmap.js',
    expectedResult: contains('ello')
  })
})

Test('genieMcpTest.snippet', {
  HeavyTest: true,
  impl: mcpToolTest({
    tool: 'runTgpSnippet',
    args: asIs({
        profileText: `{$: 'data<common>pipeline', source: {$: 'data<common>asIs',
          val: [{name: 'Homer'}, {name: 'Bart'}]}, operators: ['%name%', {$: 'data<common>join', separator: ','}]}`
    }),
    mcpUrl: 'http://localhost:3000/mcp',
    expectedResult: contains('Homer')
  })
})

Test('mcpTest.snippet', {
  HeavyTest: true,
  impl: mcpToolTest({
    tool: 'runTgpSnippet',
    args: asIs({
        profileText: `{$: 'data<common>pipeline', source: {$: 'data<common>asIs',
          val: [{name: 'Homer'}, {name: 'Bart'}]}, operators: ['%name%', {$: 'data<common>join', separator: ','}]}`
    }),
    expectedResult: contains('Homer')
  })
})

Test('mcpTest.probe', {
  HeavyTest: true,
  impl: mcpToolTest({
    tool: 'runProbe',
    args: asIs({ probePath: 'test<test>coreTest.HelloWorld~impl~calculate~operators~0' }),
    expectedResult: contains('hello world')
  })
})

Test('mcpTest.snippetWithLogger', {
  HeavyTest: true,
  impl: mcpToolTest({
    tool: 'runTgpSnippet',
    args: asIs({
        profileText: `{$: 'data<common>pipeline', source: [1,2,3], operators: [{$: 'data<common>count'}]}`,
        logger: 'langServiceLogger'
    }),
    expectedResult: contains('langServiceLog')
  })
})

Test('mcpTest.probeWithLogger', {
  HeavyTest: true,
  impl: mcpToolTest({
    tool: 'runProbe',
    args: asIs({ probePath: 'test<test>coreTest.HelloWorld~impl~calculate~operators~0', logger: 'langServiceLogger' }),
    expectedResult: contains('langServiceLog')
  })
})

Test('mcpTest.formatCompNotFound', {
  HeavyTest: true,
  impl: dataTest({
    calculate: async () => (await formatComp.$run({fullCompId: 'test<test>notThere', logger: 'langServiceLogger'})).content[0].text,
    expectedResult: and(contains(`fullCompId 'test<test>notThere' not found`), contains('formatCompError')),
    timeout: 5000
  })
})

Test('mcpTest.formatComp', {
  HeavyTest: true,
  impl: dataTest({
    calculate: async () => (await formatComp.$run({
      fullCompId: 'test<test>mcpTest.formatCompNotFound', logger: 'langServiceLogger'
    })).content[0].text,
    expectedResult: and(contains('mcpTest.formatCompNotFound'), contains('"t": "formatComp"')),
    timeout: 5000
  })
})

Test('mcpTest.prettyPrintCompHeader', {
  impl: dataTest({
    calculate: () => [
      coreUtils.prettyPrintComp(formatComp, {tgpModel: jb}),
      coreUtils.prettyPrintComp(formatComp, {tgpModel: jb, compHeader: 'component'})
    ].join('\n'),
    expectedResult: and(contains(`Tool('formatComp'`), contains(`Component('formatComp'`), contains(`type: 'tool<mcp>'`))
  })
})

Test('mcpTest.playwrightHarvest', {
  HeavyTest: true,
  doNotRunInTests: true,
  impl: mcpToolTest({
    tool: 'playwrightHarvest',
    args: asIs({
      url: 'http://localhost:8083/packages/react/react-comp-view.html?logger=uiLogger&cmpId=codeMirrorTest&urlsToLoad=@jb6/react/tests/react-tests.js',
      uiActionJsonStr: `{"$":"ui-action<test>actions","actions":[{"$":"ui-action<test>selectInCodeMirror","from":2,"to":8}]}`,
      seedLocalStorage: 'mockAuthSeed',
      domSelector: 'body'
    }),
    expectedResult: and(contains('selected: lect-a'), contains('cm-editor'))
  })
})

Test('mcpReactTest.helloMcp', {
  HeavyTest: true,
  doNotRunInTests: true,
  impl: mcpUiResourceTest('helloMcp', contains('html'))
})

Test('mcpReactTest.helloMcp.react', {
  HeavyTest: true,
  doNotRunInTests: true,
  impl: mcpReactTest('helloMcp', ()=>({ textToShowAfter: '--hello mcp--' }))
})
