import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/testing'
import '@jb6/common'
import './db-drivers.js'
import './db-drivers-live-repo.js'

const { wfetch2, getIdToken } = jb.wonderUtils
const {
  test: { Test,
    test: { dataTest }
  },
  common: {
    data: { asIs, list, extendWithObj },
    boolean: { equals }
  }
} = dsls

const mintTestToken = phone => fetch(`http://localhost:3000/mint-wonder-token?phone=${encodeURIComponent(phone)}`).then(r => r.text())
const signedUrlServerForTests = env => env === 'staging'
  ? 'https://staging.indivi.ai/signed-url'
  : 'http://localhost:3000/signed-url'

Test('dbDriverPutGetTest', {
  circuit: 'dbDriverTests.fsMem.browser.putGet',
  params: [
    {id: 'url', as: 'string'},
    {id: 'mode', options: 'browser-prod,browser-localhost,node-prod,node-localhost'},
    {id: 'content', as: 'object', defaultValue: asIs({a: 5})},
    {id: 'includeLogs', as: 'boolean', defaultValue: true}
  ],
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async (ctx, {testSessionId}, {url, content, mode, includeLogs}) => {
      const onLiveRepo = mode.includes('localhost')
      const forceGCS = mode.includes('prod')
      const useNode = mode.includes('node')
      const dbCtx = ctx.setVars({forceGCS, onLiveRepo, hasGcpIdentity: useNode})
      const result = await putGet({url, body: content, forceGCS, onLiveRepo, testSessionId}, useNode, dbCtx)
      return includeLogs ? {...result, ...coreUtils.harvestLogs(dbCtx)} : result
    },
    expectedResult: equals('%result%', '%$content%'),
    timeout: 10000
  })
})

Test('dbDriverAppendTest', {
  circuit: 'dbDriverTests.fsMem.browser.append',
  params: [
    {id: 'url', as: 'string', dynamic: true},
    {id: 'mode', options: 'browser-prod,browser-localhost,node-prod,node-localhost'},
    {id: 'initialArray', as: 'array', defaultValue: asIs([{id: 0}])},
    {id: 'appendItems', as: 'array', defaultValue: asIs([{id: 1}])},
    {id: 'changeNewFile', as: 'boolean'}
  ],
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async (ctx, {testSessionId}, {url: urlF, initialArray, appendItems, mode, changeNewFile}) => {
      const onLiveRepo = mode.includes('localhost')
      const forceGCS = mode.includes('prod')
      const useNode = mode.includes('node')
      const dbCtx = ctx.setVars({forceGCS, onLiveRepo, hasGcpIdentity: useNode})
      const result = await putChangeGet({url: urlF(ctx), initialArray, appendItems, forceGCS, onLiveRepo, testSessionId, changeNewFile}, useNode, dbCtx)
      return result
    },
    expectedResult: equals('%result%', list('%$initialArray%','%$appendItems%')),
    timeout: 10000
  })
})

function signedRoomCtx(ctx, env) {
  return ctx.setVars({ forceGCS: false, isStaging: env === 'staging',
    ...(env === 'staging' && { signedUrlServer: 'https://wonder-server-staging-365199207445.me-west1.run.app/signed-url' }) })
}

Test('signedRoomPutGetTest', {
  params: [{id: 'env', options: 'staging'}],
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async (ctx, {}, {env}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      const url = 'signedRoom://testSignedRoom/admin/adminStuff.json'
      try {
        await wfetch2(url, { body: { a: 5, ts: Date.now() }, method: 'PUT' }, dbCtx)
        const res = await wfetch2(url, { method: 'GET' }, dbCtx)
        return { result: await res.json(), ...coreUtils.harvestLogs(dbCtx) }
      } catch(e) {
        coreUtils.logException(e, 'signedRoomPutGetTest failed', { ctx: dbCtx })
        return null
      }
    },
    expectedResult: equals('%result.a%', 5),
    timeout: 12000
  })
})

Test('signedRoomAppendTest', {
  params: [{id: 'env', options: 'staging'}],
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async (ctx, {}, {env}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      const url = 'signedRoom://testSignedRoom/admin/testAppend'
      try {
        await wfetch2(url, { body: [{id: 0}], method: 'PUT' }, dbCtx)
        await wfetch2(url, { body: [{id: 1}], method: 'POST' }, dbCtx)
        const res = await wfetch2(url, { method: 'GET' }, dbCtx)
        return { result: await res.json(), ...coreUtils.harvestLogs(dbCtx) }
      } catch(e) {
        coreUtils.logException(e, 'signedRoomAppendTest failed', { ctx: dbCtx })
        return null
      }
    },
    expectedResult: equals('%result%', [{id: 0}, {id: 1}]),
    timeout: 12000
  })
})

Test('signedRoomPermissionsTest', {
  params: [{id: 'env', options: 'staging'}],
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async (ctx, {}, {env}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      const signingUrl = signedUrlServerForTests(env)
      const [adminToken, user1Token, user2Token, strangerToken] = await Promise.all(
        ['+1000ADMIN', '+1000USER1', '+1000USER2', '+1000STRANGER'].map(mintTestToken))
      const req = (token, path, method) => fetch(`${signingUrl}/${path}?method=${method}`, { headers: { Authorization: `Bearer ${token}` } })
      const labels = ['admin-read-admin','admin-write-admin','user-read-admin','admin-read-usersRO','admin-write-usersRO',
        'user-read-usersRO','user-write-usersRO','admin-read-userProtected','user-read-own','user-write-own','user-read-others','stranger-read','no-token']
      const results = await Promise.all([
        req(adminToken, 'testSignedRoom/admin/test.json', 'GET'),              // 1. admin read admin → 200
        req(adminToken, 'testSignedRoom/admin/test.json', 'PUT'),              // 2. admin write admin → 200
        req(user1Token, 'testSignedRoom/admin/test.json', 'GET'),              // 3. user read admin → 403
        req(adminToken, 'testSignedRoom/usersRO/test.json', 'GET'),                // 4. admin read usersRO → 200
        req(adminToken, 'testSignedRoom/usersRO/test.json', 'PUT'),                // 5. admin write usersRO → 200
        req(user1Token, 'testSignedRoom/usersRO/test.json', 'GET'),                // 6. user read usersRO → 200
        req(user1Token, 'testSignedRoom/usersRO/test.json', 'PUT'),                // 7. user write usersRO → 403
        req(adminToken, 'testSignedRoom/userProtected/+1000USER1/cart.json', 'GET'), // 8. admin read any user → 200
        req(user1Token, 'testSignedRoom/userProtected/+1000USER1/cart.json', 'GET'), // 9. user read own → 200
        req(user1Token, 'testSignedRoom/userProtected/+1000USER1/cart.json', 'PUT'), // 10. user write own → 200
        req(user2Token, 'testSignedRoom/userProtected/+1000USER1/cart.json', 'GET'), // 11. user read other's → 403
        req(strangerToken, 'testSignedRoomSpecific/usersRO/test.json', 'GET'),     // 12. stranger (not member) → 403
        fetch(`${signingUrl}/testSignedRoom/admin/test.json?method=GET`), // 13. no token → 401
      ])
      const details = await Promise.all(results.map(async (r, i) => {
        const body = r.status !== 200 ? await r.text().catch(() => '') : ''
        return { label: labels[i], status: r.status, ...(body && { body }) }
      }))
      dbCtx.vars.dbLogger?.info?.({ t: 'permissions results', details }, {}, { ctx: dbCtx })
      return { result: results.map(r => r.status).join(','), ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', '200,200,403,200,200,200,403,200,200,200,403,403,401'),
    timeout: 12000
  })
})

Test('signedRoomGooglePermissionsTest', {
  params: [{id: 'env', options: 'staging'}],
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async (ctx, {}, {env}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      const idToken = await getIdToken(dbCtx)
      const signingUrl = signedUrlServerForTests(env)
      const headers = { Authorization: `Bearer ${idToken}` }
      const req = (path, method) => fetch(`${signingUrl}/${path}?method=${method}`, { headers })
      const results = await Promise.all([
        req('testSignedRoom/admin/test.json', 'GET'),
        req('testSignedRoom/usersRO/test.json', 'GET'),
        fetch(`${signingUrl}/testSignedRoom/admin/test.json?method=GET`),
      ])
      const details = await Promise.all(results.map(async (r, i) => {
        const body = r.status !== 200 ? await r.text().catch(() => '') : ''
        return { status: r.status, ...(body && { body }) }
      }))
      dbCtx.vars.dbLogger?.info?.({ t: 'google permissions results', details }, {}, { ctx: dbCtx })
      return { result: results.map(r => r.status).join(','), ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', '200,200,401'),
    timeout: 12000
  })
})

Test('signedRoomUsersRWTest', {
  params: [{id: 'env', options: 'staging'}],
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async (ctx, {}, {env}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      const url = 'signedRoom://testSignedRoom/usersRW/testUsersRW'
      try {
        await wfetch2(url, { body: { a: 42, ts: Date.now() }, method: 'PUT' }, dbCtx)
        const res = await wfetch2(url, { method: 'GET' }, dbCtx)
        return { result: await res.json(), ...coreUtils.harvestLogs(dbCtx) }
      } catch(e) {
        coreUtils.logException(e, 'signedRoomUsersRWTest failed', { ctx: dbCtx })
        return null
      }
    },
    expectedResult: equals('%result.a%', 42),
    timeout: 12000
  })
})

Test('signedRoomListTest', {
  params: [{id: 'env', options: 'staging'}],
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async (ctx, {}, {env}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      const dir = 'signedRoom://testSignedRoom/usersRW/listTest'
      try {
        await wfetch2(`${dir}/a.json`, { body: { x: 1 }, method: 'PUT' }, dbCtx)
        await wfetch2(`${dir}/b.json`, { body: { x: 2 }, method: 'PUT' }, dbCtx)
        const list = await (await wfetch2(`${dir}/`, { method: 'GET' }, dbCtx)).json()
        const names = (Array.isArray(list) ? list : []).map(e => e.name).filter(n => /\/(a|b)\.json$/.test(n))
        return { result: names.length, ...coreUtils.harvestLogs(dbCtx) }
      } catch(e) {
        coreUtils.logException(e, 'signedRoomListTest failed', { ctx: dbCtx })
        return null
      }
    },
    expectedResult: equals('%result%', 2),
    timeout: 20000
  })
})

Test('signedRoomTrailingSlashGetTest', {
  params: [{id: 'env', options: 'staging'}],
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async (ctx, {}, {env}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      await wfetch2('signedRoom://testSignedRoom/usersRW/listTest/a.json', { body: { x: 1 }, method: 'PUT' }, dbCtx)
      const res = await wfetch2('signedRoom://testSignedRoom/usersRW/listTest/', { method: 'GET' }, dbCtx)
      const list = await res.json()
      return { result: (Array.isArray(list) ? list : []).some(e => /\/a\.json$/.test(e.name)), ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', true),
    timeout: 20000
  })
})

Test('signedRoomMediaPutGetTest', {
  params: [{id: 'env', options: 'staging'}],
  impl: dataTest({
    logger: 'dbLogger,signedRoomLogger',
    calculate: async (ctx, {}, {env}) => {
      const dbCtx = signedRoomCtx(ctx, env)
      const url = 'signedRoom://testSignedRoom/usersRW/assets/test-media.png'
      try {
        const testB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        const body = coreUtils.isNode ? Buffer.from(testB64, 'base64').toString('base64') : testB64
        const putRes = await wfetch2(url, { body, method: 'PUT' }, dbCtx)
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
    timeout: 20000
  })
})

Test('signedRoomSigningTest', {
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async ctx => {
      const dbCtx = signedRoomCtx(ctx, 'staging')
      const res = await wfetch2('signedRoom://testSignedRoom/usersRO/test.json', { method: 'HEAD' }, dbCtx)
      return { result: res.status, statusText: res.statusText, body: !res.ok && await res.text(), ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', 200),
    timeout: 12000
  })
})

Test('signedRoomCloudRunPutGetTest', {
  params: [{id: 'env', options: 'staging'}],
  impl: dataTest({
    calculate: async (ctx, {}, {env}) => {
      const { wonderServer } = serversByUrl(ctx.setVars({ isStaging: env === 'staging', wonderVersion: 'whapi-staging' }))
      const wfetchUrl = `${wonderServer}/wfetch`
      const call = (url, opts) => fetch(wfetchUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceType: 'data-service', params: { url, opts }, vars: { isStaging: env === 'staging' } })
      })
      await call('signedRoom://testSignedRoom/admin/testCloudPutGet', { body: { a: 7 }, method: 'PUT' })
      const res = await call('signedRoom://testSignedRoom/admin/testCloudPutGet', { method: 'GET' })
      return { result: (await res.json()).data }
    },
    expectedResult: equals('%result.a%', 7),
    timeout: 12000
  })
})

// public room read: assets.json + usersRO/sales-large.json are seeded identically in testPublicRoom (public bucket) and testSignedRoom
Test('publicRoomCountTest', {
  params: [{id: 'file', as: 'string'}, {id: 'count', as: 'number'}],
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async (ctx, {}, {file}) => {
      const dbCtx = ctx.setVars({ dbHost: 'node', forceGCS: true, hasGcpIdentity: false })
      const res = await wfetch2(`room:gcs//testPublicRoom/${file}`, { method: 'GET' }, dbCtx)
      return { result: (await res.json()).length, ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', '%$count%'),
    timeout: 10000
  })
})

Test('dbDriverPatchTest', {
  circuit: 'dbDriverTests.fsMem.browser.patch',
  params: [
    {id: 'url', as: 'string'},
    {id: 'mode', options: 'browser-prod,browser-localhost,node-prod,node-localhost'},
    {id: 'initialObj', as: 'object', defaultValue: asIs({a: 3})},
    {id: 'patchData', as: 'object', defaultValue: asIs({title: 'patched'})},
  ],
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async (ctx, {testSessionId}, {url, initialObj, patchData, mode}) => {
      const onLiveRepo = mode.includes('localhost')
      const forceGCS = mode.includes('prod')
      const useNode = mode.includes('node')
      const dbCtx = ctx.setVars({forceGCS, onLiveRepo, hasGcpIdentity: useNode})
      const result = await putChangeGet({url, initialObj, patchData, forceGCS, onLiveRepo, testSessionId}, useNode, dbCtx)
      return result
    },
    expectedResult: equals('%result%', extendWithObj('%$initialObj%', '%$patchData%')),
    timeout: 10000
  })
})

export async function putGet(args, useNode, ctx) {
  const { url, body } = args
  const dbLogger = ctx.vars.dbLogger
  try {
    if (!coreUtils.isNode && useNode) {
      const script = `
        import { coreUtils, jb } from '@jb6/core'
        import {putGet} from '@wonder/db/db-drivers-testers.js'
        try {
          debugger
          const { testSessionId, forceGCS, db, onLiveRepo } = ${JSON.stringify(args)}
          const ctx = new coreUtils.Ctx().setVars({testSessionId, forceGCS, db, onLiveRepo})
          const result = await putGet(${JSON.stringify(args)},true,ctx)
          await coreUtils.writeServiceResult(result)
        } catch (error) {
          await coreUtils.writeServiceResult(error.stack || error)
        }`
        const res = await coreUtils.runNodeCliViaJbWebServer(script,{importMapsInCli: './nodejs-importmap.js'})
        return res.result
      }

      const putRes = await wfetch2(url, {body, method: 'PUT'}, ctx)
      const res = await wfetch2(url, {method: 'GET'}, ctx)
      if (!res) {
        return { error: `putGet tester: can not get ${url}`}
      }
      const result = await res.json()
      dbLogger?.info?.({t:'final Get result'},{result},{ctx})
      return {result, putRes, ...coreUtils.harvestLogs(ctx)}
  } catch (error) {
    coreUtils.logException(error, 'putGet failed', { ctx, url, args })
    return {content: null, error: error.stack}
  }
}

export async function putChangeGet(args, useNode, ctx) {
  const { url, initialArray, appendItems, initialObj, patchData, changeNewFile } = args
  const { dbLogger } = ctx.vars
  try {
    if (!coreUtils.isNode && useNode) {
      const script = `
        import { coreUtils } from '@jb6/core'
        import {putChangeGet} from '@wonder/db/db-drivers-testers.js'
        try {
          const args = ${JSON.stringify(args)}
          const ctx = new coreUtils.Ctx().setVars(args)
          const result = await putChangeGet(args,true,ctx)
          await coreUtils.writeServiceResult(result)
        } catch (error) {
          await coreUtils.writeServiceResult(error.stack || error)
        }`
      return (await coreUtils.runNodeCliViaJbWebServer(script,{importMapsInCli: './nodejs-importmap.js'})).result
    }

    if (initialArray) {
      !changeNewFile && await wfetch2(url, {body: initialArray, method: 'PUT'}, ctx)
      await wfetch2(url, {body: appendItems, method: 'POST'}, ctx)
    } else {
      !changeNewFile && await wfetch2(url, {body: initialObj, method: 'PUT'}, ctx)
      await wfetch2(url, {body: patchData, method: 'PATCH'}, ctx)  
    }
    const res = await wfetch2(url, {method: 'GET'}, ctx)
    if (!res) return { error: `putAppendGet tester: can not get ${url}`}
    const result = await res.json()
    dbLogger?.info?.({t:'final Get result'},{result},{ctx})
    return {result, ...coreUtils.harvestLogs(ctx)}
  } catch (error) {
    coreUtils.logException(error, 'putAppendGet failed', { ctx, url, args })
    return {content: null, error: error.stack}
  }
}
