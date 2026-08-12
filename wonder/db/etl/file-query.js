import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/llm-guide/essentials.js'
import '@wonder/db/db-drivers.js'
import './etl-dsl.js'

const { wresolve } = jb.wonderUtils
const { tgp: { Component }, common: { Data }, 'llm-guide': { Doclet } } = dsls


const etlAsQuery = Component('etlAsQuery', {
    type: 'cli-load<etl>',
    params: [{id: 'path', as: 'string'}],
    impl: (_ctx, {}, { path }) => ({
        save: async (ctx, { etlLogger, outputFile }) => {
            await coreUtils.runBashScript(`mkdir -p "$(dirname '${path}')" && cp '${outputFile}' '${path}'`)
            etlLogger?.info({ t: 'copied', from: outputFile, to: path }, {}, {ctx})
        },
        lastModified: async () => {
            const res = await coreUtils.runBashScript(`stat -c%Y '${path}' 2>/dev/null || echo ""`)
            const mtime = String(res.stdout ?? '').trim()
            return mtime ? mtime : null
        },
        etlAsQuery: async (ctx, { etlLogger }) => {
            const res = await coreUtils.runBashScript(`cat '${path}'`)
            const raw = typeof res.stdout === 'string' ? res.stdout : JSON.stringify(res.stdout)
            etlLogger?.info({ t: 'etlAsQuery', bytes: raw.length }, {}, {ctx})
            try { return JSON.parse(raw) } catch(e) { return { raw } }
        }
    })
})

Data('fileQuery', {
    params: [
        {id: 'from', type: 'cli-extract<etl>'},
        {id: 'moreFiles', type: 'cli-extract<etl>[]', byName: true},
        {id: 'query', type: 'cli-transform<etl>'},
        {id: 'clearCache', as: 'boolean'}
    ],
    impl: async (ctx, {}, { from, moreFiles, query, clearCache }) => {
        const pathOf = f => f?.path ? f.path : (typeof f?.url === 'function' ? f.url(ctx) : '')
        const srcPath = pathOf(from)
        const hash = s => { let h = 0; for (let i=0; i<s.length; i++) h = ((h<<5)-h+s.charCodeAt(i))|0; return (h>>>0).toString(36) }
        const queryHash = hash(JSON.stringify(ctx.jbCtx?.profile?.query || query || ''))
        // output cache mirrors the source's canonical wcache path (+queryHash); falls back to local source path
        const srcCache = /:\/\//.test(srcPath) ? await wresolve(srcPath, ctx.setVars({ db: 'wcache' })) : srcPath
        const cachePath = `${srcCache}.q-${queryHash}`
        ctx.vars.etlLogger?.info?.({ t: 'cache key', cachePath, queryHash }, {}, {ctx})
        if (clearCache) await coreUtils.runBashScript(`rm -f '${cachePath}'`)
        return dsls.etl.etl.cliEtl.$runWithCtx(ctx, {
            extract: from, moreFiles, transform: query, load: etlAsQuery(cachePath)
        })
    }
})
