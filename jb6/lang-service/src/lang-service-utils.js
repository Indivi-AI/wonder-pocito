import { coreUtils } from '@jb6/core'
import { langServiceUtils } from './lang-service-parsing-utils.js'
import '@jb6/core/misc/import-map-services.js'

const { tgpEditorHost, offsetToLineCol, calcProfileActionMap } = langServiceUtils
const { jb, calcTgpModelData, compParams, asArray, isPrimitiveValue, calcPath, parentPath, compIdOfProfile, 
    unique, compByFullId, splitDslType, runProbeCli, toArray, calcVar, Ctx } = coreUtils

jb.langServiceRegistry = { 
    tgpModels : {},
    tgpModelsPromise: {}
}

async function calcCompProps(_compTextAndCursor) {
    const compTextAndCursor = _compTextAndCursor ? await _compTextAndCursor : tgpEditorHost().compTextAndCursor()
    const { filePath, compText, inCompOffset } = compTextAndCursor

    jb.langServiceRegistry.tgpModels[filePath] = jb.langServiceRegistry.tgpModels[filePath] || await getTgpModel()
    const tgpModel = jb.langServiceRegistry.tgpModels[filePath]
    return {...compTextAndCursor, tgpModel, ...calcProfileActionMap(compText, {inCompOffset, tgpModel, filePath}) }

    function getTgpModel() {
        return jb.langServiceRegistry.tgpModelsPromise[filePath] = calcTgpModelData({entryPointPaths: filePath})
            .then(v => (jb.langServiceRegistry.tgpModels[filePath] = new tgpModelForLangService(v)))
    }
}

async function provideCompletionItems(compProps, ctx) {
    const { actionMap, inCompOffset, tgpModel } = compProps
    const actions = actionMap.filter(e => e.from <= inCompOffset && inCompOffset < e.to || (e.from == e.to && e.from == inCompOffset))
        .map(e => e.action).filter(e => e.indexOf('edit!') != 0 && e.indexOf('begin!') != 0 && e.indexOf('end!') != 0)
    if (actions.length == 0) return { items: [] }
    let paramDef = null
    let items = unique(actions).map(action=>action.split('!')).reduce((acc, action) => {
        const [op, path] = action
        paramDef = tgpModel.paramDef(path)
        // if (!paramDef)
        //     logError('can not find paramDef for path',{path,ctx})
        const toAdd = (op == 'setPT' && paramDef && paramDef.options) ? enumCompletions(path,compProps)
            : op == 'setPT' ? [...wrapWithArray(path, compProps), ...newPTCompletions(path, 'set', compProps)]
            : op == 'insertPT' ? newPTCompletions(path, 'insert', compProps)
            : op == 'appendPT' ? newPTCompletions(path, 'append', compProps)
            : op == 'prependPT' ? newPTCompletions(path, 'prepend', compProps)
            : op == 'addProp' ? paramCompletions(path, compProps) : []
        return [...acc, ...toAdd]
    }, [])
    if (actions[0] && actions[0].indexOf('insideText') == 0)
        items = await dataCompletions(compProps, actions[0].split('!').pop(), ctx)
    items.sort((c1,c2) => (c1.sortWith || 20) - (c2.sortWith || 20))
    if (items[1]?.kind == 25) // 25 twice
        items.shift()

    return { items, paramDef }
}

function newPTCompletions(path, opKind, compProps) { // opKind: set,insert,append,prepend
    const { tgpModel } = compProps
    const options = tgpModel.PTsOfPath(path).map(comp => {
        const compId = `${comp.$dslType}${comp.id}`
        const isPT = comp.params?.length
        return {
            label: comp.id, kind: isPT ? 2 : 19, compId, opKind, path, compProps,
            detail: [comp.description, compId.indexOf('>') != -1 && compId.split('>')[0] + '>'].filter(x => x).join(' '),
            extend(ctx) { return setPTOp(this.path, this.opKind, this.compId, ctx) },
            sortWith: 10 + (isPT ? 0 : 1) // promote pts
        }
    })
    const isArrayElem = path.match(/~[0-9]+$/)
    const propStr = isArrayElem ? path.split('~').slice(-2).join('~') : path.split('~').pop()
    const propTitle = {
        label: propStr + ': ' + tgpModel.paramType(path), kind: 25, path, extend: () => { }, sortWith: 1,
        detail: calcPath(tgpModel.paramDef(path), 'description')
    }
    return [propTitle, ...options]

    function setPTOp(path, opKind, compId, ctx) {
        const index = opKind == 'append' ? -1 : opKind == 'insert' ? (+path.split('~').pop() + 1) : opKind == 'prepend' && 0
        const basePath = opKind == 'insert' ? path.split('~').slice(0, -1).join('~') : path
        const basedOnVal = opKind == 'set' ? tgpModel.valOfPath(path) : null
        const { result, cursorPath, whereToLand } = newProfile(compByFullId(compId, tgpModel), {basedOnVal})
        const res = opKind == 'set' ? setOp(path, result, ctx) : addArrayItemOp(basePath, { toAdd: result, index, ctx })
        return {...res, resultPath: [res.resultPath || path,cursorPath].filter(x=>x).join('~'), whereToLand }
    }

    function addArrayItemOp(path, { toAdd, index, srcCtx } = {}) {
        const val = tgpModel.valOfPath(path)
        toAdd = toAdd === undefined ? '' : toAdd
        if (Array.isArray(val)) {
            if (val[index] === '')
                return { ...setOp(`${path}~${index}`, toAdd, srcCtx), resultPath: `${path}~${index}` }
            else if (index === undefined || index == -1)
                return { path, op: { $push: [toAdd] }, srcCtx, resultPath: `${path}~${val.length}` }
            else
                return { path, op: { $splice: [[index, 0, toAdd]] }, srcCtx, resultPath: `${path}~${index}` }
        } else if (!val) {
            return { ...setOp(path, toAdd, srcCtx), resultPath: `${path}` } // empty array - lazy add ...
        } else {
            const arrayVal = asArray(val)
            if (index === undefined || index == -1)
                return { ...setOp(path, [...arrayVal, toAdd], srcCtx), resultPath: `${path}~1` }
            else
                return { ...setOp(path, [toAdd, ...arrayVal], srcCtx), resultPath: `${path}~0` }
        }
    }
}

function newProfile(comp, {basedOnPath, basedOnVal} = {}) {
	const currentVal = basedOnVal != null ?  basedOnVal : (basedOnPath && valOfPath(basedOnPath))
	const result = { $$: `${comp.$dslType}${comp.id}`, $dslType: comp.$dslType }
	let cursorPath = '', whereToLand = 'edit'
	const composite = compParams(comp).find(p=>p.composite)
	
	compParams(comp).forEach(p=>{
		if (p.composite && currentVal != null) {
			result[p.id] = currentVal
			cursorPath = p.id
			whereToLand = 'end'
		}
		else if (p.templateValue != null && !composite)
			result[p.id] = cloneProfile(p.templateValue)
		else if (currentVal && currentVal[p.id] !== undefined && !composite)
			result[p.id] = currentVal[p.id]
        else if (p.mandatory && currentVal?.[p.id] == null)
			result[p.id] = ''

		cursorPath = cursorPath || (result[p.id] != null && p.id)
	})
	
	return { result, cursorPath, whereToLand }
}

function enumCompletions(path, compProps) {
    return compProps.tgpModel.paramDef(path).options.split(',').map(label => ({
        label, sortWith: 3, kind: 19, path, compProps, op: { $set: label } }))
}

function paramCompletions(path, compProps) {
    const tgpModel = compProps.tgpModel
    const params = tgpModel.paramsOfPath(path).filter(p => tgpModel.valOfPath(path + '~' + p.id) === undefined)
        .sort((p2, p1) => (p1.mandatory ? 1 : 0) - (p2.mandatory ? 1 : 0))
    return params.map(param => ({
        label: param.id, sortWith: 2, path, kind: 4, id: param.id, compProps, detail: [param.as, param.type, param.description].filter(x => x).join(' '),
        extend(ctx) { return addPropertyOp(`${this.path}~${this.id}`, ctx) },
    }))

    function addPropertyOp(path, srcCtx) {
        const param = tgpModel.paramDef(path)
        if (!param)
            return logError(`no param def for path ${path}`, { srcCtx })
        const paramType = tgpModel.paramType(path)
        const result = param.templateValue ? JSON.parse(JSON.stringify(param.templateValue))
            : paramType == 'boolean<common>' ? true
            : ''

        return setOp(path, result, srcCtx)
    }
}

function wrapWithArray(path, compProps) {
    const tgpModel = compProps.tgpModel
    return [path].filter(x => x).map(path => tgpModel.canWrapWithArray(path) ? {
        label: `wrap with array`, sortWith: 5, kind: 18, compProps, path, extend(ctx) { return { ...wrapWithArrayOp(this.path, ctx), whereToLand: 'end' } },
    } : null).filter(x => x).slice(0, 1)

    function wrapWithArrayOp(path, srcCtx) {
        const toAdd = tgpModel.valOfPath(path)
        if (toAdd != null && !Array.isArray(toAdd))
            return { ...setOp(path, [toAdd], srcCtx) }
    }
}

function setOp(path, value, srcCtx) {
    return { op: { $set: value }, path, srcCtx }
}

function cloneProfile(prof) {
	if (!prof || isPrimitiveValue(prof) || typeof prof == 'function') return prof
	return Object.fromEntries(Object.entries(prof).map(([k,v]) =>[k,cloneProfile(v)]))
}

class tgpModelForLangService {
    constructor(tgpModel) {
        Object.assign(this,tgpModel)
        this.ptsOfTypeCache = {}
    }
    valOfPath(path){ 
        return calcPath(this.compById(path.split('~')[0]),path.split('~').slice(1))
    }
    compIdOfPath(path) {
        if (!path) return ''
        if (path.indexOf('~') == -1)
            return 'comp<tgp>tgpComp'
        if (path.match(/~vars$/))
            return
        const prof = this.valOfPath(path)
        return prof?.$$ && compIdOfProfile(prof)
    }
    paramDef(path) {
        let _parentPath = parentPath(path)
        let paramName = path.split('~').pop()
        if (!_parentPath)
            return this.compById(path)
        if (!isNaN(Number(paramName))) { // array elements
            path = _parentPath
            paramName = path.split('~').pop()
            _parentPath = parentPath(path)
        }
        if (paramName == 'defaultValue' && this.isParamDef(_parentPath))
        return this.valOfPath(_parentPath)
        const comp = this.compOfPath(_parentPath)
        return compParams(comp).find(p=>p.id==paramName)
    }
    isParamDef(path) {
        const pathAr = path.split('~')
        return pathAr.length == 3 && pathAr[1] == 'params'
    }
    compOfPath(path) { return this.compById(this.compIdOfPath(path)) }
    paramsOfPath(path) { return compParams(this.compOfPath(path)) }
    compById(id) { return compByFullId(id, this) }
    PTsOfType(type,dsl) {
        const dslType = `${type}<${dsl}>`
        if (this.ptsOfTypeCache[dslType])
            return this.ptsOfTypeCache[dslType]
        const res = Object.values(this.dsls[dsl][type]).filter(x=>x.id)
        res.sort((c1,c2) => this.markOfComp(c2) - this.markOfComp(c1))
        return this.ptsOfTypeCache[dslType] = res
    }
    markOfComp(comp) {
        return +(((comp.category||'').match(/common:([0-9]+)/)||[0,0])[1])
    }
    PTsOfPath(path) {
        const dslType = this.paramType(path)
        if (dslType == '$asParent<tgp>')
            return this.PTsOfPath(parentPath(path))
        if (!path) {
            logError(`PTsOfPath can not find dsl type of path ${path}`)
            return []
        }
        const [type, dsl] = splitDslType(dslType)
        return this.PTsOfType(type,dsl)
    }
    paramType(path) {
        const param = this.paramDef(path)         
        const dynamicTypeFromParent = param?.dynamicTypeFromParent?.(this.valOfPath(parentPath(path)),this.dsls)
        const type = dynamicTypeFromParent || param?.$dslType
        return type == '$asParent' ? this.paramType(parentPath(path)) : type
    }
    enumOptions(path) { 
        return ((this.paramDef(path) || {}).options ||'').split(',').map(x=> ({code: x.split(':')[0],text: x.split(':')[0]}))
    }
    canWrapWithArray(path) {
        const type = this.paramDef(path) ? (this.paramDef(path).type || '') : ''
        const val = this.valOfPath(path)
        const parentVal = this.valOfPath(parentPath(path))
        return type.includes('[') && !Array.isArray(val) && !Array.isArray(parentVal)
    }
    pluginOfFilePath(filePath) {
        return Object.values(this.plugins).filter(p=>p.files.includes(filePath)).map(p=>p.id)[0]
    }
    fileDsl(filePath) {
        const plugin = this.pluginOfFilePath(filePath)
        return plugin && (((this.plugins[plugin].dslOfFiles || []).find(e=>e[0]==filePath) || [])[1] || plugin.dsl)
    }
    comps() {
        return Object.fromEntries(Object.entries(this.dsls).flatMap(([dsl,types]) => 
          Object.entries(types).flatMap(([type,tgpType]) => Object.entries(tgpType).map(([id,comp]) => [`${type}<${dsl}>${id}`, comp]))))
    }
}

async function dataCompletions(compProps, path, ctx) {
    const { actionMap, inCompOffset, text: compText, filePath: entryPointPaths, compPos, tgpModel } = compProps

    const inCompletionTest = ctx.jbCtx?.lexicalStack?.find(x=> x && x.indexOf('completionTest') != -1)
    const extraCode = inCompletionTest ? `
const { test: { Test, test: { dataTest } } } = dsls
${compText}
` : ''
    // resolution:'all' keeps the full {in:{data,vars,jbCtx}} record - completions need vars/jbCtx
    // for %$var% suggestions. the lean 'default' projection is only for the MCP wire payload.
    const importStrategy = (extraCode && entryPointPaths) ? 'calcImportsForFiles (no profile scan)' : 'calcImportsForProfile (profile scan)'
    ctx?.vars?.langServiceLogger?.info?.({ t: 'dataCompletions probe', path, importStrategy, hasExtraCode: !!extraCode, entryPointPaths }, {}, { ctx })
    const {probeRes, error, cmd} = await runProbeCli(path, {entryPointPaths, extraCode, resolution: 'all' })
    if (error) {
        globalThis.showUserMessage && showUserMessage('error', `probe cli failed: ${JSON.stringify(error)} ${cmd}`)
        return []
    }

    const item = actionMap.filter(e => e.from <= inCompOffset && inCompOffset < e.to || (e.from == e.to && e.from == inCompOffset))
        .find(e => e.action.indexOf('insideText!') == 0)
    const inputValue = compText.slice(item.from - 1, item.to - 1)
    const selectionStart = inCompOffset - item.from + 1
    const { line, col } = offsetToLineCol(compText, item.from - 1)

    const text = inputValue.substr(0,selectionStart).trim().slice(0,100)
    const text_with_open_close = text.replace(/%([^%{}\s><"']*)%/g, (_,x) => `{${x}}`)
    let exp = rev((rev(text_with_open_close).match(/([^\}%]*%)/) || ['',''])[1])
    exp = exp || rev((rev(text_with_open_close).match(/([^\}=]*=)/) || ['',''])[1])
    const tail = rev((rev(exp).match(/([^%.\/=]*)(\/|\.|%|=)/)||['',''])[1])
    let tailSymbol = text_with_open_close.slice(-1-tail.length).slice(0,1) // % or /
    if (tailSymbol == '%' && exp.slice(0,2) == '%$')
      tailSymbol = '%$'
    const base = exp.slice(0,-1-tail.length) + '%'

    const probeCtx = new Ctx(probeRes.result?.[0]?.in || {})
    if (probeRes.error)
        return [valueOption('#error', probeRes.error)]
    const visits = probeRes.visits?.[probeRes.probePath]
    const circuitCmpId = probeRes.circuitCmpId.split('>').pop()

    let options = []

    if (tailSymbol == '%')
      options = [...innerPropsOptions(probeCtx.data), ...indexOptions(probeCtx.data), ...varsOfCtx(probeCtx) ]
    else if (tailSymbol == '%$')
      options = varsOfCtx(probeCtx)
    else if (tailSymbol == '/' || tailSymbol == '.') {
      const baseVal = probeCtx.exp(base)
      options = [...innerPropsOptions(baseVal), ...indexOptions(baseVal)]
    }

    options = [
      { ...valueOption('goto circuit', circuitCmpId), sortWith: 6, kind: 17, 
        command : tgpEditorHost().gotoCompCommand(compByFullId(probeRes.circuitCmpId, tgpModel)) },
      valueOption('#visits',''+visits),
      valueOption('#data', probeCtx.data),
      ...unique(options,x=>x.label)
    ]        

    return options


    function calcOverlap(s1, s2) {
        for (let i = 0; i < s1.length; i++)
            if (s1[i] != s2[i]) return i
        return s1.length
    }

    function indexOptions(baseVal) {
      return Array.isArray(baseVal) ? baseVal.slice(0,2).map((v,i) => valueOption(''+i,v)) : []
    }
    function innerPropsOptions(baseVal) {
      return toArray(baseVal).slice(0,2).flatMap(x=>Object.entries(x).map(x=> valueOption(x[0],x[1])))
    }
    function rev(str) {
      return str.split('').reverse().join('')
    }

    function varsOfCtx(probeCtx) {
        const { jbCtx: { args }} = probeCtx  
    
        const vars = [...Object.keys(args || {}), ...Object.keys(probeCtx.vars || {}), ...Object.keys(jb.coreRegistry.consts || {})]
        return vars.map(x=> valueOption('$'+x,calcVar(x,probeCtx)))
    }

    function valueOption(toPaste, value) {
        const primiteVal = isPrimitiveValue(value)
        const summary = calcSummary()
        const label = [toPaste,summary ? `(${summary})`: ''].filter(x=>x).join(' ')

        const kind = primiteVal ? 12 : 13
        const suffix = primiteVal ? '%' : '/'
        const newText = toPaste + suffix
        const startInInput = selectionStart - tail.length
        const overlap = calcOverlap(newText, inputValue.slice(startInInput))
        const suffixExists = inputValue.substr(startInInput + overlap)[0] == suffix
        const newVal = inputValue.substr(0, startInInput) + newText + inputValue.substr(startInInput + overlap + (suffixExists ? 1 : 0))
        const cursorPos = { line: line + compPos.line, col: compPos.col + col + startInInput + toPaste.length + (suffix == '%' ? 2 : 1) }
        return { label, path, kind, cursorPos, compProps,  op: { $set: newVal } }
  
        function calcSummary() {
            if (typeof value == 'string' && value.length > 30)
                return `${value.substring(0,30)}...`
            else if (primiteVal)
                return ''+value
            else if (value == null)
                return 'null'
            else if (Array.isArray(value) && value.every(x=>isPrimitiveValue(x)) && value.length < 4)
                return `[${value.slice(0,3).join(',')}]`
            else if (Array.isArray(value))
                return `${value.length} item${value.length != 1 ? 's' : ''}`
            else if (value && typeof value == 'object')
                return `${Object.keys(value).length} prop${Object.keys(value).length != 1 ? 's' : ''}`
            return typeof value
        }
    }
}

Object.assign(langServiceUtils, { provideCompletionItems, calcCompProps, cloneProfile, tgpModelForLangService,  
    tgpModels: jb.langServiceRegistry.tgpModels
})

