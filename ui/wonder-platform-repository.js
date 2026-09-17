import { dsls } from '@jb6/core'
import '@wonder/db/db-drivers.js'
import '@wonder/db/db-drivers-s3-minio.js'
import './wonder-platform-domain.js'
import './wonder-platform-skills.js'

const { common: { Data, data: { wFetch, wonderPlatformListSkills, wonderPlatformNormalize, wonderPlatformSeed } } } = dsls

Data('wonderPlatformLoadRepository', {
  params: [
    {id: 'roomWUrl', as: 'string', mandatory: true},
    {id: 'seed', dynamic: true, defaultValue: wonderPlatformSeed()},
    {id: 'read', dynamic: true, defaultValue: wFetch('%$repositoryUrl%')},
    {id: 'write', dynamic: true, defaultValue: wFetch('%$repositoryUrl%', {method: 'PUT', body: '%$repo%'})},
    {id: 'loadSkills', dynamic: true, defaultValue: wonderPlatformListSkills('%$roomWUrl%')},
    {id: 'normalize', dynamic: true, defaultValue: wonderPlatformNormalize('%$stored%', '%$seed%')}
  ],
  impl: async (ctx, {}, {roomWUrl, seed, read, write, loadSkills, normalize}) => {
    const runCtx = ctx.setVars({repositoryUrl: `${roomWUrl.replace(/\/$/, '')}/usersRW/wonder-platform/assets`})
    const seedRepo = seed(runCtx), [stored, skills] = await Promise.all([read(runCtx), loadSkills(runCtx.setVars({roomWUrl}))])
    const repo = {...normalize(runCtx.setVars({seed: seedRepo, stored})), skills}
    if (!stored || stored.version != repo.version) await write(runCtx.setVars({repo}))
    return repo
  }
})

Data('wonderPlatformSaveRepository', {
  params: [
    {id: 'roomWUrl', as: 'string', mandatory: true},
    {id: 'repo', as: 'object', mandatory: true},
    {id: 'write', dynamic: true, defaultValue: wFetch('%$repositoryUrl%', {method: 'PUT', body: '%$repo%'})}
  ],
  impl: (ctx, {}, {roomWUrl, repo, write}) => write(ctx.setVars({repo,
    repositoryUrl: `${roomWUrl.replace(/\/$/, '')}/usersRW/wonder-platform/assets`}))
})
