import { jb, coreUtils } from '@jb6/core'
const { langServiceLogger } = coreUtils.ensureLoggers('langServiceLogger').vars   // mock editor host log() method has no ctx

jb.workspaceRegistry = {
    activeUri: null, 
    openDocs: {},
    lastEdit: null
}
const openDocs = jb.workspaceRegistry.openDocs

function activeUri() { return jb.workspaceRegistry.activeUri }
function activeDoc() { return openDocs[jb.workspaceRegistry.activeUri] }

jb.ext.tgpTextEditor = { host: {
        type: 'jbWorkspace',
        readSource: (path, {staticMappings} = {}) => openDocs[path]?.text ?? coreUtils.fetchByEnv(path, staticMappings),
        async applyEdit(edit,{docUri, ctx} = {}) {
            const { lineColToOffset } = jb.langServiceUtils
            const _docUri = docUri || activeUri()
            const docText = openDocs[_docUri].text
            const from = lineColToOffset(docText, edit.range.start)
            const to = lineColToOffset(docText,edit.range.end)
            const newText = openDocs[_docUri].text = docText.slice(0,from) + edit.newText + docText.slice(to)
            jb.workspaceRegistry.lastEdit = { edit }
            if (ctx?.vars?.editorCmpId && !ctx?.vars?.doNotRefreshEditor) {
              const selector = `[cmp-id="${ctx.vars.editorCmpId}"]`
              ctx.runAction({ $: 'runFEMethodFromBackEnd', selector, method: 'setText', Data: { $asIs: newText} })
            }
        },
        getActiveDoc: () => activeDoc(),
        selectRange(start,{end, ctx} = {}) {
            end = end || start
            activeDoc().selection = { start, end: end || start }
            if (ctx?.vars?.editorCmpId && !ctx?.vars?.doNotRefreshEditor) {
                const selector = `[cmp-id="${ctx.vars.editorCmpId}"]`
                ctx.runAction({$: 'runFEMethodFromBackEnd', selector, method: 'selectRange', Data: {start, end}})
            }
        },
        compTextAndCursor() {
            const doc = activeDoc()
            return jb.langServiceUtils.closestComp(doc.text, doc.selection.start.line, doc.selection.start.col, activeUri())                
        },
        async execCommand(cmd) {
            //console.log('exec command', cmd)
        },
        async saveDoc() {
        },
        gotoCompCommand(comp) {
            const loc = comp.$location
            return loc && { command: 'vscode.open', arguments: [loc.path, { selection: [loc.line - 1, 0, loc.line - 1, 0] } ] }
        },
        initDoc(uri,text, selection = { start:{line:0,col:0}, end:{line:0,col:0} }) {
            openDocs[uri] = { text, selection}
            jb.workspaceRegistry.activeUri = uri
        },
        async getTextAtSelection() {
            const { lineColToOffset } = jb.langServiceUtils
            const selection = activeDoc().selection
            const docText = activeDoc().text
            const from = lineColToOffset(docText, selection.start)
            const to = lineColToOffset(docText, selection.start)
            return docText.slice(from,to)
        },
        log(arg) { langServiceLogger?.info?.({t: 'mock editor host', op: arg}) },
        async gotoFilePos(path,line,col) {},
        lastEdit: () => jb.workspaceRegistry.lastEdit
}}

export const tgpEditorHost = jb.ext.tgpTextEditor
