import { jb, dsls, ns } from '@jb6/core'
import './db-drivers-core.js'

const { wonderUtils: { getCachedSignedUrl } } = jb
const { wonder: { Scope, DbDriver, scope: { scope }, 'db-driver': { dbDriver } } } = dsls
const { authToken, authMethod, wget, wput, wappend, whead, wlist } = ns

Scope('signedRoom', {
  impl: scope('indiviai-wonder-protected', { path: ['roomId','fileName'] })
})

DbDriver('signedRoom', {
  impl: dbDriver({
    whenAndWhyToUse: 'Protected signedRoom:// content using short-lived signed URLs.',
    designConcerns: 'GET, PUT and HEAD use signed URLs. List uses authenticated GCS.',
    authToken: authToken.anonymous(),
    authMethod: authMethod.none(),
    get: wget.viaBucketApi(),
    put: wput.viaBucketApi(),
    append: wappend.getAndPut(),
    head: whead.viaBucketApi(),
    list: wlist.GcsJSApi(),
    filePathUrl: (ctx, { path }) => getCachedSignedUrl(ctx, path, (ctx.vars.method || 'GET').toUpperCase())
  })
})
