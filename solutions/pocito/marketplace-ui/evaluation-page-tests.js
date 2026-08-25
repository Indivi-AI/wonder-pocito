import { coreUtils, dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react/automation.js'
import '@jb6/react/tests/react-testers.js'
import '@wonder/db/db-drivers-live-repo.js'
import './evaluation-page.js'

const { common: { data: { asIs, evaluationPageGrade, evaluationPageLoad, evaluationPageSaveDefinitions, evaluationPageSaveRun,
  evaluationPageSeed, wonderPlatformSeed }, boolean: {and, contains, equals} },
  react: { ReactComp, 'react-comp': { comp, EvaluationPage }, 'ui-action': {actions, click, waitForText} },
  test: { Test, test: {dataTest, reactTest} } } = dsls

Test('evaluationPage.contracts', {
  impl: dataTest({
    calculate: () => ({result: ['data<common>evaluationPageSeed', 'data<common>evaluationPageNormalize', 'data<common>evaluationPageLoad',
      'data<common>evaluationPageSaveDefinitions', 'data<common>evaluationPageSaveRun', 'data<common>evaluationPageGrade',
      'data<common>evaluationPageSummary', 'react-comp<react>EvaluationPage'].every(id => coreUtils.compByFullId(id))}),
    expectedResult: equals('%result%', true)
  })
})

Test('evaluationPage.deterministicGraders', {
  impl: dataTest({
    calculate: async ctx => ({result: {
      exact: await evaluationPageGrade.$runWithCtx(ctx, {grader: {id: 'exact', name: 'Exact', kind: 'exact', required: true, threshold: 1},
        testCase: {input: 'Q', referenceOutput: 'Four'}, output: ' four ', durationMs: 10}),
      exactInvalidThreshold: await evaluationPageGrade.$runWithCtx(ctx, {
        grader: {id: 'exact', name: 'Exact', kind: 'exact', required: true, threshold: 0},
        testCase: {input: 'Q', referenceOutput: 'Four'}, output: 'wrong', durationMs: 10}),
      contains: await evaluationPageGrade.$runWithCtx(ctx, {grader: {id: 'facts', name: 'Facts', kind: 'contains', required: true, threshold: 0.5},
        testCase: {input: 'Q', referenceOutput: 'alpha. beta.'}, output: 'Alpha is present', durationMs: 10}),
      latency: await evaluationPageGrade.$runWithCtx(ctx, {grader: {id: 'latency', name: 'Latency', kind: 'latency', required: false,
        threshold: 20}, testCase: {input: 'Q'}, output: '', durationMs: 21})}}),
    expectedResult: and(
      equals('%result/exact/status%', 'passed'),
      equals('%result/exactInvalidThreshold/status%', 'failed'),
      equals('%result/contains/status%', 'passed'),
      equals('%result/contains/score%', 0.5),
      equals('%result/latency/status%', 'failed')
    )
  })
})

Test('evaluationPage.truthfulSummary', {
  impl: dataTest({
    calculate: () => ({result: dsls.common.data.evaluationPageSummary.$run({run: {total: 4, results: [
      {executionStatus: 'completed', grades: [{required: true, status: 'passed', score: 1}]},
      {executionStatus: 'completed', grades: [{required: true, status: 'failed', score: 0}]},
      {executionStatus: 'completed', grades: [{required: true, status: 'skipped', score: 0}]},
      {executionStatus: 'error', grades: []}]}})}),
    expectedResult: equals('%result%', asIs({total: 4, completed: 4, passed: 1, failed: 1, errors: 1, graderErrors: 0, notGraded: 1, score: 50}))
  })
})

Test('evaluationPage.persistence', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx, {testSessionId}) => {
      const roomWUrl = `room:fs-mem//evaluation-page-${testSessionId}`, seed = evaluationPageSeed.$runWithCtx(ctx)
      const run = {id: `run-${testSessionId}`, name: 'Persisted run', startedAt: Date.now(), total: 0, completed: 0, results: []}
      await evaluationPageSaveDefinitions.$runWithCtx(ctx, {roomWUrl, repo: {...seed, runIds: [run.id]}})
      await evaluationPageSaveRun.$runWithCtx(ctx, {roomWUrl, run})
      const loaded = await evaluationPageLoad.$runWithCtx(ctx, {roomWUrl})
      return {result: {datasets: loaded.datasets.length, graders: loaded.graders.length, runId: loaded.runs[0]?.id},
        ...coreUtils.harvestLogs(ctx)}
    },
    expectedResult: and(
      equals('%result/datasets%', 1),
      equals('%result/graders%', 3),
      contains('run-', { allText: '%result/runId%' })
    ),
    timeout: 10000,
    logger: 'dbLogger'
  })
})

ReactComp('evaluationPageTestHost', {
  impl: comp({
    hFunc: ctx => {
      const App = EvaluationPage.$runWithCtx(ctx, {loadState: evaluationPageSeed(), loadTargets: wonderPlatformSeed()})
      return () => ctx.vars.react.h(App)
    }
  })
})

const { evaluationPageTestHost } = dsls.react['react-comp']

Test('evaluationPage.composer', {
  impl: reactTest({
    testedComp: evaluationPageTestHost(),
    expectedResult: and(
      contains('אבלואציה'),
      contains('בחירת מערכי נתונים'),
      contains('איכות התשובה'),
      contains('סיכום ההרצה')
    ),
    userActions: waitForText('סיכום ההרצה'),
    logger: 'uiLogger'
  })
})

Test('evaluationPage.datasetAuthoring', {
  impl: reactTest({
    testedComp: evaluationPageTestHost(),
    expectedResult: and(contains('תיאור מערך הנתונים'), contains('קלט לסוכן'), contains('פלט מצופה או עובדות נדרשות')),
    userActions: actions(
      waitForText('סיכום ההרצה'),
      click('מערכי נתונים'),
      waitForText('מערך נתונים חדש'),
      click('פתיחה'),
      waitForText('קלט לסוכן')
    ),
    logger: 'uiLogger'
  })
})
