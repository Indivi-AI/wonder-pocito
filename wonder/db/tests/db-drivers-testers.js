import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/testing'
import '@jb6/common'
import '@wonder/db/db-drivers.js'
import '@wonder/db/db-drivers-live-repo.js'
import '@wonder/db/tests/gmail-test-users.js'

const { wfetch2 } = jb.wonderUtils
const {
  tgp: { 'ctx-enricher': { enrichCtx, testAdminUser, testUser } },
  test: { Test,
    test: { dataTest }
  },
  common: {
    Data,
    data: { asIs },
    boolean: { equals }
  }
} = dsls

const signedUrlServerForTests = env => env === 'staging'
  ? 'https://w-staging.indivi.ai/signed-url'
  : 'http://localhost:3000/signed-url'

Data('dbDriverPutGet', {
  params: [
    {id: 'args', as: 'object'},
    {id: 'useNode', as: 'boolean', type: 'boolean<common>'}
  ],
  impl: async (ctx, {}, {args, useNode}) => {
    const {url, body} = args, {dbLogger} = ctx.vars
    try {
      if (!coreUtils.isNode && useNode) {
        const script = `
          import { coreUtils, dsls } from '@jb6/core'
          import '@wonder/db/tests/db-drivers-testers.js'
          const args = ${JSON.stringify(args)}
          const ctx = new coreUtils.Ctx().setVars(args)
          await coreUtils.writeServiceResult(await dsls.common.data.dbDriverPutGet.$runWithCtx(ctx, args, true))`
        return (await coreUtils.runNodeCliViaJbWebServer(script, {importMapsInCli: './nodejs-importmap.js'})).result
      }
      const putRes = await wfetch2(url, {body: JSON.stringify(body), method: 'PUT', headers: {'content-type': 'application/json'}}, ctx)
      const res = await wfetch2(url, {method: 'GET'}, ctx)
      if (!res) return {error: `dbDriverPutGet: can not get ${url}`}
      const result = await res.json()
      dbLogger?.info?.({t: 'final Get result'}, {result}, {ctx})
      return {result, putRes, ...coreUtils.harvestLogs(ctx)}
    } catch (error) {
      coreUtils.logException(error, 'dbDriverPutGet failed', {ctx, url, args})
      return {content: null, error: error.stack}
    }
  }
})

Data('dbDriverAppendGet', {
  params: [
    {id: 'args', as: 'object'},
    {id: 'useNode', as: 'boolean', type: 'boolean<common>'}
  ],
  impl: async (ctx, {}, {args, useNode}) => {
    const {url, initialText, appendText, changeNewFile} = args, {dbLogger} = ctx.vars
    try {
      if (!coreUtils.isNode && useNode) {
        const script = `
          import { coreUtils, dsls } from '@jb6/core'
          import '@wonder/db/tests/db-drivers-testers.js'
          const args = ${JSON.stringify(args)}
          const ctx = new coreUtils.Ctx().setVars(args)
          await coreUtils.writeServiceResult(await dsls.common.data.dbDriverAppendGet.$runWithCtx(ctx, args, true))`
        return (await coreUtils.runNodeCliViaJbWebServer(script, {importMapsInCli: './nodejs-importmap.js'})).result
      }
      const headers = {'content-type': 'application/x-ndjson'}
      if (!changeNewFile) await wfetch2(url, {body: initialText, method: 'PUT', headers}, ctx)
      await wfetch2(url, {body: appendText, method: 'POST', headers}, ctx)
      const res = await wfetch2(url, {method: 'GET'}, ctx)
      if (!res) return {error: `dbDriverAppendGet: can not get ${url}`}
      const result = await res.text()
      dbLogger?.info?.({t: 'final Get result'}, {result}, {ctx})
      return {result, ...coreUtils.harvestLogs(ctx)}
    } catch (error) {
      coreUtils.logException(error, 'dbDriverAppendGet failed', {ctx, url, args})
      return {content: null, error: error.stack}
    }
  }
})

const {dbDriverPutGet, dbDriverAppendGet} = dsls.common.data

Test('dbDriverPutGetTest', {
  circuit: 'dbDriverTests.fsMem.browser.putGet',
  params: [
    {id: 'url', as: 'string'},
    {id: 'mode', options: 'browser-prod,browser-localhost,node-prod,node-localhost'},
    {id: 'content', as: 'object', defaultValue: asIs({a: 5})},
    {id: 'includeLogs', as: 'boolean', defaultValue: true, type: 'boolean<common>'}
  ],
  impl: dataTest({
    calculate: async (ctx, {testSessionId}, {url, content, mode, includeLogs}) => {
      const onLiveRepo = mode.includes('localhost')
      const forceGCS = mode.includes('prod')
      const useNode = mode.includes('node')
      const dbCtx = ctx.setVars({forceGCS, onLiveRepo, hasGcpIdentity: useNode})
      const result = await dbDriverPutGet.$runWithCtx(dbCtx, {url, body: content, forceGCS, onLiveRepo, testSessionId}, useNode)
      return includeLogs ? {...result, ...coreUtils.harvestLogs(dbCtx)} : result
    },
    expectedResult: equals('%result%', '%$content%'),
    timeout: 10000,
    logger: 'dbLogger'
  })
})

Test('dbDriverAppendTest', {
  circuit: 'dbDriverTests.fsMem.browser.append',
  params: [
    {id: 'url', as: 'string', dynamic: true},
    {id: 'mode', options: 'browser-prod,browser-localhost,node-prod,node-localhost'},
    {id: 'initialText', as: 'string', defaultValue: '{"id":0}\n'},
    {id: 'appendText', as: 'string', defaultValue: '{"id":1}\n'},
    {id: 'changeNewFile', as: 'boolean', type: 'boolean<common>'}
  ],
  impl: dataTest({
    calculate: async (ctx, {testSessionId}, {url: urlF, initialText, appendText, mode, changeNewFile}) => {
      const onLiveRepo = mode.includes('localhost')
      const forceGCS = mode.includes('prod')
      const useNode = mode.includes('node')
      const dbCtx = ctx.setVars({forceGCS, onLiveRepo, hasGcpIdentity: useNode})
      const result = await dbDriverAppendGet.$runWithCtx(dbCtx,
        {url: urlF(ctx), initialText, appendText, forceGCS, onLiveRepo, testSessionId, changeNewFile}, useNode)
      return result
    },
    expectedResult: ({data}, {}, {initialText, appendText, changeNewFile}) => data.result === `${changeNewFile ? '' : initialText}${appendText}`,
    timeout: 10000,
    logger: 'dbLogger'
  })
})

function signedRoomCtx(ctx, env) {
  return ctx.setVars({ forceGCS: false, isStaging: env === 'staging',
    ...(env === 'staging' && { signedUrlServer: 'https://w-staging.indivi.ai/signed-url' }) })
}

Test('signedRoomPutGetTest', {
  params: [
    {id: 'env', options: 'staging'}
  ],
  impl: dataTest({
    calculate: async (ctx, {}, {env}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      const url = 'signedRoom://testSignedRoom/admin/adminStuff.json'
      try {
        await wfetch2(url, { body: JSON.stringify({ a: 5, ts: Date.now() }), method: 'PUT', headers: {'content-type': 'application/json'} }, dbCtx)
        const res = await wfetch2(url, { method: 'GET' }, dbCtx)
        return { result: await res.json(), ...coreUtils.harvestLogs(dbCtx) }
      } catch(e) {
        coreUtils.logException(e, 'signedRoomPutGetTest failed', { ctx: dbCtx })
        return null
      }
    },
    expectedResult: equals('%result.a%', 5),
    setup: testAdminUser(),
    timeout: 12000,
    logger: 'dbLogger'
  })
})

Test('signedRoomAppendTest', {
  params: [
    {id: 'env', options: 'staging'}
  ],
  impl: dataTest({
    calculate: async (ctx, {}, {env}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      const url = 'signedRoom://testSignedRoom/admin/testAppend.jsonl', headers = {'content-type': 'application/x-ndjson'}
      try {
        await wfetch2(url, { body: '{"id":0}\n', method: 'PUT', headers }, dbCtx)
        await wfetch2(url, { body: '{"id":1}\n', method: 'POST', headers }, dbCtx)
        const res = await wfetch2(url, { method: 'GET' }, dbCtx)
        return { result: await res.text(), ...coreUtils.harvestLogs(dbCtx) }
      } catch(e) {
        coreUtils.logException(e, 'signedRoomAppendTest failed', { ctx: dbCtx })
        return null
      }
    },
    expectedResult: equals('%result%', '{"id":0}\n{"id":1}\n'),
    setup: testAdminUser(),
    timeout: 12000,
    logger: 'dbLogger'
  })
})

Test('signedRoomPermissionsTest', {
  params: [
    {id: 'env', options: 'staging'},
    {id: 'enrichUser', type: 'ctx-enricher<tgp>', dynamic: true, defaultValue: testUser()}
  ],
  impl: dataTest({
    calculate: async (ctx, {}, {env, enrichUser}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      const signingUrl = signedUrlServerForTests(env)
      const {idToken: adminToken, userEmail: adminEmail} = ctx.vars
      const {idToken: userToken, userEmail} = (await enrichUser(ctx)).vars
      const req = (token, path, method) => fetch(`${signingUrl}/${path}?method=${method}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const labels = ['admin-read-admin', 'admin-write-admin', 'user-read-admin', 'admin-read-usersRO',
        'admin-write-usersRO', 'user-read-usersRO', 'user-write-usersRO', 'admin-read-user',
        'user-read-own', 'user-write-own', 'user-read-others', 'no-token']
      const userPath = `testSignedRoom/userProtected/${userEmail}/cart.json`
      const results = await Promise.all([
        req(adminToken, 'testSignedRoom/admin/test.json', 'GET'),
        req(adminToken, 'testSignedRoom/admin/test.json', 'PUT'),
        req(userToken, 'testSignedRoom/admin/test.json', 'GET'),
        req(adminToken, 'testSignedRoom/usersRO/test.json', 'GET'),
        req(adminToken, 'testSignedRoom/usersRO/test.json', 'PUT'),
        req(userToken, 'testSignedRoom/usersRO/test.json', 'GET'),
        req(userToken, 'testSignedRoom/usersRO/test.json', 'PUT'),
        req(adminToken, userPath, 'GET'),
        req(userToken, userPath, 'GET'),
        req(userToken, userPath, 'PUT'),
        req(userToken, `testSignedRoom/userProtected/${adminEmail}/cart.json`, 'GET'),
        fetch(`${signingUrl}/testSignedRoom/admin/test.json?method=GET`)
      ])
      const details = await Promise.all(results.map(async (res, i) => {
        const body = res.status !== 200 ? await res.text().catch(() => '') : ''
        return { label: labels[i], status: res.status, ...(body && { body }) }
      }))
      dbCtx.vars.dbLogger?.info?.({ t: 'permissions results', details }, {}, { ctx: dbCtx })
      return { result: results.map(res => res.status).join(','), ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', '200,200,403,200,200,200,403,200,200,200,403,401'),
    setup: testAdminUser(),
    timeout: 12000,
    logger: 'dbLogger'
  })
})

Test('signedRoomGooglePermissionsTest', {
  params: [
    {id: 'env', options: 'staging'}
  ],
  impl: dataTest({
    calculate: async (ctx, {}, {env}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      const signingUrl = signedUrlServerForTests(env)
      const headers = { Authorization: `Bearer ${ctx.vars.idToken}` }
      const req = path => fetch(`${signingUrl}/${path}?method=GET`, { headers })
      const results = await Promise.all([
        req('testSignedRoom/admin/test.json'),
        req('testSignedRoom/usersRO/test.json'),
        fetch(`${signingUrl}/testSignedRoom/admin/test.json?method=GET`)
      ])
      const details = await Promise.all(results.map(async res => {
        const body = res.status !== 200 ? await res.text().catch(() => '') : ''
        return { status: res.status, ...(body && { body }) }
      }))
      dbCtx.vars.dbLogger?.info?.({ t: 'google permissions results', details }, {}, { ctx: dbCtx })
      return { result: results.map(res => res.status).join(','), ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', '403,200,401'),
    setup: testUser(),
    timeout: 12000,
    logger: 'dbLogger'
  })
})

Test('signedRoomUsersRWTest', {
  params: [
    {id: 'env', options: 'staging'}
  ],
  impl: dataTest({
    calculate: async (ctx, {}, {env}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      const url = 'signedRoom://testSignedRoom/usersRW/testUsersRW'
      try {
        await wfetch2(url, { body: JSON.stringify({ a: 42, ts: Date.now() }), method: 'PUT', headers: {'content-type': 'application/json'} }, dbCtx)
        const res = await wfetch2(url, { method: 'GET' }, dbCtx)
        return { result: await res.json(), ...coreUtils.harvestLogs(dbCtx) }
      } catch(e) {
        coreUtils.logException(e, 'signedRoomUsersRWTest failed', { ctx: dbCtx })
        return null
      }
    },
    expectedResult: equals('%result.a%', 42),
    setup: testUser(),
    timeout: 12000,
    logger: 'dbLogger'
  })
})

Test('signedRoomListTest', {
  params: [
    {id: 'env', options: 'staging'}
  ],
  impl: dataTest({
    calculate: async (ctx, {}, {env}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      const dir = 'signedRoom://testSignedRoom/usersRW/listTest'
      try {
        await wfetch2(`${dir}/a.json`, { body: '{"x":1}', method: 'PUT', headers: {'content-type': 'application/json'} }, dbCtx)
        await wfetch2(`${dir}/b.json`, { body: '{"x":2}', method: 'PUT', headers: {'content-type': 'application/json'} }, dbCtx)
        const list = await (await wfetch2(`${dir}/`, { method: 'GET' }, dbCtx)).json()
        const names = (Array.isArray(list) ? list : []).map(e => e.name).filter(n => /\/(a|b)\.json$/.test(n))
        return { result: names.length, ...coreUtils.harvestLogs(dbCtx) }
      } catch(e) {
        coreUtils.logException(e, 'signedRoomListTest failed', { ctx: dbCtx })
        return null
      }
    },
    expectedResult: equals('%result%', 2),
    setup: testUser(),
    timeout: 20000,
    logger: 'dbLogger'
  })
})

Test('signedRoomTrailingSlashGetTest', {
  params: [
    {id: 'env', options: 'staging'}
  ],
  impl: dataTest({
    calculate: async (ctx, {}, {env}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      await wfetch2('signedRoom://testSignedRoom/usersRW/listTest/a.json', {
        body: '{"x":1}', method: 'PUT', headers: {'content-type': 'application/json'}}, dbCtx)
      const res = await wfetch2('signedRoom://testSignedRoom/usersRW/listTest/', { method: 'GET' }, dbCtx)
      const list = await res.json()
      return { result: (Array.isArray(list) ? list : []).some(e => /\/a\.json$/.test(e.name)), ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', true),
    setup: testUser(),
    timeout: 20000,
    logger: 'dbLogger'
  })
})

Test('signedRoomMediaPutGetTest', {
  params: [
    {id: 'env', options: 'staging'}
  ],
  impl: dataTest({
    calculate: async (ctx, {}, {env}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      const url = 'signedRoom://testSignedRoom/usersRW/assets/test-media.png'
      try {
        const testB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        const body = coreUtils.isNode ? Buffer.from(testB64, 'base64') : Uint8Array.from(atob(testB64), c => c.charCodeAt(0))
        const putRes = await wfetch2(url, { body, method: 'PUT', headers: {'content-type': 'image/png'} }, dbCtx)
        if (!putRes.ok) return { result: `put:${putRes.status}`, ...coreUtils.harvestLogs(dbCtx) }
        const res = await wfetch2(url, { method: 'HEAD' }, dbCtx)
        if (!res.ok) return { result: `head:${res.status}`, ...coreUtils.harvestLogs(dbCtx) }
        const resolved = res.headers.get('Content-Location')
        return { result: `ok:${res.ok}:signed:${resolved?.includes('X-Goog-Signature')}`
          + `:protected:${resolved?.includes('indiviai-wonder-protected')}`, ...coreUtils.harvestLogs(dbCtx) }
      } catch(e) {
        coreUtils.logException(e, 'signedRoomMediaPutGetTest failed', { ctx: dbCtx })
        return null
      }
    },
    expectedResult: equals('%result%', 'ok:true:signed:true:protected:true'),
    setup: testUser(),
    timeout: 20000,
    logger: 'dbLogger,signedRoomLogger'
  })
})

Test('signedRoomSigningTest', {
  impl: dataTest({
    calculate: async ctx => {
      const dbCtx = signedRoomCtx(ctx, 'staging')
      const res = await wfetch2('signedRoom://testSignedRoom/usersRO/sales-large.json', { method: 'HEAD' }, dbCtx)
      return { result: res.status, statusText: res.statusText, body: !res.ok && await res.text(), ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', 200),
    setup: testUser(),
    timeout: 12000,
    logger: 'dbLogger'
  })
})

// public room read: assets.json + usersRO/sales-large.json are seeded identically in testPublicRoom (public bucket) and testSignedRoom
Test('publicRoomCountTest', {
  params: [
    {id: 'file', as: 'string'},
    {id: 'count', as: 'number'}
  ],
  impl: dataTest({
    calculate: async (ctx, {}, {file}) => {
      const dbCtx = ctx.setVars({ dbHost: 'node', forceGCS: true, hasGcpIdentity: false })
      const res = await wfetch2(`room:gcs//testPublicRoom/${file}`, { method: 'GET' }, dbCtx)
      return { result: (await res.json()).length, ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', '%$count%'),
    timeout: 10000,
    logger: 'dbLogger'
  })
})
