import '@jb6/testing'
import '@jb6/lang-service'

import { ns, dsls, coreUtils } from '@jb6/core'
import './mock-workspace.js'
import '@jb6/core/misc/import-map-services.js'

const { jb, resolveProfileArgs, prettyPrintWithPositions, calcTgpModelData, resolveProfileTypes, sortedArraysDiff, objectDiff, delay, runSnippetCli, prettyPrint } = coreUtils
const { tgpEditorHost, tgpModelForLangService, offsetToLineCol, applyCompChange, calcProfileActionMap} = jb.langServiceUtils 

const {
  common: { Data },
  test: { Test,
    test: { dataTest }
  }
} = dsls
const { langService } = ns

jb.langServiceTestRegistry = {
  uniqueNameCounter: 0,
}

await coreUtils.calcJb6RepoRootAndImportMapsInCli()

async function filePathForLangServiceTest(filePath) {
  const repoRoot = await coreUtils.calcRepoRoot()
  const filePathToUse = filePath || 'hosts/test-project/a-tests.js'
  return `${repoRoot}/${filePathToUse}`
}

async function calcCompTextAndCursorsForTest({ctx,compText,filePath: relativeFilePath}) {
  const filePath = await filePathForLangServiceTest(relativeFilePath)
  const testId = ctx.vars.testID
  const fullText = compText.match(/^[a-z]+Test\(/) ? `Test('x', {\n  impl: ${compText}\n})` 
    : compText.match(/^ALL:/) ? compText.slice(4)
    : compText.match(/^[A-Z]/) ? compText
    : `Test('x', {\n  impl: uiTest(${compText})\n})`
  const parts = fixToUniqueName(fullText).split('__')
  const offset = parts[0].length
  const code = parts.join('')
  const host = tgpEditorHost()
  host.initDoc(filePath, code)
  const inCompPos = offsetToLineCol(code,offset)
  host.selectRange(inCompPos)
  const offsets = parts.reduce((acc,part) => [...acc, acc.pop()+part.length] , [0] ).slice(1,-1).map(offset=>offsetToLineCol(code,offset))
  const compTextAndCursor = host.compTextAndCursor()

  return {testId, compTextAndCursor, code, inCompPos, offsets, host, filePath }

  function fixToUniqueName(code) {
    const cmpId = 'CmpltnTst'+jb.langServiceTestRegistry.uniqueNameCounter++
    return code.replace(/Test\('x',/,`Test('${cmpId}',`)
  }
}

Data('calcCompTextAndCursor', {
  params: [
    {id: 'compText', as: 'string', mandatory: true, description: 'use __ for completion point'},
    {id: 'filePath', as: 'string'}
  ],
  impl: async (ctx, {}, {compText, filePath}) => {
    const { compTextAndCursor } = await calcCompTextAndCursorsForTest({ctx, compText, filePath })
    return compTextAndCursor
  }
})

Test('completionOptionsTest', {
  params: [
    {id: 'compText', as: 'text', description: 'use __ for completion points'},
    {id: 'expectedSelections', as: 'array', description: 'label a selection that should exist in the menu. one for each point'},
    {id: 'notInSuggstions', as: 'array', description: 'label a selection that should not exist in the menu'},
    {id: 'filePath', as: 'string'},
    {id: 'dsl', as: 'string'}
  ],
  impl: dataTest({
    calculate: async (ctx,{},{compText,filePath,dsl})=> {
      const {offsets, host} = await calcCompTextAndCursorsForTest({ctx,compText,filePath,dsl})
      const acc = []
      await offsets.reduce(async (pr, inCompPos) => {
        await pr
        host.selectRange(inCompPos)
        const compTextAndCursor = host.compTextAndCursor()
        const res1 = await ctx.run(langService.completionItems({compTextAndCursor}))
        const options = res1.items.map(x=>x.label)
        acc.push({options})
      }, Promise.resolve())
      return acc
    },
    expectedResult: ({data},{},{expectedSelections, notInSuggstions}) => {
      const errors = data.reduce((errors,{options},i) => {
        if (options?.[0] == 'reformat')
          return ['bad format']
        if (!options)
            return [`no options at index ${i}`]
        const res1 = options.includes(expectedSelections[i]) ? '' : ` ${expectedSelections[i]} not found at index ${i}`
        const res2 = !options.includes(notInSuggstions[i]||'__') ? '' : ` ${notInSuggstions[i]} found at index ${i}`
        const res = [res1,res2].join('')
        return [...errors,res]
      }, []).filter(x=>x).join(', ')
      return errors.match(/^-*$/) ? true : { testFailure: errors }
    },
    timeout: 4000,
    includeTestRes: true
  })
})
  
Test('completionActionTest', {
  params: [
    {id: 'compText', as: 'text', description: 'use __ for completion point'},
    {id: 'completionToActivate', as: 'string', dynamic: true, description: 'label of completion to activate', byName: true},
    {id: 'expectedEdit', description: '{ range: , newText:}'},
    {id: 'expectedTextAtSelection', description: '{ start: , end: }'},
    {id: 'expectedCursorPos', description: 'e.g. 1,12'},
    {id: 'filePath', as: 'string'},
    {id: 'dsl', as: 'string'},
    {id: 'remoteSuggestions', as: 'boolean', type: 'boolean'}
  ],
  impl: dataTest({
    calculate: async (ctx,{}, {compText,completionToActivate, filePath, dsl, remoteSuggestions }) => {
        const { compTextAndCursor, host} = await calcCompTextAndCursorsForTest({ctx,compText,filePath,dsl,remoteSuggestions})
        const {items} = await ctx.run(langService.completionItems({compTextAndCursor}))
        if (items.find(x=>x.label == 'reformat'))
            return { testFailure: `bad comp format` }

        const toActivate = completionToActivate(ctx.setData(items))
        const item = items.find(x=>x.label == toActivate)
        if (!item) 
          return { items: items.map(x=>x.label), toActivate }

        const edit = item.edit ? item : await ctx.run(langService.editAndCursorOfCompletionItem({item}))
        await applyCompChange(edit, {ctx})
        await delay(1) // wait for cursor change
        const {cursorLine, cursorCol } = host.compTextAndCursor()
        const actualCursorPos = [cursorLine, cursorCol].join(',')
        const actualEdit = host.lastEdit()
        //console.log(actualEdit)
        return {items: items.map(x=>x.label), item: item.label, actualEdit, actualCursorPos, toActivate}
    },
    expectedResult: ({data},{},{expectedEdit, expectedTextAtSelection, expectedCursorPos}) => {
      const {item,actualEdit,actualCursorPos, toActivate } = data
      if (!item)
        return { testFailure: `completion not found - ${toActivate}` }

      const host = tgpEditorHost()
      const editsSuccess = Object.keys(objectDiff(actualEdit.edit,expectedEdit)).length == 0
      const selectionSuccess  = expectedTextAtSelection == null || host.getTextAtSelection() == expectedTextAtSelection
      const cursorPosSuccess = !expectedCursorPos || expectedCursorPos == actualCursorPos

      const testFailure = (editsSuccess ? '' : 'wrong expected edit') + 
          (selectionSuccess ? '' : `wrong expected selection "${expectedTextAtSelection}" instead of "${host.getTextAtSelection}"`) +
          (cursorPosSuccess ? '' : `wrong cursor pos ${actualCursorPos} instead of ${expectedCursorPos}`)

      return { testFailure }
    },
    timeout: 3000,
    includeTestRes: true
  })
})

Test('actionMapTest', {
  macroByValue: true,
  params: [
    {id: 'profile' },
    {id: 'expectedType', as: 'string'},
    {id: 'path', as: 'string'},
    {id: 'expectedPos', as: 'string'}
  ],
  impl: dataTest({
    calculate: ({},{},{profile, expectedType, filePath}) => getTgpModel().then(tgpModel => {
      const { text, actionMap } =  (typeof profile != 'string') ? prettyPrintActionMap() : { text: profile, actionMap: []}
      const actionMapFromParse = calcProfileActionMap(text, {tgpModel, tgpType: expectedType} ).actionMap
        .map(e=>({from: e.from, to: e.to,action: e.action, source: e.source})) // for debug to match actionMap
      return { actionMap, actionMapFromParse, compText: text }

      function prettyPrintActionMap() {
        const topComp = resolveProfileArgs(profile, {expectedType})
        resolveProfileTypes(topComp, {tgpModel, expectedType, topComp, filePath})
        return prettyPrintWithPositions(topComp, {tgpModel})      }
    }),
    expectedResult: ({ data : {actionMap, actionMapFromParse, compText}},{},{expectedPos,path}) => {
        const compareActions = (a, b) => a.from - b.from || a.to - b.to || a.action.localeCompare(b.action)
        actionMap.sort(compareActions)
        actionMapFromParse.sort(compareActions)
        const diff = sortedArraysDiff(actionMap,actionMapFromParse,compareActions)
        ;[...diff.inserted, ...diff.deleted].forEach(e => { e.before = compText.slice(0,e.from); e.text = compText.slice(e.from,e.to) })
        let error = ''
//        const actualDiff = [...diff.deleted.filter(x=>x.text !="'" || !x.action.startsWith('addProp!')), ...diff.inserted]
        // if (actualDiff.length)
        //   console.log('actionMapTest diffs',diff)
        const items = actionMapFromParse.filter(x=>x.action == path).map(x=>`${x.from},${x.to}`)
        error = error || (items.length ? '' : `path not found ${path}`)
        error = error || (items.includes(expectedPos) ? '' : `pos ${items.join(';')} instead of ${expectedPos}`)
        return error ? { testFailure: error } : true
    },
    includeTestRes: true,
    timeout: 1000
  })
})

Test('prettyPrintTest', {
  macroByValue: true,
  params: [
    {id: 'profile'},
    {id: 'tgpType', as: 'string'},
    {id: 'expectedResult', type: 'boolean', dynamic: true}
  ],
  impl: dataTest({
    calculate: ({},{},{profile, tgpType}) => {
      const tgpModel = {dsls: jb.dsls, ns: jb.ns}
      const {comp } = calcProfileActionMap(profile, {tgpType, tgpModel})
      debugger
      return prettyPrint(comp, {tgpModel})
    },
    expectedResult: '%$expectedResult()%',
    timeout: 1000,
    includeTestRes: true
  })
})

Test('snippetTest', {
  params: [
    {id: 'profileText', as: 'text', asIs: true},
    {id: 'expectedResult', type: 'boolean', as: 'boolean', dynamic: true},
    {id: 'repoRoot', as: 'string'},
    {id: 'fetchByEnvHttpServer', as: 'string'}
  ],
  impl: dataTest({
    calculate: async (ctx,{},args) => {
      const res = await runSnippetCli(args)
      return res?.result || res.error
    },
    expectedResult: '%$expectedResult()%',
    timeout: 12000,
    allowError: true,
    includeTestRes: true
  })
})

async function getTgpModel() {
  const filePath = await filePathForLangServiceTest()
  jb.langServiceRegistry.tgpModels[filePath] = jb.langServiceRegistry.tgpModels[filePath] 
     || new tgpModelForLangService(await calcTgpModelData({entryPointPaths: filePath}))
  const tgpModel = jb.langServiceRegistry.tgpModels[filePath]
  return tgpModel
}