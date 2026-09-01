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
  if (!applet) return res.status(404).json({error:
    `local FS applet missing: files/rooms/${roomId}/applets/${name}.json; a registered react-comp needs no def file at /applet/${name}`})
  await serveAppletPage({...applet, roomWUrl, noAuth: true, runtimeVars: {db: 'fs', onLiveRepo: true, noAuth: true},
    og: [await readDef('admin/branding.json'), applet.og]}, res, imports)
})

// room-less dev twin: GET /applet/:name serves any react-comp reachable from the developer entry point - spec derived
// from the comp itself, no def file, no published appletV. room://dev (files/rooms/dev) backs persistence and the noAuth gate.
export const setupLiveRepoDevApplet = (app, {serveAppletPage, imports}) => app.get('/applet/:name', async (req, res) => {
  const {name} = req.params, ctx = new coreUtils.Ctx().setVars({db: 'fs'})
  await coreUtils.resolveDeveloperEntryPoint(ctx).then(entryPoint => import(entryPoint)).catch(() => null)
  const comp = coreUtils.compByFullId(`react-comp<react>${name}`)
  const urlsToLoad = comp?.$location.path
    .replace(/^.*\/wonder\//, '@wonder/').replace(/^.*\/solutions\//, '@solution/').replace(/^.*\/indiviai\//, '@indiviai/')
  if (!urlsToLoad || urlsToLoad.startsWith('/')) return res.status(404).json({error:
    `no servable react-comp<react>${name} reachable from ${jb.coreRegistry.developerEntryPoint}`})
  console.log(`[dev applet] react-comp<react>${name} from ${urlsToLoad} (derived spec - not published)`)
  await serveAppletPage({cmpId: name, urlsToLoad, roomWUrl: 'room://dev', noAuth: true,
    runtimeVars: {db: 'fs', onLiveRepo: true, noAuth: true}}, res, imports)
})
