import { parse } from '../lib/acorn.mjs'
import { parse as parseLoose } from '../lib/acorn-loose.mjs'
import '@jb6/core/misc/resolve-types.js'

import { coreUtils } from '@jb6/core'
const { jb, systemParams, astNode, logException, logError, findCompDefById,
    resolveProfileTypes, compParams, compIdOfProfile, isPrimitiveValue, asArray, compByFullId, primitivesAst, splitDslType, resolveProfileTop } = coreUtils
Object.assign(coreUtils, {astToTgpObj})

// acorn-loose mis-parses valid multiline destructures (drops `= dsls` init). Try strict acorn first, fall back to loose with a warning.
const parseWithFallback = (src, opts, filePath) => { try { return parse(src, opts) } catch (e) {
  logError(`acorn strict failed, using acorn-loose (may mis-parse) at ${filePath || '?'}: ${e.message}`); return parseLoose(src, opts) } }

export const langServiceUtils = jb.langServiceUtils = { closestComp, calcProfileActionMap, deltaFileContent, filePosOfPath, getPosOfPath,
    lineColToOffset, offsetToLineCol, tgpEditorHost, localFsHost, applyCompChange, importJb6File, parseWithFallback }

function tgpEditorHost() {
    return jb.ext.tgpTextEditor.host
}

function localFsHost({ctx} = {}) {
    let error
    return {
        type: 'localFs',
        async readSource(path) {
            return (await import('fs/promises')).readFile(path, 'utf8')
        },
        async applyEdit(compChange, {path, expectedSource, ctx: applyCtx} = {}) {
            try {
                const {readFile, writeFile} = await import('fs/promises')
                const sourceBeforeChange = await readFile(path, 'utf8')
                if (sourceBeforeChange != expectedSource) throw new Error('source changed before applying compChange')
                const from = lineColToOffset(sourceBeforeChange, compChange.range.start)
                const to = lineColToOffset(sourceBeforeChange, compChange.range.end)
                const sourceAfterChange = sourceBeforeChange.slice(0, from) + compChange.newText + sourceBeforeChange.slice(to)
                await writeFile(path, sourceAfterChange)
                const logCtx = applyCtx || ctx
                logCtx?.vars?.langServiceLogger?.info?.({t: 'local fs compChange applied', path, range: compChange.range,
                    newTextLength: compChange.newText.length}, {}, {ctx: logCtx})
            } catch (e) {
                error = e
                throw e
            }
        },
        async saveDoc() {},
        async selectRange() {},
        async execCommand() {},
        log(message) { ctx?.vars?.langServiceLogger?.error?.({t: 'local fs host error', message}, {}, {ctx}) },
        applyError: () => error
    }
}

async function applyCompChange(editAndCursor, {ctx} = {}) {
    const host = tgpEditorHost()
    const { edit, cursorPos, ...editOptions } = editAndCursor
    if (!edit) return
    try {
        await host.saveDoc()
        await host.applyEdit(edit,{...editOptions, ctx})
        await host.saveDoc()
        if (cursorPos) {
            await host.selectRange(cursorPos,{ctx})
            if (cursorPos.TBD)
                await host.execCommand('editor.action.triggerSuggest') // VSCODE command
        }
    } catch (e) {
        host.log(`applyCompChange exception`)
        logException(e, 'completion apply comp change', { editAndCursor })
    }
}

function offsetToLineCol(text, offset) {
    const cut = text.slice(0, offset)
    return {
        line: (cut.match(/\n/g) || []).length || 0,
        col: offset - (cut.indexOf('\n') == -1 ? 0 : (cut.lastIndexOf('\n') + 1))
    }
}
function lineColToOffset(text, { line, col }) {
    const res = text.split('\n').slice(0, line).reduce((sum, line) => sum + line.length + 1, 0) + col
    if (isNaN(res)) debugger
    return res
}

function getPosOfPath(path, _where = 'edit', { compText, tgpModel, filePath } = {}) { // edit,begin,end,function
    const { actionMap, text } = calcProfileActionMap(compText, {tgpModel, filePath, expectedPath: path})
    const item = asArray(_where).reduce((acc,where) => acc || actionMap.find(e => e.action == `${where}!${path}`), null)
    if (!item) return { line: 0, col: 0 }
    return offsetToLineCol(text, item.from )
}

function filePosOfPath(tgpPath, {tgpModel, filePath}) {
    const compId = tgpPath.split('~')[0]
    const loc = compByFullId(compId, tgpModel).$location
    if (!loc) return
    const path = loc.path
    const compLine = (+loc.line) || 0
    const { line, col } = getPosOfPath(tgpPath, 'begin', {tgpModel, filePath})
    return { path, line: line + compLine, col }
}

function deltaFileContent(compText, newCompText, compPos) {
    const { common, oldText, newText } = calcDiff(compText, newCompText || '')
    const commonStartSplit = common.split('\n')
    const col = (commonStartSplit.length == 1 ? compPos.col : 0) + commonStartSplit.slice(-1)[0].length
    const start = { line: compPos.line + commonStartSplit.length - 1, col }
    const end = {
        line: start.line + oldText.split('\n').length - 1,
        col: (oldText.split('\n').length - 1 ? 0 : start.col) + oldText.split('\n').pop().length
    }
    return { range: { start, end }, newText }

    // the diff is continuous, so we cut the common parts at the begining and end 
    function calcDiff(oldText, newText) {
        let i = 0, j = 0;
        while (newText[i] == oldText[i] && i < newText.length) i++
        const common = oldText.slice(0, i)
        oldText = oldText.slice(i); newText = newText.slice(i);
        while (newText[newText.length - j] == oldText[oldText.length - j] && j < oldText.length && j < newText.length) j++ // calc backwards from the end
        if (newText[newText.length - j] != oldText[oldText.length - j]) j--
        return { firstDiff: i, common, oldText: oldText.slice(0, oldText.length -j), newText: newText.slice(0, newText.length-j) }
    }
}

function calcProfileActionMap(compText, {tgpType = 'comp<tgp>', tgpModel, filePath, inCompOffset = -1, expectedPath = '', ctx}) {
    let topComp
    try {
        topComp = astToTgpObj(parse(compText, { ecmaVersion: 'latest', sourceType: 'module' }).body[0], compText)
    } catch {}
    if (!topComp)
        return { text: compText, comp: topComp, actionMap: [], error: 'syntax error' }
    let compId = '', dslTypeId, compDef
    if (tgpType == 'comp<tgp>') {
        let dslType
        let compDefId = topComp[coreUtils.astNode].expression?.callee?.name // topComp.$
        if (compDefId == 'Component' || compDefId == 'ProfileTemplate') {
            dslType = topComp.$unresolvedArgs[1].type || 'data<common>'
            const [_type, _dsl] = splitDslType(dslType)
            compDefId = coreUtils.toCapitalType(_type)
        }

        compDef = findCompDefById({id: compDefId, tgpModel, dslType})
        ctx?.vars?.langServiceLogger?.info?.({
            t: 'lang service parsed comp header', header: topComp[coreUtils.astNode].expression?.callee?.name,
            compDefId, requestedDslType: dslType, resolvedDslType: compDef?.dslType, filePath
        }, {}, {ctx})
        topComp.id = topComp[astNode].expression.arguments[0].value
        topComp.$ = jb.dsls.tgp.tgpComp[coreUtils.asJbComp]
        dslType = compDef.dslType
        compId = `${dslType}${topComp.id}`
        const [ type, dsl ] = splitDslType(dslType)
        dslTypeId = [ dsl, type, topComp.id]
        Object.assign(topComp, {$dslType: dslType, $$: compId, type, dsl})
        topComp.$originalParams = topComp.params ? (topComp.params || []).map(p=>({...p})) : undefined // for pretty print
        try {
            ctx?.vars?.langServiceLogger?.info?.({t: 'tgpProfileResolveStart', compId, expectedType: dslType}, {}, {ctx})
            resolveProfileTypes(topComp, {tgpModel, expectedType: dslType, topComp, tgpPath: topComp?.id, filePath, ctx})
            resolveProfileTop(topComp)
        } catch (error) {
            if (error.syntaxError)
                topComp.syntaxError = error.syntaxError
            else
                return { text: compText, comp: topComp, actionMap: [], error }
        }
        tgpModel.dsls[dsl][type][topComp.id] = topComp
    } else {
        try {
            resolveProfileTypes(topComp, {tgpModel, expectedType: tgpType, topComp, tgpPath: topComp?.id})
        } catch (error) {
            if (error.syntaxError)
                topComp.syntaxError = error.syntaxError
            else
                return { text: compText, comp: topComp, actionMap: [], error }
        }
    }

    const actionMap = []

    calcActionMap(topComp, compId, topComp[astNode])
    const path = expectedPath || actionMap.filter(e => e.from == inCompOffset && inCompOffset == e.to || e.from <= inCompOffset && inCompOffset < e.to)
        .map(x => x.action.split('!').pop())
        .reduce((longest, current) => current.length > longest.length ? current : longest, '');

    return { text: compText, compId, comp: topComp, actionMap, path, dslTypeId, compDef }

    function calcActionMap(prof,path,ast) {
        const pathMatch = expectedPath.startsWith(path) || path.startsWith(expectedPath)
        const astMatchOffset = ast?.start <= inCompOffset && inCompOffset <= ast?.end
        if (!ast || !pathMatch || inCompOffset != -1 && !astMatchOffset ) return
        actionMap.push({ action: `begin!${path}`, from: ast.start, to: ast.start })

        if (isPrimitiveValue(prof)) {
            actionMap.push({ action: `beginToken!${path}`, from: ast.start, to: ast.start })
            actionMap.push({ action: `endToken!${path}`, from: ast.end, to: ast.end })
            actionMap.push({ action: `end!${path}`, from: ast.end, to: ast.end })
            if (typeof prof == 'string') {
                const isEmpty = prof === ''
                actionMap.push({ action: `setPT!${path}`, from: ast.start+1, to: ast.start+2 })
                actionMap.push({ action: `edit!${path}`, from: ast.start+1, to: ast.start+1 })
                const insideTextPos = isEmpty ? ast.start+1 : ast.start+2
                actionMap.push({ action: `insideText!${path}`, from: insideTextPos, to: isEmpty ? ast.start+1 : ast.end });
            } else { // token (number or bool)
                actionMap.push({ action: `setPT!${path}`, from: ast.start, to: ast.start+1 })
                actionMap.push({ action: `edit!${path}`, from: ast.start, to: ast.start })
                actionMap.push({ action: `insideToken!${path}`, from: ast.start+1, to: ast.end });
            }
            return
        }
        if (typeof prof == 'function') {
            actionMap.push({ action: `function!${path}`, from: ast.start, to: ast.end })
            return
        }

        if (Array.isArray(prof)) {
            const delimiters =  ast.elements.slice(1).map((dl, i) => ({start: ast.elements[i].end, end: dl.start }))

            actionMap.push({ action: `propInfo!${path}`, from: ast.start, to: ast.start+1 })
            actionMap.push({ action: `prependPT!${path}`, from: ast.start+1, to: ast.start+1, source: 'array' })
            actionMap.push({ action: `appendPT!${path}`, from: ast.elements.slice(-1)[0]?.end || ast.end-1, to: ast.end })
            delimiters.forEach((dl,i) => actionMap.push({ action: `insertPT!${path}~${i}`, from: dl.start, to: dl.end }))
            actionMap.push({ action: `end!${path}`, from: ast.end-1, to: ast.end-1 })
            prof[primitivesAst] && prof.forEach((val,i) => calcActionMap(val,`${path}~${i}`, prof[primitivesAst][i] || val[astNode]))

        } else { // profile
            const expressionAst = ast.type == 'CallExpression' ? ast : ast.expression
            if (!expressionAst) return // asIs
            const astArgs = expressionAst.arguments
            const delimiters = ast.type == 'ExpressionStatement' ? astArgs.filter(n => n.value == ',')
                : astArgs.slice(1).map((dl, i) => ({start: astArgs[i].end, end: dl.start }))

            const endOfPTName = expressionAst.callee.end + 1
            actionMap.push({ action: `beginToken!${path}`, from: ast.start, to: ast.start })
            actionMap.push({ action: `endToken!${path}`, from: endOfPTName, to: endOfPTName })    
            actionMap.push({ action: `setPT!${path}`, from: ast.start, to: endOfPTName })
            actionMap.push({ action: `edit!${path}`, from: endOfPTName, to: endOfPTName })
            const stringProfile = ['"',"'","`"].includes(expressionAst?.arguments?.[0]?.raw?.[0])
            const startFirstArg = expressionAst?.arguments?.[0]?.start
            const spaces = startFirstArg && (startFirstArg - endOfPTName > 1)
            if (spaces || stringProfile)
                actionMap.push({ action: `addProp!${path}`, from: endOfPTName, to: startFirstArg, source: 'before-profile-begin' })
            actionMap.push({ action: `addProp!${path}`, from: ast.end - 1, to: ast.end, source: 'profile-end'  })
            actionMap.push({ action: `end!${path}`, from: ast.end, to: ast.end })

            const paramsByNameAst = astArgs.filter(n=>n.type=='ObjectExpression')[0]
            if (paramsByNameAst) {
                actionMap.push({ action: `addProp!${path}`, from: paramsByNameAst.start-2, to: paramsByNameAst.start, source: 'byName-begin' })
                const firstPropStart = paramsByNameAst.properties?.[0]?.start
                firstPropStart && actionMap.push({ action: `addProp!${path}`, from: paramsByNameAst.start, to: firstPropStart, source: 'byName-begin2' })
                actionMap.push({ action: `addProp!${path}`, from: paramsByNameAst.end-2, to: paramsByNameAst.end, source: 'byName-end' })
                const props = paramsByNameAst?.properties || []
                props.forEach(prop => actionMap.push({ action: `propInfo!${path}~${prop.key.name}`, from: prop.start, to: prop.value.start }))
                if (props.length > 1)
                    props.slice(1).forEach((prop, i) => actionMap.push({ action: `addProp!${path}`, from: props[i].end, to: prop.start, source: 'props' }))
            }
            
            const compFullId = (path && path.indexOf('~') == -1) ? 'comp<tgp>tgpComp' : compIdOfProfile(prof)
            const params = [...compParams(compByFullId(compFullId, tgpModel)), ...systemParams]
            const param0 = params[0] || {}, param1 = params[1] || {}
            const firstParamAsArray = (param0.type||'').indexOf('[]') != -1 && !param0.byName
            const secondParamAsArray = param1.secondParamAsArray
            if (!firstParamAsArray && !secondParamAsArray)
                delimiters.forEach(dl => actionMap.push({ action: `addProp!${path}`, from: dl.start, to: dl.end+1, source: 'delimiters' }))
            if (firstParamAsArray) {
                const firstParamPath = `${path}~${param0.id}`
                const numVarsFirst = asArray(prof.vars).length
                actionMap.push({ action: `prependPT!${firstParamPath}`, from: endOfPTName, to: (ast.arguments)?.[0]?.start || endOfPTName, source: 'firstParamAsArray' })
                const endOfParamArrayArea = paramsByNameAst ? paramsByNameAst.start -1 : ast.end-1
                actionMap.push({ action: `appendPT!${firstParamPath}`, from: endOfParamArrayArea, to: endOfParamArrayArea })
                delimiters.forEach((dl, i) => i < numVarsFirst ? null
                    : actionMap.push({ action: `insertPT!${firstParamPath}~${i-numVarsFirst}`, from: dl.start, to: dl.end }))
            }
            if (secondParamAsArray) {
                const secParamPath = `${path}~${param1.id}`
                const numVars = asArray(prof.vars).length
                const secParamDelimiterStart = numVars + 1
                const startParamArrayArea = delimiters.length ? delimiters[numVars]?.end+1 || delimiters[0].end+1 : ast.start
                actionMap.push({ action: `prependPT!${secParamPath}`, from: startParamArrayArea, to: startParamArrayArea, source: 'secondParamAsArray' })
                const endOfParamArrayArea = paramsByNameAst ? paramsByNameAst.start -1 : ast.end-1
                actionMap.push({ action: `appendPT!${secParamPath}`, from: endOfParamArrayArea, to: endOfParamArrayArea })
                delimiters.forEach((dl, i) => i < numVars ? null
                    : i == numVars
                    ? actionMap.push({ action: `prependPT!${secParamPath}`, from: dl.start, to: dl.end, source: 'secondParamAsArray-delim0' })
                    : actionMap.push({ action: `insertPT!${secParamPath}~${i-secParamDelimiterStart}`, from: dl.start, to: dl.end }))
            }
            params.map(p=>({id:p.id, val: prof[p.id]})).filter(({val}) => val != null)
                .forEach(({id,val}) => calcActionMap(val, `${path}~${id}`, prof[primitivesAst][id] || val[astNode]))
        }
    }
}

function importJb6File(fileContent, {tgpModel = jb, filePath}) {
    let topComps = []
    try {
        topComps = parse(fileContent, { ecmaVersion: 'latest', sourceType: 'module' })
            .body.map(ast => astToTgpObj(ast, fileContent.slice(ast.from, ast.to)))
    } catch {}

    topComps.forEach((topComp) => {
        const compDef = findCompDefById({id: topComp.$, tgpModel})
        topComp.id = topComp[astNode].expression.arguments[0].value
        topComp.$ = jb.dsls.tgp.tgpComp[coreUtils.asJbComp]
        const dslType = compDef.dslType
        const compId = `${dslType}${topComp.id}`
        const [ type, dsl ] = splitDslType(dslType)
        Object.assign(topComp, {$dslType: dslType, $$: compId, type, dsl})
        topComp.$originalParams = topComp.params ? (topComp.params || []).map(p=>({...p})) : undefined // for pretty print
        try {
            resolveProfileTypes(topComp, {tgpModel, expectedType: dslType, topComp, tgpPath: topComp?.id, filePath})
            resolveProfileTop(topComp)
        } catch (error) {
            return { text: compText, comp: topComp, actionMap: [], error }
        }
        tgpModel.dsls[dsl][type][topComp.id] = topComp    
    })
}

function closestComp(docText, cursorLine, cursorCol, filePath) {
    // clamp offset to a sane range (cursor can land at EOF / beyond last char)
    const offsetRaw = lineColToOffset(docText,{line: cursorLine, col: cursorCol})
    const offset = Math.min(Math.max(offsetRaw, 0), Math.max(docText.length - 1, 0))
    let compText = ''
    let ast
    let usedLoose = false
    try {
        ast = parse(docText, { ecmaVersion:"latest", sourceType:"module", ranges:true })
    } catch (e) {
        try {
            usedLoose = true
            ast = parseLoose(docText, { ecmaVersion:"latest", sourceType:"module", ranges:true })
        } catch (e) {
            logException(e, 'closestComp parse exception', {docText, filePath, offset, cursorLine, cursorCol})
            return { notJbCode: true }
        }
    }
    try {
        let span =
            ast.body.find(n => n.start <= offset && offset < n.end) ||
            // offset can land exactly on node end (end is typically exclusive)
            ast.body.find(n => n.start <= offset && offset <= n.end) ||
            // cursor can be in whitespace/comments between top-level nodes; pick closest previous node
            (() => {
                let best = null
                for (const n of ast.body) {
                    if (n.start <= offset && (!best || n.start > best.start))
                        best = n
                }
                return best
            })()

        if (!span) {
            logError(`closestComp can not find top span`, { docText, offset, cursorLine, cursorCol, filePath})
            return { notJbCode: true }
        }

        // loose-parse whitespace/indentation heuristic can turn object props into labels:
        // Data('x', {}) ; impl: ... ; elems: ...
        if (usedLoose && span.type == 'LabeledStatement') {
            logError('closestComp loose parse labeled-statement span (likely misparsed object literal)', {docText, filePath, offset, cursorLine, cursorCol, span})
            return { notJbCode: true }
        }

        // Handle dsls destructuring section
        {
            const isDsls = n => n.type == 'VariableDeclaration' && n.kind == 'const'
                && n.declarations?.[0]?.init?.type == 'Identifier'
                && n.declarations[0].init.name == 'dsls'
            if (isDsls(span)) {
                compText = docText.slice(span.start, span.end)
                const compPos = offsetToLineCol(docText, span.start)
                return { compText, compPos, inCompOffset: offset - span.start, shortId: 'dsls', cursorLine, cursorCol, filePath, usedLoose, dslsSection: true }
            }
            if (span.type == 'VariableDeclaration' && span.kind == 'const')
                span = span.declarations?.[0]?.init
        }

        const expr = span.expression || span
        compText = docText.slice(expr.start, expr.end)

        const shortId = expr?.arguments?.[0]?.value // (compText.match(/^\s*\w+\(\s*(['"`])([\s\S]*?)\1/)||[])[2]
        if (!shortId) {
            logError('closestComp no shortId', {compText, filePath, span: expr})
            return { notJbCode: true }
        }
        const compPos = offsetToLineCol(docText,expr.start)
        return { compText, compPos, inCompOffset: offset - expr.start, shortId, cursorLine, cursorCol, filePath, usedLoose }
    } catch (e) {
        logException(e, 'closestComp exception', {compText, docText, filePath, offset, cursorLine, cursorCol})
        return { notJbCode: true }
    }
}


function astToTgpObj(node, code) {
	if (!node) return undefined
  return toObj(node)

  function toObj(node) {
    switch (node.type) {
      case 'TemplateLiteral': return node.quasis.map(q=>q.value.raw).join('')
      case 'Literal': return node.value
      case 'ObjectExpression': return attachNode(
        Object.fromEntries(node.properties.map(p=>[p.key.type === 'Identifier' ? p.key.name : p.key.value, toObj(p.value)])))
      case 'ArrayExpression': return attachNode(node.elements.map(el => toObj(el)))
      case 'UnaryExpression': return attachNode(node.operator === '-' ? -toObj(node.argument) : toObj(node.argument))
      case 'ExpressionStatement': return attachNode(toObj(node.expression))
      case 'CallExpression': {
        const $unresolvedArgs = node.arguments.map(x=> toObj(x))
        const callee = node.callee
        return attachNode({$: callee.name || [callee.object?.name,callee.property?.name].join('.'), $unresolvedArgs})
      }
      case 'ArrowFunctionExpression': {
        if (!code) return undefined
        let func 
        try {
          func = '__JS:' + code.slice(node.start, node.end)
        } catch (e) {
          logError('astToTgpObj ArrowFunctionExpression eval exception', {message: e.message, e, code, node})
          func = undefined
        }
        return attachNode(func)
      }
      case 'Identifier': {
        // fixing identifier to be like CallExpression
        node.arguments = []
        return attachNode({$: node.name || [node.object?.name,node.property?.name].join('.'), $unresolvedArgs: []})
      }

      default: return undefined
    }

    function attachNode(res) {
      if (res && typeof res == 'object')
        res[astNode] = node
      return res
    }
  }
}
