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
    whenAndWhyToUse: 'Private signedRoom:// content using short-lived signed URLs.',
    designConcerns: 'GET, PUT and HEAD use signed URLs; listing uses a separately authenticated GCS HTTP request.',
    authToken: authToken.anonymous(),
    authMethod: authMethod.none(),
    listAuthToken: authToken.gcpAccessToken(),
    listAuthMethod: authMethod.bearer(),
    get: wget.viaBucketApi(),
    put: wput.viaBucketApi(),
    append: wappend.bucketSingleWriterGetPut(),
    head: whead.viaBucketApi(),
    list: wlist.viaBucketApi(),
    filePathUrl: (ctx, { path }) => getCachedSignedUrl(ctx, path, (ctx.vars.method || 'GET').toUpperCase())
  })
})
