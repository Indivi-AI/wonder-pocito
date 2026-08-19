import { dsls, ns } from '@jb6/core'
import '@wonder/db/db-drivers-core.js'

const { tgp: { 'ctx-enricher': { Var } }, wonder: { DbBackend, AuthToken, AuthMethod, ListMethod, DbDriver,
  'db-backend': { dbBackend }, 'db-driver': { dbDriver } } } = dsls
const { authToken, authMethod, wget, wput, wappend, whead, wlist } = ns
DbBackend('amazon', {
  impl: dbBackend({
    categories: ['bucket','s3','amazon'],
    enrichCtx: [
      Var('bucketEndpoint', 'https://s3.il-central-1.amazonaws.com'),
      Var('bucketRegion', 'il-central-1')
    ]
  })
})
DbBackend('minio', {
  impl: dbBackend(['bucket','s3','minio'], [
    Var('bucketEndpoint', 'http://127.0.0.1:9000'),
    Var('bucketRegion', 'us-east-1')
  ])
})
AuthToken('authToken.awsCredentials', {
  impl: async ctx => {
    if (!globalThis.process) return { value: null, expired: () => false }
    const accessKeyId = ctx.vars.bucketAccessKeyId || process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey = ctx.vars.bucketSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY
    const sessionToken = ctx.vars.bucketSessionToken || process.env.AWS_SESSION_TOKEN
    const value = { accessKeyId, secretAccessKey, sessionToken, expiration: ctx.vars.bucketCredentialsExpiresAt }
    if (!accessKeyId || !secretAccessKey) throw new Error('object-storage credentials are missing')
    return { value, expired: () => !!value.expiration && Date.now() >= new Date(value.expiration).getTime() }
  }
})
AuthMethod('authMethod.awsSigV4', {
  impl: () => ({
    enrichRequest: async (fetchReq, authToken, ctx) => {
      if (!authToken.value) return fetchReq
      const { accessKeyId, secretAccessKey, sessionToken } = authToken.value
      const url = new URL(fetchReq.url), encoder = new TextEncoder(), subtle = globalThis.crypto.subtle
      const encode = value => encodeURIComponent(value).replace(/[!'()*]/g,
        ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
      const hash = async value => new Uint8Array(await subtle.digest('SHA-256',
        typeof value === 'string' ? encoder.encode(value) : value))
      const hmac = async (key, value) => new Uint8Array(await subtle.sign('HMAC',
        await subtle.importKey('raw', typeof key === 'string' ? encoder.encode(key) : key,
          { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), encoder.encode(value)))
      const hex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
      const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''), date = amzDate.slice(0, 8)
      const region = ctx.vars.bucketRegion || 'us-east-1', scope = `${date}/${region}/s3/aws4_request`
      const headers = new Headers(fetchReq.headers), payloadHash = 'UNSIGNED-PAYLOAD'
      headers.set('x-amz-content-sha256', payloadHash)
      headers.set('x-amz-date', amzDate)
      if (sessionToken) headers.set('x-amz-security-token', sessionToken)
      const signedHeaders = ['host', ...(sessionToken ? ['x-amz-security-token'] : []),
        'x-amz-content-sha256', 'x-amz-date']
      const canonicalHeaders = signedHeaders.map(name =>
        `${name}:${name === 'host' ? url.host : headers.get(name).trim()}\n`).join('')
      const canonicalQuery = [...url.searchParams].map(([key, value]) => [encode(key), encode(value)])
        .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue))
        .map(pair => pair.join('=')).join('&')
      const canonicalPath = url.pathname.split('/').map(part => encode(decodeURIComponent(part))).join('/')
      const canonical = [fetchReq.method, canonicalPath, canonicalQuery, canonicalHeaders,
        signedHeaders.join(';'), payloadHash].join('\n')
      const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, hex(await hash(canonical))].join('\n')
      const signingKey = await hmac(await hmac(await hmac(await hmac(`AWS4${secretAccessKey}`, date),
        region), 's3'), 'aws4_request')
      headers.set('authorization', `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(';')},`
        + ` Signature=${hex(await hmac(signingKey, stringToSign))}`)
      return new Request(fetchReq, { headers })
    }
  })
})
ListMethod('wlist.viaS3BucketApi', {
  impl: async (ctx, { dbLogger, bucketName, path, authToken, authMethod }) => {
    const endpoint = (ctx.vars.bucketEndpoint || 'https://s3.amazonaws.com').replace(/\/$/, '')
    const decodeXml = text => text.replace(/&(?:amp|lt|gt|quot|apos);/g,
      entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[entity])
    const valueOf = (xml, tag) => decodeXml(xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] || '')
    const result = []
    let continuationToken
    do {
      const query = new URLSearchParams({ 'list-type': '2', delimiter: '/', prefix: path })
      if (continuationToken) query.set('continuation-token', continuationToken)
      const res = await fetch(await authMethod.enrichRequest(
        new Request(`${endpoint}/${bucketName}?${query}`), authToken, ctx))
      const xml = res.ok ? await res.text() : ''
      for (const match of xml.matchAll(/<CommonPrefixes>([\s\S]*?)<\/CommonPrefixes>/g))
        result.push({ name: valueOf(match[1], 'Prefix'), isDir: true })
      for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g))
        result.push({ name: valueOf(match[1], 'Key'), updated: valueOf(match[1], 'LastModified'),
          size: Number(valueOf(match[1], 'Size')) || 0 })
      continuationToken = valueOf(xml, 'NextContinuationToken') || null
    } while (continuationToken)
    dbLogger?.info?.({ t: 'wlist.viaS3BucketApi', prefix: path, items: result.length }, {}, { ctx })
    return result
  }
})

DbDriver('bucket.amazon', {
  impl: dbDriver({
    whenAndWhyToUse: 'Optional Amazon S3 HTTP access with AWS Signature Version 4.',
    authToken: authToken.awsCredentials(),
    authMethod: authMethod.awsSigV4(),
    get: wget.viaBucketApi(),
    put: wput.viaBucketApi(),
    append: wappend.getAndPut(),
    head: whead.viaBucketApi(),
    list: wlist.viaS3BucketApi(),
    filePathUrl: '%$bucketEndpoint%/%$bucketName%/%$path%'
  })
})

DbDriver('bucket.minio', {
  impl: dbDriver({
    whenAndWhyToUse: 'Optional S3-compatible storage for an air-gapped environment.',
    authToken: authToken.anonymous(),
    authMethod: authMethod.none(),
    get: wget.viaBucketApi(),
    put: wput.viaBucketApi(),
    append: wappend.getAndPut(),
    head: whead.viaBucketApi(),
    list: wlist.viaS3BucketApi(),
    filePathUrl: '%$bucketEndpoint%/%$bucketName%/%$path%'
  })
})
