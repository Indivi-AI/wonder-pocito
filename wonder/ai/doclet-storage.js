import { jb, coreUtils, dsls } from '@jb6/core'
import '@jb6/llm-guide'
import '@wonder/ai/category-dsl.js'
import '@wonder/db/db-drivers.js'
import '@wonder/db/db-drivers-s3-minio.js'

const {
  common: { Data, data: { wFetch } },
  wonder: { DbDriverInterceptor, 'db-driver-interceptor': { dbDriverInterceptor } }
} = dsls

const parseDocletWUrl = Data('parseDocletWUrl', {
  params: [{id: 'docletWUrl', as: 'string', mandatory: true}],
  impl: (ctx, {}, {docletWUrl}) => {
    const parsed = jb.wonderUtils.extractFromUrl(docletWUrl, ctx), id = parsed?.fileName?.match(/^doclets\/([^/]+)$/)?.[1]
    if (!['room', 'signedRoom'].includes(parsed?.scope?.id) || !id) return null
    const decodedId = decodeURIComponent(id), roomWUrl = docletWUrl.slice(0, docletWUrl.indexOf('/doclets/'))
    return {id: decodedId, name: decodedId.split('.')[0], categories: decodedId.split('.').slice(1), roomWUrl,
      version: new URL(docletWUrl.replace(/^\w+(?::[^/]*)?\/\//, 'http://')).searchParams.get('v') || 'latest'}
  }
})

const docletSha256 = Data('docletSha256', {
  params: [{id: 'text', as: 'string', mandatory: true}],
  impl: async ({}, {}, {text}) => [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('')
})

const publishedDocletText = Data('publishedDocletText', {
  params: [
    {id: 'url', as: 'string', mandatory: true},
    {id: 'read', dynamic: true, defaultValue: wFetch('%$url%', {stream: true})}
  ],
  impl: async (ctx, {}, {url, read}) => {
    const response = await read(ctx.setVars({url}))
    return response?.ok ? response.text() : null
  }
})

Data('publishDocletFamily', {
  params: [
    {id: 'roomWUrl', as: 'string', mandatory: true},
    {id: 'name', as: 'string', mandatory: true},
    {id: 'version', as: 'string', mandatory: true},
    {id: 'sourceRevision', as: 'string', defaultValue: 'workspace'},
    {id: 'read', dynamic: true, defaultValue: wFetch('%$url%')},
    {id: 'readText', dynamic: true, defaultValue: publishedDocletText('%$url%')},
    {id: 'head', dynamic: true, defaultValue: wFetch('%$url%', {method: 'HEAD'})},
    {id: 'write', dynamic: true, defaultValue: wFetch('%$url%', {method: 'PUT', body: '%$body%', headers: '%$headers%'})},
    {id: 'sha256', dynamic: true, defaultValue: docletSha256('%$content%')}
  ],
  impl: async (ctx, {}, {roomWUrl, name, version, sourceRevision, read, readText, head, write, sha256}) => {
    const family = name.split('.')[0], base = `${roomWUrl.replace(/\/$/, '')}/doclets/${family}`
    if (name != family || !/^[\p{L}\w-]+$/u.test(name) || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version))
      throw new Error(`invalid doclet release ${name}@${version}`)
    const registry = jb.dsls['llm-guide'].doclet, ids = Object.keys(registry).filter(id => id == family || id.startsWith(`${family}.`)).sort()
    if (!ids.length) throw new Error(`doclet family ${family} is not registered`)
    const docletCtx = ctx.setVars({doNotCalcExpression: true}), publishedAt = new Date().toISOString()
    const variants = await Promise.all(ids.map(async id => {
      const proxy = registry[id], comp = coreUtils.asComp(proxy), rendered = await proxy.$runWithCtx(docletCtx)
      const content = typeof rendered == 'string' ? coreUtils.evaluateDoclet(rendered, docletCtx.vars)
        : coreUtils.evaluateDoclet(coreUtils.prettyPrintComp(proxy, {tgpModel: jb}), docletCtx.vars)
      if (!content.trim()) throw new Error(`doclet ${id} rendered empty content`)
      return {id, categories: id.split('.').slice(1), description: comp.description || id, title: comp.title || id,
        mark: comp.mark || id.slice(0, 2), toolIds: comp.toolIds || [], content: `${id}.md`, sha256: await sha256(ctx.setVars({content})), markdown: content}
    }))
    const manifestUrl = `${base}/releases/${version}/manifest.json`, existing = await read(ctx.setVars({url: manifestUrl}))
    const comparable = values => values.map(({markdown, ...value}) => value)
    if (existing?.version && JSON.stringify(existing.variants) != JSON.stringify(comparable(variants)))
      throw new Error(`doclet release ${family}@${version} is immutable`)
    if (!existing?.version) {
      for (const variant of variants) {
        const url = `${base}/releases/${version}/${variant.content}`, metadata = await head(ctx.setVars({url}))
        if (metadata?.ok) {
          const current = await readText(ctx.setVars({url}))
          if (await sha256(ctx.setVars({content: current || ''})) != variant.sha256)
            throw new Error(`immutable doclet object conflicts at ${variant.content}`)
        } else await write(ctx.setVars({url, body: variant.markdown,
          headers: {'if-none-match': '*', 'cache-control': 'public, max-age=31536000, immutable'}}))
        const verified = await readText(ctx.setVars({url}))
        if (await sha256(ctx.setVars({content: verified || ''})) != variant.sha256)
          throw new Error(`doclet checksum failed at ${variant.content}`)
      }
      const manifest = {name: family, version, publishedAt, sourceRevision, variants: comparable(variants)}
      await write(ctx.setVars({url: manifestUrl, body: manifest, headers: {'if-none-match': '*', 'if-generation-match': '0',
        'cache-control': 'public, max-age=31536000, immutable'}}))
      const verifiedManifest = await read(ctx.setVars({url: manifestUrl}))
      if (JSON.stringify(verifiedManifest) != JSON.stringify(manifest)) throw new Error(`doclet manifest verification failed for ${family}@${version}`)
    }
    const headUrl = `${base}/head.json`, currentHead = await read(ctx.setVars({url: headUrl}))
    if (currentHead?.tags?.latest != version) {
      const metadata = await head(ctx.setVars({url: headUrl})), headers = metadata?.ok
        ? metadata.generation ? {'if-generation-match': String(metadata.generation)} : {'if-match': metadata.etag}
        : {'if-none-match': '*', 'if-generation-match': '0'}
      await write(ctx.setVars({url: headUrl, body: {name: family, tags: {latest: version}, updatedAt: publishedAt},
        headers: {...headers, 'cache-control': 'no-cache'}}))
      if ((await read(ctx.setVars({url: headUrl})))?.tags?.latest != version) throw new Error(`doclet head promotion failed for ${family}`)
    }
    ctx.vars.workflowLogger?.info?.({t: 'doclet release ready', name: family, version, variants: variants.length}, {}, {ctx})
    return {name: family, version, variants: comparable(variants), docletWUrl: `${roomWUrl}/doclets/${family}?v=${version}`}
  }
})

Data('publishedDocletCatalog', {
  params: [
    {id: 'roomWUrl', as: 'string', mandatory: true},
    {id: 'list', dynamic: true, defaultValue: wFetch('%$directoryUrl%')},
    {id: 'read', dynamic: true, defaultValue: wFetch('%$url%')}
  ],
  impl: async (ctx, {}, {roomWUrl, list, read}) => {
    const root = `${roomWUrl.replace(/\/$/, '')}/doclets`, directoryUrl = `${root}/`, entries = await list(ctx.setVars({directoryUrl})) || []
    const names = [...new Set(entries.filter(entry => entry.isDir || entry.name?.endsWith('/'))
      .map(entry => entry.name.replace(/\/$/, '').split('/').at(-1)).filter(Boolean))]
    const skills = (await Promise.all(names.map(async id => {
      const head = await read(ctx.setVars({url: `${root}/${id}/head.json`})), version = head?.tags?.latest
      const manifest = version && await read(ctx.setVars({url: `${root}/${id}/releases/${version}/manifest.json`}))
      if (!manifest) return null
      const base = manifest.variants.find(variant => variant.id == id) || manifest.variants[0]
      return {id, name: base.title || id, mark: base.mark, desc: base.description, version, created: manifest.publishedAt?.slice(0, 7),
        updated: 'פורסם', toolIds: base.toolIds || [], docletUrl: `${roomWUrl}/doclets/${id}`,
        categories: [...new Set(manifest.variants.flatMap(variant => variant.categories))], variants: manifest.variants.map(variant => variant.id)}
    }))).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id))
    ctx.vars.workflowLogger?.info?.({t: 'doclet catalog loaded', skills: skills.length}, {}, {ctx})
    return skills
  }
})

Data('publishedDoclet', {
  params: [
    {id: 'docletWUrl', as: 'string', mandatory: true},
    {id: 'parse', dynamic: true, defaultValue: parseDocletWUrl('%$docletWUrl%')},
    {id: 'read', dynamic: true, defaultValue: wFetch('%$url%')},
    {id: 'readText', dynamic: true, defaultValue: publishedDocletText('%$url%')},
    {id: 'sha256', dynamic: true, defaultValue: docletSha256('%$content%')}
  ],
  impl: async (ctx, {}, {docletWUrl, parse, read, readText, sha256}) => {
    const parsed = parse(ctx.setVars({docletWUrl}))
    if (!parsed) return null
    const family = `${parsed.roomWUrl}/doclets/${parsed.name}`
    const version = parsed.version == 'latest' ? (await read(ctx.setVars({url: `${family}/head.json`})))?.tags?.latest : parsed.version
    if (!version) return null
    const manifest = await read(ctx.setVars({url: `${family}/releases/${version}/manifest.json`}))
    if (!manifest) return null
    const variant = parsed.categories.length ? manifest.variants.find(item => item.id == parsed.id)
      : jb.workflowUtils.bestVariant(manifest.variants, ctx)
    if (!variant) return null
    const content = await readText(ctx.setVars({url: `${family}/releases/${version}/${variant.content}`}))
    if (content == null || await sha256(ctx.setVars({content})) != variant.sha256) throw new Error(`doclet checksum failed for ${variant.id}@${version}`)
    ctx.vars.workflowLogger?.info?.({t: 'doclet resolved', id: variant.id, version, categories: variant.categories}, {}, {ctx})
    return {...variant, name: parsed.name, version, publishedAt: manifest.publishedAt,
      docletWUrl: `${parsed.roomWUrl}/doclets/${variant.id}?v=${version}`, content}
  }
})

DbDriverInterceptor('doclet', {
  impl: dbDriverInterceptor({
    whenAndWhyToUse: 'Resolve logical room /doclets/<id> WURLs before physical object-store driver selection.',
    pre: async (ctx, {url, driverMethod}) => {
      if (!dsls.common.data.parseDocletWUrl.$runWithCtx(ctx, {docletWUrl: url})) return null
      if (!['get', 'head'].includes(driverMethod)) return {ok: false, status: 405, statusText: 'doclet releases are immutable',
        text: async () => null, json: async () => ({error: 'doclet releases are immutable'})}
      const doclet = await dsls.common.data.publishedDoclet.$runWithCtx(ctx, {docletWUrl: url})
      if (!doclet) return {ok: false, status: 404, statusText: 'doclet not found', text: async () => null, json: async () => null}
      const headers = {get: name => ({etag: doclet.sha256, 'content-length': doclet.content.length,
        'content-location': doclet.docletWUrl}[name.toLowerCase()])}
      return {ok: true, status: 200, headers, text: async () => driverMethod == 'head' ? null : doclet.content,
        json: async () => driverMethod == 'head' ? null : doclet}
    }
  })
})
