import { dsls, coreUtils, ns } from '@jb6/core'
import '../misc/probe.js'
import '@jb6/rx'
import '@jb6/rx/rx-common.js'
import '@jb6/rx/rx-misc.js'
import '@jb6/testing'

const { runProbe, runProbeCli, runNodeCli } = coreUtils

const {
  tgp: { Const, TgpType,
    'ctx-enricher': { Var }
  },
  rx: { 'reactive-source': { interval } },
  common: { Data, Action, Boolean,
    data: { pipeline, filter, join, property, obj, delay, asIs, pipe },
    Boolean: { contains, equals, and },
    Prop: { prop }
  },
  test: { Test,
    test: { dataTest }
  }
} = dsls
const { rx } = ns

Test('coreTest.HelloWorld', {
  impl: dataTest(pipeline('hello world', '%%', join('')), and(contains('hello'), contains('world')))
})

Test('probeTest.helloWorld', {
  impl: dataTest({
    calculate: () => runProbe('test<test>coreTest.HelloWorld~impl~expectedResult'),
    expectedResult: equals('hello world', '%result.0.in.data%')
  })
})

Test('probeCliTest.helloWorld', {
  impl: dataTest({
    calculate: async () => {
      const repoRoot = await coreUtils.calcRepoRoot()
      const entryPointPaths = `${repoRoot}/hosts/test-project/a-tests.js`
      return runProbeCli('test<test>myTests.HelloWorld~impl~expectedResult',{entryPointPaths})
    },
    expectedResult: equals('hello world', '%probeRes.result.0.in.data%'),
    timeout: 2000
  })
})

Test('probeTest.innerInArray', {
  impl: dataTest({
    calculate: () => runProbe('test<test>coreTest.HelloWorld~impl~expectedResult~items~0'),
    expectedResult: and(equals('hello world', '%result.0.in.data%'), equals('%result.0.out%', true))
  })
})

Test('probeTest.innerInPipeline', {
  impl: dataTest({
    calculate: () => runProbe('test<test>coreTest.HelloWorld~impl~calculate~operators~0'),
    expectedResult: and(equals('hello world', '%result.0.in.data%'), equals('%result.0.out%', 'hello world'))
  })
})

// slow probe target: an rx interval emitting every 100ms, taken 5 times → the probe runs ~500ms.
// pipeline "does not wait for promises", but rx `pipe` DOES wait for reactive/callbag data, so the
// interval emits are spread over real time. this keeps the studio's live visitsProgress view mounted
// long enough to receive several throttled progress emits (one per ~100ms window) instead of a single
// final flush on a sub-10ms run. defined in probe-tests via @jb6/rx so it's available to the probe.
Test('probeTest.slowInterval', {
  impl: dataTest({
    calculate: pipe(rx.pipe(interval(100), rx.take(5)), join(',')),
    expectedResult: equals('0,1,2,3,4'),
    timeout: 2000
  })
})

const cmpAA = Data('cmpAA', {
  impl: 'cmpAA'
})

Test('circuitForAA', {
  HeavyTest: true,
  impl: dataTest(cmpAA(), true)
})

Test('probeTest.calcCircuit', {
  impl: dataTest({
    calculate: () => runProbe('data<common>cmpAA~impl'),
    expectedResult: equals('test<test>circuitForAA', '%circuitCmpId%')
  })
})

Test('probeCliTest.claudeDir', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: async () => {
      const repoRoot = await coreUtils.calcRepoRoot()
      const entryPointPaths = `${repoRoot}/hosts/test-project/a-tests.js`
      return runProbeCli('test<test>myTests.HelloWorld~impl~expectedResult',{entryPointPaths}, { claudeDir: `${repoRoot}/.probe-claude` })
    },
    expectedResult: equals('hello world', '%probeRes.result.0.in.data%'),
    timeout: 1000
  })
})

Test('cliTest.progressViaLogger', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx) => {
      ctx.vars.cliLogger.progress({t: '0'})
      const fromCli = []
      const onProgress = e => e.logger === 'cliLogger' && fromCli.push(e)
      coreUtils.eventEmitter.on('progress', onProgress)
      const script = `
        import { coreUtils } from '@jb6/core'
        import '@jb6/core/misc/jb-cli.js'
        let ctx = coreUtils.ensureLoggers('cliLogger', {wrapToStderr: true})
        ctx.vars.cliLogger.progress({t: '1'})
        await coreUtils.delay(20)
        ctx.vars.cliLogger.progress({t: '2'})
        await coreUtils.delay(20)
        await coreUtils.writeServiceResult('hi')
      `
      await coreUtils.runCliInContext(script, { ctx, bindLoggers: 'cliLogger' })
      coreUtils.eventEmitter.off('progress', onProgress)
      return fromCli
    },
    expectedResult: equals('1,2', join(',', { itemText: '%t%' })),
    timeout: 10000,
    logger: 'cliLogger'
  })
})

// verifies the loading-timeline step events reach the LOCAL eventEmitter (the studio's UI hook).
// all steps originate in the child (spawn,imports,calcCircuit,runCircuit) and travel as stderr JSONL,
// re-emitted by dispatchChildLine → cliLogger.progress → eventEmitter.
Test('probeCliTest.timelineSteps', {
  HeavyTest: true,
  impl: dataTest({
    calculate: async () => {
      const repoRoot = await coreUtils.calcRepoRoot()
      const entryPointPaths = `${repoRoot}/hosts/test-project/a-tests.js`
      const steps = []
      const onProgress = e => e?.step && steps.push(e.step)
      coreUtils.eventEmitter.on('progress', onProgress)
      await runProbeCli('data<common>cmpA~impl', { entryPointPaths })
      coreUtils.eventEmitter.off('progress', onProgress)
      return coreUtils.unique(steps).join(',')
    },
    expectedResult: and(contains('resolveImports'), contains('spawn'), contains('imports'), contains('calcCircuit'), contains('runCircuit')),
    timeout: 5000
  })
})

Test('probeCliTest.findTestFiles', {
  HeavyTest: true,
  impl: dataTest({
    calculate: async () => {
      const repoRoot = await coreUtils.calcRepoRoot()
      const entryPointPaths = `${repoRoot}/hosts/test-project/a-tests.js`
      const probeResArr = await Promise.all(['cmpA','cmpB','cmpC'].map(cmp =>
        runProbeCli(`data<common>${cmp}~impl`,{entryPointPaths})))
      const allData = probeResArr.map(x=>x.probeRes.result[0].in.data).join(',')
      return allData
    },
    expectedResult: equals('hello,hello,hello'),
    timeout: 10000
  })
})

// Test('genieTest.probeCliForSampleApplet', {
//   HeavyTest: true,
//   impl: dataTest({
//     calculate: async () => {
//       const entryPointPaths = '/home/shaiby/projects/Genie/public/applets/sampleApplet/sampleApplet-tests.js'
//       return runProbeCli('test<test>sampleAppletTest~impl~expectedResult',{entryPointPaths})  
//     },
//     expectedResult: '%probeRes/circuitRes/success%',
//     timeout: 2000
//   })
// })
