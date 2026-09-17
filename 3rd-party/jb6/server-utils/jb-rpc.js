import { jb, coreUtils } from '@jb6/core'
import express from 'express'
import cors from 'cors'
import { serverUtils } from '@jb6/server-utils'
const { compByFullId } = coreUtils

Object.assign(serverUtils, {startDedicatedRpcServer, serveRpc})

async function startDedicatedRpcServer({port = 3000, entryPoints = [], serverName = 'JB6 RPC Server'}) {
  await Promise.all(entryPoints.map(entryPoint=> import(entryPoint)))
  const app = express()
  app.use(cors({ origin: '*' }))
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))  
  serveRpc(app)
  app.listen(port, () => {
    console.log(`${serverName} is running on http://localhost:${port} entryPoints: ${entryPoints.join(', ')}`)
  })
}

async function serveRpc(app) {
  app.post('/rpc', async (req, res) => {
      const { jsonrpc, method, params, id } = req.body
      console.log('serveRpc', {body: req.body, jsonrpc, method, params, id})
      const comp = compByFullId(method, {dsls: jb.dsls})
      if (!comp) {
        console.log('can not find comp', {method})
        debugger
        if (method != null) {
          return res.json({ jsonrpc:'2.0', error:{ code:-32601, message:'Method not found' }, method, id})
        }
        return res.status(204).end()
      }
    
      try {
        const result = await comp.$run(params)
        console.log('result', {result})
        // only reply if it's a request (id != null)
        if (id != null) {
          res.json({ jsonrpc:'2.0', result, id })
        } else {
          res.status(204).end()   // notification: no content
        }
      } catch (err) {
        console.log('error', {err})
        if (id != null) {
          res.json({ jsonrpc:'2.0', error:{ code:-32000, message:err.stack }, id })
        } else {
          res.status(204).end()
        }
      }
  })
}

