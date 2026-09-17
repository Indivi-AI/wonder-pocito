import { jb, coreUtils } from '@jb6/core'
import '@jb6/lang-service'
import '@wonder/db/db-drivers-live-repo.js'
import { repoLayout } from '@wonder/db/repo-layout.js'

export const liveRepoSourceImports = async (profile, ctx) => {
  await import(await coreUtils.resolveDeveloperEntryPoint(ctx))
  return coreUtils.calcImportsForProfile(profile, { entryPointPaths: [jb.coreRegistry.developerEntryPoint], ctx })
}

const appletFromEntryPoint = async (name, ctx) => {
  await import(await coreUtils.resolveDeveloperEntryPoint(ctx))
  const path = coreUtils.compByFullId(`react-comp<react>${name}`)?.$location.path
  const urlsToLoad = path && (await repoLayout()).toImportUrl(path)
  return urlsToLoad && {cmpId: name, urlsToLoad}
}

export const setupLiveRepoRoomApplet = (app, {serveAppletPage, imports}) => app.get('/room/:roomId/applet/:name', async (req, res) => {
  const {roomId, name} = req.params, roomWUrl = `room://${roomId}`, ctx = new coreUtils.Ctx().setVars({db: 'fs'})
  const readDef = async path => {
    const response = await jb.wonderUtils.wfetch2(`${roomWUrl}/${path}`, {method: 'GET'}, ctx)
    return response.ok ? response.json() : null
  }
  const applet = await readDef(`applets/${name}.json`) || await appletFromEntryPoint(name, ctx)
  if (!applet) return res.status(404).json({error:
    `no local applet def or registered react-comp<react>${name} reachable from ${jb.coreRegistry.developerEntryPoint}`})
  await serveAppletPage({...applet, roomWUrl, noAuth: true, runtimeVars: {db: 'fs', onLiveRepo: true, noAuth: true},
    og: [await readDef('admin/branding.json'), applet.og]}, res, imports)
})

// room-less dev twin: GET /applet/:name serves any react-comp reachable from the developer entry point - spec derived
// from the comp itself, no def file, no published appletV. room://dev (files/rooms/dev) backs persistence and the noAuth gate.
export const setupLiveRepoDevApplet = (app, {serveAppletPage, imports}) => app.get('/applet/:name', async (req, res) => {
  const {name} = req.params, ctx = new coreUtils.Ctx().setVars({db: 'fs'})
  const applet = await appletFromEntryPoint(name, ctx)
  if (!applet) return res.status(404).json({error:
    `no servable react-comp<react>${name} reachable from ${jb.coreRegistry.developerEntryPoint}`})
  console.log(`[dev applet] react-comp<react>${name} from ${applet.urlsToLoad} (derived spec - not published)`)
  await serveAppletPage({...applet, roomWUrl: 'room://dev', noAuth: true,
    runtimeVars: {db: 'fs', onLiveRepo: true, noAuth: true}}, res, imports)
})
