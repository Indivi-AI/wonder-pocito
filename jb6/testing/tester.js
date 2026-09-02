import { coreUtils, dsls } from '@jb6/core'
import '@jb6/common/essentials.js'

const { Ctx, jb, logException, asJbComp, delay, waitForInnerElements, globalsOfTypeIds, unique, isNode } = coreUtils
jb.testingUtils = {runTest, runTests, runTestVm, runTestInVm}
jb.testingRepository = {}

const {
  tgp: {TgpType, Component},
  test: { Logger, logger: { domainLogger } }
} = dsls

const Test = TgpType('test', 'test', { isCircuit: true })

Component('dataTest', {
  type: 'test<test>',
  params: [
    {id: 'calculate', type: 'data', dynamic: true},
    {id: 'expectedResult', type: 'boolean', dynamic: true},
    {id: 'runBefore', type: 'action', dynamic: true},
    {id: 'setup', type: 'ctx-enricher<tgp>', dynamic: true, description: 'ctx enricher that runs before runBefore and calculate'},
    {id: 'timeout', as: 'number', defaultValue: 200},
    {id: 'allowError', as: 'boolean', dynamic: true, type: 'boolean'},
    {id: 'cleanUp', type: 'action', dynamic: true},
    {id: 'expectedCounters', as: 'single', description: 'per-logger expected entry count, e.g. {retryLogger: 5} asserts ctx.vars.retryLogger.retryLog.length === 5'},
    {id: 'logger', as: 'string', description: 'e.g "dbLogger" or comma-separated "makeLogger,dbLogger"'}
  ],
  impl: async (ctx,{}, { calculate,expectedResult,runBefore,setup,timeout,allowError,cleanUp,expectedCounters, logger }) => {
        logger = ctx.vars.overrideTestLoggers ?? logger   // ambient override (e.g. from runTest mcp) wins over the profile's logger param, without editing the test
        const loggerNames = [...new Set(['errorLogger', ...(logger || '').split(',').map(s => s.trim()).filter(Boolean)])]   // errorLogger always-on + always harvested
        const loggerObj = Object.fromEntries(
          loggerNames.map(n => [n, (dsls.test.logger[n]
            || Logger(n, {impl: domainLogger(n.replace(/Logger$/, ''))})).$runWithCtx(ctx)])
        )
        const testID = ctx.vars.testID || (ctx.jbCtx.lexicalStack.slice(-1)[0]||'').split('~')[0]
		let ctxToUse = ctx.setVars({testID, isTest: true, testSessionId: `test-${Date.now()}`, testLoggers: logger, ...loggerObj})
		if (!isNode) globalThis.jbLoggers = ctxToUse.vars
		if (setup.profile || typeof setup === 'function') ctxToUse = await setup(ctxToUse) || ctxToUse
		const {singleTest}  = ctxToUse.vars
		const remoteTimeout = testID.match(/([rR]emote)|([wW]orker)|(jbm)/) ? 15000 : null
		const _timeout = singleTest ? Math.max(1000,timeout) : (remoteTimeout || timeout)
		ctxToUse = ctxToUse.setVars({testTimeout: _timeout})   // ambient: lambda layer derives a shorter server deadline from it
		let result = null, testRes
		const withLogs = r => {
			const logResults = Object.fromEntries(loggerNames.flatMap(n => Object.entries(ctxToUse.vars[n]?.logsAndErrors?.() || {})))
			const isPlainObj = r && typeof r === 'object' && !Array.isArray(r)
			return isPlainObj ? { ...r, ...logResults } : { result: r, ...logResults }
		}
		try {
			testRes = await Promise.race([ 
				!singleTest && (async() => {
					await delay(_timeout)
					return {testFailure: `timeout ${_timeout}mSec`}
				})(),
				(async() => {
					await runBefore(ctxToUse)
					let res
					try {
						res = await calculate(ctxToUse)
					} catch (error) {
						res = [{testFailure: error.stack}]	
					}
					const _res = await waitForInnerElements(res)
					return _res
				})()
			].filter(Boolean))
			let testFailure = testRes?.[0]?.testFailure || testRes?.testFailure
			const countersErr = countersErrors(expectedCounters,allowError,ctxToUse)
            const counters = Object.fromEntries(Object.keys(expectedCounters || {}).map(loggerName => [loggerName, loggerLogCount(ctxToUse, loggerName)]))
			const expectedResultCtx = ctxToUse.setData(testRes)
			const expectedResultRes = !testFailure && await expectedResult(expectedResultCtx)
			testFailure = expectedResultRes?.testFailure
			const success = !! (expectedResultRes && !countersErr && !testFailure)
			ctxToUse.vars.testLogger?.info?.({t: 'check test result', testRes, success, expectedResultRes, testFailure, countersErr, expectedResultCtx}, {}, {ctx: ctxToUse})
			result = { id: testID, success, reason: countersErr || testFailure, testRes: withLogs(testRes), counters}
		} catch (e) {
			logException(e,'error in test',{ctx})
			result = { testID, success: false, reason: 'Exception ' + e, testRes: withLogs(testRes) }
		} finally {
			const doNotClean = ctx.probe || singleTest
			if (!doNotClean) await (!singleTest && cleanUp())
		} 
		return result
	}
})

// run tests

globalThis.jb = jb

async function runTestVm(args, ctx) {
    const {testID, params, resources, builtIn, vmId, importMap, staticMappings} = args
    const vmLogger = ctx?.vars?.vmLogger
    vmLogger?.info?.({t: 'runTestVm start', testID, vmId, isNode, hasCtx: !!ctx, hasResources: !!resources, builtIn: builtIn ? Object.keys(builtIn) : null}, {}, {ctx})
    if (!isNode) {
        const script = `import { jb, coreUtils } from '@jb6/core'
    import '@jb6/testing/tester.js'
    ;(async()=>{
    try {
      console.error('[trace cli-script] before runTestVm ${testID}')
      const result = await jb.testingUtils.runTestVm(${JSON.stringify(args)})
      console.error('[trace cli-script] after runTestVm', JSON.stringify(result).slice(0,200))
      await coreUtils.writeServiceResult(result || '')
    } catch (e) { console.error('[trace cli-script] EXCEPTION', e.stack || e) }
    })()`
          vmLogger?.info?.({t: 'calling runNodeCliViaJbWebServer', testID}, {}, {ctx})
          const res = await coreUtils.runNodeCliViaJbWebServer(script, {ctx})
          vmLogger?.info?.({t: 'runNodeCliViaJbWebServer returned', testID, hasResult: !!res?.result,
            error: res?.error, keys: Object.keys(res || {}), stderr: String(res?.stderr || '').slice(0, 500),
            textToParse: String(res?.textToParse || '').slice(0, 500)}, {}, {ctx})
          return res.result
      }
      await import ('@jb6/core/misc/jb-vm.js')
      const testVm = await coreUtils.getOrCreateVm({vmId, resources, builtIn, importMap, staticMappings, vmLogger, ctx})
      vmLogger?.info?.({t: 'vm ready', testID, hasVm: !!testVm}, {}, {ctx})
      if (!testVm) {
        ctx?.vars?.errorLogger.error({t: 'no vm', testID, resources}, {}, {ctx})
        return { error: 'getOrCreateVm returned null', testID, resources }
      }
      try {
        const result = await testVm.evalScript(`jb.testingUtils.runTestInVm('${testID}', ${JSON.stringify(params || {})})`)
        vmLogger?.info?.({t: 'runTestVm done', testID, hasResult: !!result, success: result?.success}, {}, {ctx})
        return result
      } catch (e) {
        vmLogger?.error?.({t: 'runTestVm error', testID, error: e.stack || e.message || String(e)}, {}, {ctx})
        return { error: e.stack || e.message || String(e) }
      }
}

async function runTestInVm(testID, params, httpReqId) {
    const jbComp = Test[testID][asJbComp]
    let res = {}
    const start = Date.now()
    try {
        const ctx = new Ctx().setVars({ testID, singleTest: true, httpReqId })
        debugger
        res = await jbComp.runProfile(params, ctx)
        console.log('test res', res)
    } catch (e) {
        res = { success: false, reason: e}
    }
    res.duration = Date.now() - start
    return res
}

export async function runTest(testID, {fullTestId, singleTest, httpReqId, params} = {}) {
    !singleTest && await cleanBeforeRun()
    const jbComp = Test[testID][asJbComp]
    const testCtx = coreUtils.ensureLoggers('testLogger')
    testCtx.vars.testLogger?.info?.({t: 'start test', testID}, {}, {ctx: testCtx})
    let res = null
    const start = Date.now()
    if (!isNode && jbComp.nodeOnly) {
        const profile = { $: `${jbComp.type}<${jbComp.dsl}>${jbComp.id}`, ...(params || {}) }
        const logCtx = coreUtils.ensureLoggers(['testLogger', 'snippetLogger', 'cliLogger'])
        const cliRes = await coreUtils.runSnippetCli({ profile, logger: 'snippetLogger,cliLogger', ctx: logCtx })
        res = cliRes?.result || cliRes || { success: false, reason: 'no result from node CLI' }
        res.duration = Date.now() - start
        logCtx.vars.testLogger?.info?.({t: 'nodeOnly via web server', testID, totalMs: res.duration}, {}, {ctx: logCtx})
        if (!isNode) globalThis.jbLoggers = logCtx.vars   // expose to playwrightHarvest
        return res
    }
    try {
        const ctx = new Ctx().setVars({ testID, fullTestId,singleTest, httpReqId, win1: globalThis })
        res = await jbComp.runProfile({...params}, ctx)
    } catch (e) {
        res = { success: false, reason: e}
    }
    res.duration = Date.now() - start
    testCtx.vars.testLogger?.info?.({t: 'end test', testID, res}, {}, {ctx: testCtx})
    if (!singleTest && !jbComp.doNotTerminateWorkers)
        await jb.jbm?.terminateAllChildren(tstCtx)		
    return res
}

// expectedCounters gate reads the LOGGER INSTANCES in ctx.vars (the real test gate), not the browser-only browserSpy.
// key = logger name, value = expected number of entries in that logger's main <domain>Log (e.g. {retryLogger: 5}).
function loggerLogCount(ctx, loggerName) {
    const inst = ctx?.vars?.[loggerName]
    const logsAndErrors = inst?.logsAndErrors?.({stripData: false}) || {}
    const mainLog = Object.values(logsAndErrors)[0]   // domainLogger returns {[<domain>Log]: [...], [<domain>Errors]: [...]}; first is the log
    return Array.isArray(mainLog) ? mainLog.length : 0
}

function countersErrors(expectedCounters,allowError,ctx) {
    // automatic error gate: every domain .error() tees into the always-on errorLogger (jb-logging.js), so its errorErrors
    // aggregates ALL logger errors. Unless the test opts in via allowError, any such error fails the test.
    const loggedErrors = ctx?.vars?.errorLogger?.errorErrors || []
    if (!allowError() && loggedErrors.length) return loggedErrors[0].error || loggedErrors[0].t || JSON.stringify(loggedErrors[0])

    return Object.keys(expectedCounters || {}).map(loggerName => {
        const actual = loggerLogCount(ctx, loggerName)
        return expectedCounters[loggerName] != actual ? `${loggerName}: ${actual} instead of ${expectedCounters[loggerName]}` : ''
    }).filter(x=>x).join(', ')
}

let cleaners = []

async function cleanBeforeRun() {
    cleaners.forEach(c=>c())
}

let success_counter= 0, fail_counter = 0
const startTime = Date.now()
const usedJSHeapSize = () => (globalThis.performance?.memory?.usedJSHeapSize || Math.round(process.memoryUsage().heapUsed)) / 1000000

function spyParamForTest(testID) {
    return testID.match(/uiTest|[Ww]idget/) ? 'test,uiTest,headless' : 'test'
}

let   lastLineLength = 0     // to wipe residual chars when we overwrite

const printLive = line => {
  const pad = ' '.repeat(Math.max(lastLineLength - line.length, 0))
  if (isNode)
    console.log('\r' + line + pad)
  else
    console.log(line)
  lastLineLength = line.length
}

const printFail = line => {
  const redLine = `\x1b[31m${line}\x1b[0m`; // Add red color
  if (isNode)
    console.log('\r' + redLine + '\n')   // newline keeps the failure
  else
    console.log(redLine)
  lastLineLength = 0
}

export async function runTests({specificTest,show,pattern,notPattern,take,repo,showOnly,includeHeavy}={}) {
    specificTest = specificTest && decodeURIComponent(specificTest).split('>').pop()

    let tests = globalsOfTypeIds(Test)
        .filter(id =>!specificTest || id == specificTest)
        .filter(id => specificTest || includeHeavy || !Test[id][asJbComp]?.HeavyTest)
        .filter(id => specificTest || !Test[id][asJbComp]?.doNotRunInTests)
        .filter(id =>!pattern || id.match(pattern))
        .filter(id =>!notPattern || !id.match(notPattern))
        .map(id => ({testID:id}) ) // put in object to assign to groups

    tests.forEach(e => e.group = e.testID.split('.')[0].split('Test')[0]) // assign group by test name
    const priority = 'net,data,ui,rx,suggestionsTest,remote,studio'.split(',').reverse().join(',')
    const groups = unique(tests.map(e=>e.group)).sort((x,y) => priority.indexOf(x) - priority.indexOf(y))
    tests.sort((y,x) => groups.indexOf(x.group) - groups.indexOf(y.group))
    if (take)
        tests = tests.slice(0,take)
    const singleTest = tests.length == 1

    if (globalThis.document) document.body.innerHTML = showOnly ? ''
        : `<div style="font-size: 20px">
            <div id="progress"></div>
            <span id="fail-counter" onclick="hide_success_lines()"></span>
            <span id="success-counter"></span><span>, total ${tests.length}</span>
            <span id="time"></span>
            <span id="memory-usage"></span>
        </div>`
    let counter = 0
    await tests.reduce(async (pr,{testID}) => {
        await pr;
        counter++
        if (counter % 50 == 0)
            await delay(1) // gc
        const fullTestId = `test<test>${testID}`
        const runningMsg = `${counter}: ${testID} started`

        let res
        if (showOnly) {
            res = await runTest(testID, { fullTestId, singleTest })
        } else if (!showOnly) {
            !isNode && (document.getElementById('progress').innerHTML = runningMsg)
            printLive(runningMsg)
            res = await runTest(testID, { fullTestId, singleTest })
            printLive(`${counter}: ${testID} ended`)
            res = { ...res, fullTestId, testID}
            res.success ? success_counter++ : fail_counter++

            if (!isNode) {
                updateTestHeader(document)
                addHTML(document.body, testResultHtml(res, repo), {beforeResult: singleTest && res.renderDOM})
            }
            if (!res.success)
                 printFail(`${testID} ${res.reason || JSON.stringify(res,2,null) || 'unknown error'}`)
        }
        if (globalThis.document && (showOnly || (!res.renderDOM && show))) {
            const testElem = document.createElement('div')
            testElem.className = 'show elemToTest'
            document.body.appendChild(testElem)
            // todo - show here
        }
    }, Promise.resolve())
    const summary = `total: ${tests.length}, \x1b[32msuccess: ${success_counter}, \x1b[31mfailures: ${fail_counter}, `
      + `\x1b[33mmemory: ${usedJSHeapSize()}M, time: ${Date.now() - startTime} ms`
    if (isNode) {
        printLive(summary+'\n')
        process.exit(0)
    }
}

function testResultHtml(res, repo) {
    const baseUrl = globalThis.location.href.split('/tests.html')[0]
    const { success, duration, reason, testID} = res
    const studioUrl = ''
    const _repo = repo ? `&repo=${repo}` : ''
    const modulePath = new URLSearchParams(globalThis.location.search).get('modulePath')
    const _modulePath = modulePath ? `&modulePath=${encodeURIComponent(modulePath)}` : ''
    return `<div class="${success ? 'success' : 'failure'}">
        <a href="${baseUrl}/tests.html?test=${testID}${_repo}${_modulePath}&show&browserSpy=${spyParamForTest(testID)}" style="color:${success ? 'green' : 'red'}">${testID}</a>
        <span> ${duration}mSec</span> 
        <a class="test-button" href="javascript:goto_editor('${testID}','${repo||''}')">src</a>
        <a class="test-button" href="${studioUrl}">studio</a>
        <a class="test-button" href="javascript:profileSingleTest('${testID}')">profile</a>
        <span>${reason||''}</span>
        </div>`
}

function updateTestHeader(topElem) {
    topElem.querySelector('#success-counter').innerHTML = ', success ' + success_counter;
    topElem.querySelector('#fail-counter').innerHTML = 'failures ' + fail_counter;
    topElem.querySelector('#fail-counter').style.color = fail_counter ? 'red' : 'green';
    topElem.querySelector('#fail-counter').style.cursor = 'pointer';
    topElem.querySelector('#memory-usage').innerHTML = ', ' + usedJSHeapSize() + 'M memory used';
    topElem.querySelector('#time').innerHTML = ', ' + (new Date().getTime() - startTime) +' mSec';
}

globalThis.goto_editor = (fullTestId,repo) => {
    const loc = Test[fullTestId][asJbComp].$location
    const filePos = `.${loc?.path}:${loc?.line}`
    fetch(`/gotoSource?filePos=${filePos}`)
}
globalThis.hide_success_lines = () => globalThis.document.querySelectorAll('.success').forEach(e=>e.style.display = 'none')
globalThis.profileSingleTest = testID => {
    const ctx = new Ctx().setVars({ testID })
    Test[testID][asJbComp]?.runProfile({}, ctx)
}

function addHTML(el,html,{beforeResult} = {}) {
    const elem = document.createElement('div')
    elem.innerHTML = html
    const toAdd = elem.firstChild
    if (beforeResult && document.querySelector('#jb-testResult'))
        el.insertBefore(toAdd, document.querySelector('#jb-testResult'))
    else
        el.appendChild(toAdd)
}
