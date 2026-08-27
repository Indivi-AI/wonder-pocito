import { jb, coreUtils } from '@jb6/core'
import '@jb6/lang-service'
import '@wonder/db/db-drivers-live-repo.js'

export const liveRepoSourceImports = async (profile, ctx) => {
  await import(await coreUtils.resolveDeveloperEntryPoint(ctx))
  return coreUtils.calcImportsForProfile(profile, { entryPointPaths: [jb.coreRegistry.developerEntryPoint], ctx })
}

export const setupLiveRepoRoomApplet = (app, {serveAppletPage, imports}) => app.get('/room/:roomId/applet/:name', async (req, res) => {
  const {roomId, name} = req.params, roomWUrl = `room://${roomId}`, ctx = new coreUtils.Ctx().setVars({db: 'fs'})
  const readDef = async path => {
    const response = await jb.wonderUtils.wfetch2(`${roomWUrl}/${path}`, {method: 'GET'}, ctx)
    return response.ok ? response.json() : null
  }
  const applet = await readDef(`applets/${name}.json`)
  if (!applet) return res.status(404).json({error: `local FS applet missing: files/rooms/${roomId}/applets/${name}.json; use MCP to copy it locally`})
  await serveAppletPage({...applet, roomWUrl, noAuth: true, runtimeVars: {db: 'fs', onLiveRepo: true, noAuth: true},
    og: [await readDef('admin/branding.json'), applet.og]}, res, imports)
})
