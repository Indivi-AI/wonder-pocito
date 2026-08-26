import { dsls, ns } from '@jb6/core'
import '@wonder/db/db-drivers-core.js'

const { tgp: { 'ctx-enricher': { Var } }, wonder: { Scope, ObjectStore, DbDriver,
  scope: { scope }, 'object-store': { objectStore }, 'db-driver': { dbDriver } } } = dsls
const { authToken, authMethod, wget, whead } = ns

Scope('clientCode', {
  impl: scope('wonder-code-packages', { path: ['fileName'] })
})

Scope('lambdaCode', {
  impl: scope('wonder-code-packages', { folderInBucket: 'lambdas', path: ['fileName'] })
})

ObjectStore('cloudflare', {
  impl: objectStore({
    categories: ['cloudflare', 'public', 'readonly'],
    enrichCtx: Var('clientCodeEndpoint', 'https://jb6-cdn.pages.dev')
  })
})

DbDriver('clientCode.cloudflare', {
  impl: dbDriver({
    whenAndWhyToUse: 'Read browser runtime code from the public Cloudflare CDN.',
    authToken: authToken.anonymous(),
    authMethod: authMethod.none(),
    get: wget.viaBucketApi(),
    head: whead.viaBucketApi(),
    filePathUrl: (ctx, { clientCodeEndpoint, path }) => `${clientCodeEndpoint}/${path.replace(/^runtime\//, '')}`
  })
})

DbDriver('clientCode.gcs', {
  impl: dbDriver({
    whenAndWhyToUse: 'Read client code packages from the public GCS bucket over anonymous HTTPS.',
    authToken: authToken.anonymous(),
    authMethod: authMethod.none(),
    get: wget.viaBucketApi(),
    head: whead.viaBucketApi(),
    filePathUrl: '%$bucketEndpoint%/%$bucketName%/%$path%'
  })
})

DbDriver('lambdaCode.gcs', {
  impl: dbDriver({
    whenAndWhyToUse: 'Read lambda code packages from the public GCS bucket over anonymous HTTPS.',
    authToken: authToken.anonymous(),
    authMethod: authMethod.none(),
    get: wget.viaBucketApi(),
    head: whead.viaBucketApi(),
    filePathUrl: '%$bucketEndpoint%/%$bucketName%/%$path%'
  })
})
